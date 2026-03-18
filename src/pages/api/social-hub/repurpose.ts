export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs, shSocialAccounts } from '@/db/schema';
import { inArray } from 'drizzle-orm';
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

  const { sourceType, sourceId, targetAccountIds } = body ?? {};

  if (!sourceType || sourceId == null) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sourceType, sourceId' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (!Array.isArray(targetAccountIds) || targetAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'targetAccountIds must be a non-empty array' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const parsedAccountIds: number[] = targetAccountIds
    .map((id: any) => parseInt(String(id), 10))
    .filter((id: number) => !isNaN(id) && id > 0);

  if (parsedAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No valid targetAccountIds provided' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    // Load source once — shared snapshot for all 3 briefs
    const source = await loadSource(sourceType, Number(sourceId));
    if (!source) {
      return new Response(
        JSON.stringify({ error: `Source not found: ${sourceType} #${sourceId}` }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    // Resolve account platforms for targetPlatforms array
    const accounts = await db
      .select({ id: shSocialAccounts.id, platform: shSocialAccounts.platform })
      .from(shSocialAccounts)
      .where(inArray(shSocialAccounts.id, parsedAccountIds));

    const platformsForAccounts = [...new Set(accounts.map(a => a.platform))];

    // Match KB entries once — shared across all 3 briefs
    const kbMatches = await matchKbEntries(source.content, 3);
    const kbEntriesUsed = kbMatches.map((e: any) => e.id);
    const viralEngine = normalizeViralEnginePayload(body, 'image');

    // Three brief definitions for the repurpose chain
    const briefDefs = [
      {
        outputFormat: 'image' as const,
        templateSlug: 'retro-quote-card',
        suggestionPrompt: 'Create a retro-style quote card (1:1) highlighting the core insight.',
        videoFormatSlug: null,
      },
      {
        outputFormat: 'image' as const,
        templateSlug: 'pain-point-story',
        suggestionPrompt: 'Create a story-format pain point visual (9:16) for Instagram/TikTok.',
        videoFormatSlug: null,
      },
      {
        outputFormat: 'text' as const,
        templateSlug: null,
        suggestionPrompt: 'Write a short-form text post distilling the key message.',
        videoFormatSlug: null,
      },
    ];

    // Insert all 3 briefs. repurposeGroupId = first brief's id (set after first insert).
    const createdIds: number[] = [];

    for (const def of briefDefs) {
      const [created] = await db
        .insert(shContentBriefs)
        .values({
          sourceType,
          sourceId:          Number(sourceId),
          sourceTitle:       source.title,
          sourceSnapshot:    source.content,
          suggestionPrompt:  encodeSuggestionPrompt(def.suggestionPrompt, {
            ...viralEngine,
            contentFormat: def.outputFormat,
            appliedTo: 'written',
            video: {
              ...viralEngine.video,
              selectedFormat: def.videoFormatSlug,
            },
          }),
          outputFormat:      def.outputFormat,
          targetPlatforms:   platformsForAccounts,
          targetAccountIds:  parsedAccountIds,
          kbEntriesUsed,
          brandVoiceUsed:    true,
          viralEngineEnabled: viralEngine.enabled,
          viralEngineMode: viralEngine.mode,
          viralEngineProfile: {
            ...viralEngine,
            contentFormat: def.outputFormat,
            appliedTo: 'written',
            video: {
              ...viralEngine.video,
              selectedFormat: def.videoFormatSlug,
            },
          } as any,
          videoFormatSlug: def.videoFormatSlug,
          // repurposeGroupId is set to first brief's id; filled in after first insert
          repurposeGroupId:  createdIds.length > 0 ? createdIds[0] : null,
          status:            'draft',
          updatedAt:         new Date(),
        })
        .returning({ id: shContentBriefs.id });

      createdIds.push(created.id);
    }

    // Back-fill repurposeGroupId on first brief now that we know its id
    await db
      .update(shContentBriefs)
      .set({ repurposeGroupId: createdIds[0], updatedAt: new Date() })
      .where(inArray(shContentBriefs.id, [createdIds[0]]));

    return new Response(
      JSON.stringify({
        briefs:            createdIds,
        repurposeGroupId:  createdIds[0],
        viralEngine,
      }),
      { status: 201, headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Repurpose POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
