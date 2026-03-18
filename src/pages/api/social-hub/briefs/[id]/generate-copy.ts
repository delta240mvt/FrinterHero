export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs } from '@/db/schema';
import { shCopywriterJob } from '@/lib/sh-copywriter-job';
import { getShSettings, buildShEnv, buildShViralEngineRuntimeFromSettings } from '@/lib/sh-settings';
import {
  WRITTEN_PCM_PROFILE_KEYS,
  buildShViralEngineEnv,
  normalizeShViralEngineConfig,
  type ShViralEngineConfig,
  type VideoFormatSlug,
  type WrittenPcmProfileKey,
} from '@/lib/sh-viral-engine-types';
import { eq } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const VIRAL_ENGINE_MARKER = '[[VIRAL_ENGINE_META_V1]]';
const VIRAL_ENGINE_MARKER_END = '[[/VIRAL_ENGINE_META_V1]]';

type LegacyViralEngineSnapshot = {
  enabled: boolean;
  mode: 'default' | 'personalized';
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

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isWrittenPcmProfileKey(value: string | null): value is WrittenPcmProfileKey {
  return Boolean(value) && WRITTEN_PCM_PROFILE_KEYS.includes(value as WrittenPcmProfileKey);
}

function isVideoFormatSlug(value: string | null): value is VideoFormatSlug {
  return Boolean(value) && (['talking_head_authority', 'problem_agitation_solution', 'storytime_confession', 'contrarian_hot_take', 'listicle_fast_cuts', 'myth_vs_reality', 'screen_demo_explainer', 'ugc_testimonial_style'] as const).includes(value as VideoFormatSlug);
}

function parseLegacySuggestionPrompt(value: string | null | undefined): { prompt: string | null; viralEngine: LegacyViralEngineSnapshot | null } {
  if (!value) return { prompt: null, viralEngine: null };

  const start = value.lastIndexOf(VIRAL_ENGINE_MARKER);
  const end = value.lastIndexOf(VIRAL_ENGINE_MARKER_END);
  if (start === -1 || end === -1 || end <= start) {
    return { prompt: value, viralEngine: null };
  }

  const prompt = value.slice(0, start).trim() || null;
  const raw = value.slice(start + VIRAL_ENGINE_MARKER.length, end).trim();

  try {
    return {
      prompt,
      viralEngine: JSON.parse(raw) as LegacyViralEngineSnapshot,
    };
  } catch {
    return { prompt: value, viralEngine: null };
  }
}

function buildLegacyViralEngineOverride(
  snapshot: LegacyViralEngineSnapshot | null,
  outputFormat: string,
): Partial<ShViralEngineConfig> | null {
  if (!snapshot) return null;

  const isVideo = outputFormat === 'video';
  const selectedFormat = asOptionalString(snapshot.video?.selectedFormat);
  const pcmProfile = asOptionalString(snapshot.pcm?.profile);
  const fivePoint = snapshot.pcm?.fivePoint;
  const resolvedPcmProfile: WrittenPcmProfileKey = isWrittenPcmProfileKey(pcmProfile) ? pcmProfile : 'harmonizer';
  const resolvedVideoFormat: VideoFormatSlug = isVideoFormatSlug(selectedFormat) ? selectedFormat : 'talking_head_authority';
  const allowedFormats = (snapshot.video?.allowedFormats ?? [])
    .map((format) => asOptionalString(format))
    .filter(isVideoFormatSlug);

  const override: Partial<ShViralEngineConfig> = {
    enabled: snapshot.enabled,
    mode: snapshot.mode,
    personalizationLabel: snapshot.personalization ? 'legacy-brief-personalization' : '',
    personalizationNotes: snapshot.personalization ?? '',
    written: {
      enabled: !isVideo,
      pcmProfileMode: pcmProfile ? 'manual' : 'auto',
      defaultPcmProfile: resolvedPcmProfile,
      enforceFivePoints: Boolean(fivePoint),
      hookIntensity: 'medium',
      ctaIntensity: 'medium',
      additionalRules: fivePoint
        ? [
            fivePoint.coreAudienceState,
            fivePoint.dominantNeed,
            fivePoint.communicationStyle,
            fivePoint.toneAndLanguage,
            fivePoint.ctaStyle,
          ].filter(Boolean)
        : [],
    },
    video: {
      enabled: isVideo,
      formatMode: selectedFormat ? 'manual' : 'auto',
      defaultFormats: allowedFormats.length > 0 ? allowedFormats : [resolvedVideoFormat],
      preferredPrimaryFormat: resolvedVideoFormat,
      pacing: 'medium',
      visualDensity: 'medium',
      additionalRules: allowedFormats,
    },
  };

  return override;
}

function buildViralEnginePromptBlock(runtime: ReturnType<typeof buildShViralEngineRuntimeFromSettings>) {
  return [
    VIRAL_ENGINE_MARKER,
    JSON.stringify({
      enabled: runtime.config.enabled,
      mode: runtime.config.mode,
      allowPersonalization: runtime.config.allowPersonalization,
      personalizationLabel: runtime.config.personalizationLabel,
      personalizationNotes: runtime.config.personalizationNotes,
      sourceType: runtime.context.sourceType ?? null,
      outputFormat: runtime.context.outputFormat ?? null,
      briefId: runtime.context.briefId ?? null,
      written: runtime.config.written,
      video: runtime.config.video,
    }, null, 2),
    VIRAL_ENGINE_MARKER_END,
  ].join('\n');
}

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  if (shCopywriterJob.isRunning()) {
    return new Response(
      JSON.stringify({ error: 'Copywriter already running', status: 'running' }),
      { status: 409, headers: JSON_HEADERS },
    );
  }

  const settings = await getShSettings();
  const [brief] = await db
    .select()
    .from(shContentBriefs)
    .where(eq(shContentBriefs.id, briefId))
    .limit(1);

  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404, headers: JSON_HEADERS });
  }

  const legacyPrompt = parseLegacySuggestionPrompt(brief.suggestionPrompt);
  const outputFormat = String(brief.outputFormat || 'text');
  const viralEngineProfileFromDbRaw = (brief as any).viralEngineProfile ?? (brief as any).viral_engine_profile;
  const viralEngineProfileFromDb = viralEngineProfileFromDbRaw
    ? normalizeShViralEngineConfig(viralEngineProfileFromDbRaw)
    : null;
  const viralEngineProfileFromLegacy = buildLegacyViralEngineOverride(legacyPrompt.viralEngine, outputFormat);
  const viralEngineOverride = viralEngineProfileFromDb ?? viralEngineProfileFromLegacy ?? null;
  const runtime = buildShViralEngineRuntimeFromSettings(
    settings,
    viralEngineOverride,
    {
      scope: 'brief',
      sourceType: String(brief.sourceType || ''),
      outputFormat,
      briefId,
    },
  );

  const sanitizedSuggestionPrompt = legacyPrompt.prompt ?? brief.suggestionPrompt ?? '';
  const persistedViralEnginePrompt = buildViralEnginePromptBlock(runtime);
  const expectedVideoFormatSlug = outputFormat === 'video'
    ? (runtime.selectedVideoFormatSlug as VideoFormatSlug)
    : (brief.videoFormatSlug ?? null);
  const needsViralEngineSync =
    Boolean(legacyPrompt.viralEngine) ||
    sanitizedSuggestionPrompt !== (brief.suggestionPrompt ?? '') ||
    !brief.viralEnginePrompt ||
    !viralEngineProfileFromDb;

  if (needsViralEngineSync) {
    await db
      .update(shContentBriefs)
      .set({
        suggestionPrompt: sanitizedSuggestionPrompt,
        viralEngineEnabled: runtime.config.enabled,
        viralEngineMode: runtime.config.mode,
        viralEngineProfile: runtime.config,
        viralEnginePrompt: persistedViralEnginePrompt,
        videoFormatSlug: expectedVideoFormatSlug,
        updatedAt: new Date(),
      })
      .where(eq(shContentBriefs.id, briefId));
  }

  const extraEnv: Record<string, string> = {
    ...buildShEnv(settings),
    ...buildShViralEngineEnv(runtime),
    SH_BRIEF_ID: String(briefId),
    SH_VIRAL_ENGINE_SOURCE_TYPE: String(brief.sourceType || ''),
    SH_VIRAL_ENGINE_OUTPUT_FORMAT: outputFormat,
    SH_VIRAL_ENGINE_SCOPE: 'brief',
    SH_VIRAL_ENGINE_BRIEF_ID: String(briefId),
  };

  const result = shCopywriterJob.start(briefId, extraEnv);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, status: 'started', briefId }), { headers: JSON_HEADERS });
};
