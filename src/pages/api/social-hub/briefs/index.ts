export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs, shGeneratedCopy } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { loadSource } from '@/lib/sh-source-loader';
import { matchKbEntries } from '@/lib/sh-kb-matcher';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VIRAL_ENGINE_MARKER = '[[VIRAL_ENGINE_META_V1]]';
const VIRAL_ENGINE_MARKER_END = '[[/VIRAL_ENGINE_META_V1]]';

type ViralEngineMode = 'default' | 'personalized';

type ViralEngineSnapshot = {
  enabled: boolean;
  mode: ViralEngineMode;
  personalization: string | null;
  appliedTo: 'written' | 'video';
  contentFormat: string;
  pcm: {
    profile: string | null;
    fivePoint: {
      coreAudienceState: string;
      dominantNeed: string;
      communicationStyle: string;
      toneAndLanguage: string;
      ctaStyle: string;
    } | null;
  };
  video: {
    selectedFormat: string | null;
    allowedFormats: string[];
  };
};

function asBoolean(value: any, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function asOptionalString(value: any): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function normalizeViralEngineMode(value: any): ViralEngineMode {
  return value === 'personalized' ? 'personalized' : 'default';
}

function normalizeViralEnginePayload(body: any, outputFormat: string): ViralEngineSnapshot {
  const nested = body?.viralEngine ?? {};
  const enabled = asBoolean(body?.viralEngineEnabled ?? nested.enabled, true);
  const mode = normalizeViralEngineMode(body?.viralEngineMode ?? nested.mode);
  const personalization = asOptionalString(
    body?.viralEnginePersonalization ??
    nested.personalization ??
    nested.personalizationNotes ??
    nested.notes,
  );

  const pcmProfile = asOptionalString(
    body?.pcmProfileOverride ??
    nested.pcmProfileOverride ??
    nested.written?.defaultPcmProfile ??
    nested.written?.pcmProfile ??
    nested.pcmProfile,
  );

  const allowedFormats = [
    ...asStringArray(nested.video?.allowedFormats),
    ...asStringArray(nested.video?.defaultFormats),
  ];

  const selectedFormat =
    asOptionalString(body?.videoFormatSlug ?? nested.videoFormatSlug ?? nested.video?.preferredPrimaryFormat) ??
    null;

  const appliedTo = outputFormat === 'video' ? 'video' : 'written';

  return {
    enabled,
    mode,
    personalization,
    appliedTo,
    contentFormat: outputFormat,
    pcm: {
      profile: pcmProfile,
      fivePoint: appliedTo === 'written'
        ? {
            coreAudienceState: asOptionalString(nested.written?.coreAudienceState) ?? 'Aligned with source intent',
            dominantNeed: asOptionalString(nested.written?.dominantNeed) ?? 'Clarity and relevance',
            communicationStyle: asOptionalString(nested.written?.communicationStyle) ?? 'Plain, direct, high-signal',
            toneAndLanguage: asOptionalString(nested.written?.toneAndLanguage) ?? 'Brand-safe, concise, human',
            ctaStyle: asOptionalString(nested.written?.ctaStyle) ?? 'Low-friction invitation',
          }
        : null,
    },
    video: {
      selectedFormat,
      allowedFormats,
    },
  };
}

function encodeSuggestionPrompt(suggestionPrompt: string | null | undefined, viralEngine: ViralEngineSnapshot): string {
  const userPrompt = asOptionalString(suggestionPrompt);
  const meta = JSON.stringify(viralEngine, null, 2);
  const payload = `${VIRAL_ENGINE_MARKER}\n${meta}\n${VIRAL_ENGINE_MARKER_END}`;
  return userPrompt ? `${userPrompt}\n\n${payload}` : payload;
}

function parseSuggestionPrompt(value: string | null | undefined): { prompt: string | null; viralEngine: ViralEngineSnapshot | null } {
  if (!value) return { prompt: null, viralEngine: null };

  const start = value.lastIndexOf(VIRAL_ENGINE_MARKER);
  const end = value.lastIndexOf(VIRAL_ENGINE_MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    return { prompt: value, viralEngine: null };
  }

  const before = value.slice(0, start).trim();
  const raw = value.slice(start + VIRAL_ENGINE_MARKER.length, end).trim();

  try {
    const viralEngine = JSON.parse(raw) as ViralEngineSnapshot;
    return { prompt: before || null, viralEngine };
  } catch {
    return { prompt: value, viralEngine: null };
  }
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const status = url.searchParams.get('status') || '';
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const conditions = status ? [eq(shContentBriefs.status, status)] : [];

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch briefs with total count
    const [briefs, countResult] = await Promise.all([
      db
        .select()
        .from(shContentBriefs)
        .where(whereClause)
        .orderBy(desc(shContentBriefs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(shContentBriefs)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    // Fetch first generated copy for each brief (variant_index = 0 or min)
    const briefIds = briefs.map(b => b.id);
    let firstCopyByBriefId: Record<number, typeof shGeneratedCopy.$inferSelect> = {};

    if (briefIds.length > 0) {
      // Fetch all copy rows for these briefs ordered by variantIndex asc, then pick first per brief
      const copies = await db
        .select()
        .from(shGeneratedCopy)
        .where(inArray(shGeneratedCopy.briefId, briefIds))
        .orderBy(shGeneratedCopy.briefId, shGeneratedCopy.variantIndex);

      for (const copy of copies) {
        if (!(copy.briefId in firstCopyByBriefId)) {
          firstCopyByBriefId[copy.briefId] = copy;
        }
      }
    }

    const results = briefs.map(brief => ({
      ...brief,
      ...parseSuggestionPrompt(brief.suggestionPrompt),
      firstGeneratedCopy: firstCopyByBriefId[brief.id] ?? null,
    }));

    return new Response(
      JSON.stringify({ results, total, offset, limit }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Briefs GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const {
    sourceType,
    sourceId,
    suggestionPrompt,
    outputFormat,
    targetPlatforms,
    targetAccountIds,
  } = body;

  if (!sourceType || sourceId == null || !outputFormat) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sourceType, sourceId, outputFormat' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (!Array.isArray(targetPlatforms) || !Array.isArray(targetAccountIds)) {
    return new Response(
      JSON.stringify({ error: 'targetPlatforms and targetAccountIds must be arrays' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    // Load source data
    const source = await loadSource(sourceType, Number(sourceId));
    if (!source) {
      return new Response(
        JSON.stringify({ error: `Source not found: ${sourceType} #${sourceId}` }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    // Match relevant KB entries
    const kbMatches = await matchKbEntries(source.content, 3);
    const kbEntriesUsed = kbMatches.map((e: any) => e.id);
    const viralEngine = normalizeViralEnginePayload(body, String(outputFormat));
    const encodedSuggestionPrompt = encodeSuggestionPrompt(suggestionPrompt, viralEngine);

    // Insert brief
    const [created] = await db
      .insert(shContentBriefs)
      .values({
        sourceType,
        sourceId: Number(sourceId),
        sourceTitle: source.title,
        sourceSnapshot: source.content,
        suggestionPrompt: encodedSuggestionPrompt,
        outputFormat,
        targetPlatforms,
        targetAccountIds,
        kbEntriesUsed,
        brandVoiceUsed: true,
        viralEngineEnabled: viralEngine.enabled,
        viralEngineMode: viralEngine.mode,
        viralEngineProfile: viralEngine as any,
        videoFormatSlug: viralEngine.video.selectedFormat,
        status: 'draft',
        updatedAt: new Date(),
      })
      .returning();

    return new Response(
      JSON.stringify({
        ...created,
        prompt: parseSuggestionPrompt(created.suggestionPrompt).prompt,
        viralEngine,
      }),
      { status: 201, headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Briefs POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
