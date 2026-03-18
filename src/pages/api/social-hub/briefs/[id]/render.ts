export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs, shGeneratedCopy, shMediaAssets, shTemplates } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { renderSocialImage } from '@/lib/sh-image-gen';
import { getShSettings, buildShEnv } from '@/lib/sh-settings';
import { shVideoJob } from '@/lib/sh-video-job';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const VIDEO_FORMAT_SLUGS = [
  'talking_head_authority',
  'problem_agitation_solution',
  'storytime_confession',
  'contrarian_hot_take',
  'listicle_fast_cuts',
  'myth_vs_reality',
  'screen_demo_explainer',
  'ugc_testimonial_style',
] as const;

type VideoFormatSlug = typeof VIDEO_FORMAT_SLUGS[number];
type ShViralEngineConfig = Record<string, any>;

type ViralEngineMarkerShape = {
  enabled?: boolean;
  mode?: string;
  allowPersonalization?: boolean;
  personalizationLabel?: string;
  personalizationNotes?: string;
  written?: {
    enabled?: boolean;
    pcmProfileMode?: string;
    defaultPcmProfile?: string;
    enforceFivePoints?: boolean;
    hookIntensity?: string;
    ctaIntensity?: string;
    additionalRules?: string;
  };
  video?: {
    enabled?: boolean;
    formatMode?: string;
    allowedFormats?: string[];
    defaultFormats?: string[];
    preferredPrimaryFormat?: string;
    selectedFormat?: string;
    pacing?: string;
    visualDensity?: string;
    additionalRules?: string;
  };
};

function parseViralEngineMarker(suggestionPrompt?: string | null): ViralEngineMarkerShape | null {
  if (!suggestionPrompt) return null;
  const markerStart = '[[VIRAL_ENGINE_META_V1]]';
  const markerEnd = '[[/VIRAL_ENGINE_META_V1]]';
  const start = suggestionPrompt.lastIndexOf(markerStart);
  const end = suggestionPrompt.lastIndexOf(markerEnd);
  if (start === -1 || end === -1 || end <= start) return null;

  const rawJson = suggestionPrompt.slice(start + markerStart.length, end).trim();
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson) as ViralEngineMarkerShape;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function isValidVideoFormatSlug(value?: string | null): value is VideoFormatSlug {
  return !!value && (VIDEO_FORMAT_SLUGS as readonly string[]).includes(value);
}

function buildViralEngineConfigFromBrief(brief: any, outputFormat: 'image' | 'video', videoFormatSlug?: string | null): ShViralEngineConfig | null {
  const fromColumns = brief?.viralEngineProfile ?? null;
  const fromMarker = parseViralEngineMarker(brief?.suggestionPrompt);

  if (fromColumns) {
    return {
      ...fromColumns,
      enabled: brief?.viralEngineEnabled ?? fromColumns.enabled,
      mode: brief?.viralEngineMode ?? fromColumns.mode,
      personalizationNotes: brief?.viralEnginePrompt ?? fromColumns.personalizationNotes ?? '',
      written: {
        ...(fromColumns.written ?? {}),
        enabled: outputFormat === 'video' ? false : (fromColumns.written?.enabled ?? true),
      },
      video: {
        ...(fromColumns.video ?? {}),
        enabled: outputFormat === 'video' ? (fromColumns.video?.enabled ?? true) : false,
        preferredPrimaryFormat: (videoFormatSlug ?? fromColumns.video?.preferredPrimaryFormat ?? 'talking_head_authority') as VideoFormatSlug,
        defaultFormats: videoFormatSlug
          ? Array.from(new Set([videoFormatSlug, ...(fromColumns.video?.defaultFormats ?? [])]))
          : (fromColumns.video?.defaultFormats ?? []),
      },
    };
  }

  if (!fromMarker && !brief?.viralEngineEnabled && !brief?.viralEnginePrompt && !brief?.videoFormatSlug) {
    return null;
  }

  const fallbackVideoFormat =
    (isValidVideoFormatSlug(videoFormatSlug) && videoFormatSlug)
    || (isValidVideoFormatSlug(fromMarker?.video?.selectedFormat) && fromMarker?.video?.selectedFormat)
    || (isValidVideoFormatSlug(fromMarker?.video?.preferredPrimaryFormat) && fromMarker?.video?.preferredPrimaryFormat)
    || 'talking_head_authority';
  const config: ShViralEngineConfig = {
    enabled: brief?.viralEngineEnabled ?? fromMarker?.enabled ?? false,
    mode: brief?.viralEngineMode ?? fromMarker?.mode ?? 'default',
    allowPersonalization: fromMarker?.allowPersonalization ?? false,
    personalizationLabel: fromMarker?.personalizationLabel ?? '',
    personalizationNotes: brief?.viralEnginePrompt ?? fromMarker?.personalizationNotes ?? '',
    written: {
      enabled: outputFormat !== 'video',
      pcmProfileMode: (fromMarker?.written?.pcmProfileMode as 'manual' | 'auto') ?? 'manual',
      defaultPcmProfile: (fromMarker?.written?.defaultPcmProfile as any) ?? 'harmonizer',
      enforceFivePoints: fromMarker?.written?.enforceFivePoints ?? true,
      hookIntensity: (fromMarker?.written?.hookIntensity as any) ?? 'medium',
      ctaIntensity: (fromMarker?.written?.ctaIntensity as any) ?? 'medium',
      additionalRules: fromMarker?.written?.additionalRules ?? brief?.viralEnginePrompt ?? '',
    },
    video: {
      enabled: outputFormat === 'video',
      formatMode: (fromMarker?.video?.formatMode as 'manual' | 'auto') ?? 'manual',
      defaultFormats: (() => {
        const formats = toStringArray(fromMarker?.video?.defaultFormats ?? fromMarker?.video?.allowedFormats).filter(isValidVideoFormatSlug);
        if (formats.length > 0) return formats;
        return isValidVideoFormatSlug(videoFormatSlug) ? [videoFormatSlug] : [];
      })(),
      preferredPrimaryFormat: fallbackVideoFormat,
      pacing: (fromMarker?.video?.pacing as any) ?? 'medium',
      visualDensity: (fromMarker?.video?.visualDensity as any) ?? 'medium',
      additionalRules: fromMarker?.video?.additionalRules ?? brief?.viralEnginePrompt ?? '',
    },
  };

  return {
    ...config,
    video: {
      ...config.video,
      preferredPrimaryFormat: fallbackVideoFormat,
      defaultFormats: Array.from(new Set([fallbackVideoFormat, ...config.video.defaultFormats])),
    },
  };
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  let body: { copyId: number; templateSlug?: string; format: 'image' | 'video' };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  const { copyId, templateSlug, format } = body;

  if (!copyId || !format) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: copyId, format' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (format !== 'image' && format !== 'video') {
    return new Response(
      JSON.stringify({ error: 'format must be "image" or "video"' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    // Verify brief exists
    const [brief] = await db
      .select()
      .from(shContentBriefs)
      .where(eq(shContentBriefs.id, briefId))
      .limit(1);

    if (!brief) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404, headers: JSON_HEADERS });
    }

    // Load copy record
    const [copy] = await db
      .select()
      .from(shGeneratedCopy)
      .where(eq(shGeneratedCopy.id, copyId))
      .limit(1);

    if (!copy) {
      return new Response(JSON.stringify({ error: 'Copy record not found' }), { status: 404, headers: JSON_HEADERS });
    }

    const resolvedVideoFormatSlug = format === 'video'
      ? ((isValidVideoFormatSlug(brief.videoFormatSlug) && brief.videoFormatSlug) || (isValidVideoFormatSlug(body.templateSlug) && body.templateSlug) || null)
      : ((isValidVideoFormatSlug(brief.videoFormatSlug) && brief.videoFormatSlug) || null);
    const viralEngineSnapshot = buildViralEngineConfigFromBrief(brief, format, resolvedVideoFormatSlug);

    // ── IMAGE path ───────────────────────────────────────────────────────────
    if (format === 'image') {
      const resolvedSlug = templateSlug ?? 'retro-quote-card';

      // Load template (fallback to default slug if not found)
      let template = await db
        .select()
        .from(shTemplates)
        .where(eq(shTemplates.slug, resolvedSlug))
        .limit(1)
        .then(rows => rows[0] ?? null);

      if (!template) {
        // Fall back to default template
        template = await db
          .select()
          .from(shTemplates)
          .where(eq(shTemplates.slug, 'retro-quote-card'))
          .limit(1)
          .then(rows => rows[0] ?? null);
      }

      const effectiveAspectRatio = (template?.aspectRatio as '1:1' | '9:16' | '16:9' | '3:4') ?? '1:1';
      const effectiveSlug = template?.slug ?? 'retro-quote-card';

      // Render image
      const result = await renderSocialImage({
        hookLine: copy.hookLine,
        bodyText: copy.bodyText,
        hashtags: (copy.hashtags as string[]) ?? [],
        templateSlug: effectiveSlug,
        aspectRatio: effectiveAspectRatio,
      });

      // Convert PNG buffer to base64 data URL
      const base64 = result.buffer.toString('base64');
      const mediaUrl = `data:image/png;base64,${base64}`;

      // Insert media asset record
      const [asset] = await db
        .insert(shMediaAssets)
        .values({
          briefId,
          copyId,
          templateId: template?.id ?? null,
          type: 'image',
          mediaUrl,
          width: result.width,
          height: result.height,
          videoFormatSlug: brief.videoFormatSlug ?? null,
          viralEngineSnapshot: viralEngineSnapshot as any,
          status: 'completed',
        })
        .returning();

      // Update brief status to render_review
      await db
        .update(shContentBriefs)
        .set({ status: 'render_review', updatedAt: new Date() })
        .where(eq(shContentBriefs.id, briefId));

      return new Response(
        JSON.stringify({
          ok: true,
          assetId: asset.id,
          mediaUrl,
          width: result.width,
          height: result.height,
          videoFormatSlug: brief.videoFormatSlug ?? null,
          viralEngineSnapshot,
        }),
        { headers: JSON_HEADERS },
      );
    }

    // ── VIDEO path ───────────────────────────────────────────────────────────
    const settings = await getShSettings();

    const extraEnv: Record<string, string> = {
      ...buildShEnv(settings),
      SH_BRIEF_ID: String(briefId),
      SH_COPY_ID: String(copyId),
      SH_AVATAR_URL: settings.avatarImageUrl,
      SH_VIDEO_MODEL: settings.videoModel,
      SH_TTS_PROVIDER: settings.ttsProvider,
      SH_VIDEO_FORMAT_SLUG: String(resolvedVideoFormatSlug ?? ''),
    };

    const startResult = shVideoJob.start(briefId, copyId, extraEnv);
    if (!startResult.ok) {
      return new Response(
        JSON.stringify({ error: startResult.reason ?? 'Video job failed to start' }),
        { status: 409, headers: JSON_HEADERS },
      );
    }

    // Insert media asset record with rendering status
    const [asset] = await db
      .insert(shMediaAssets)
      .values({
        briefId,
        copyId,
        type: 'video',
        status: 'rendering',
        renderProvider: settings.videoProvider,
        renderModel: settings.videoModel,
        videoFormatSlug: resolvedVideoFormatSlug,
        viralEngineSnapshot: viralEngineSnapshot as any,
      })
      .returning();

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'rendering',
        assetId: asset.id,
        videoFormatSlug: resolvedVideoFormatSlug,
        viralEngineSnapshot,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Render POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── PUT: approve a rendered media asset ──────────────────────────────────────
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  let body: { assetId?: number; action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  const { assetId, action } = body;

  if (action === 'approve' && assetId) {
    try {
      await db
        .update(shMediaAssets)
        .set({ status: 'completed' })
        .where(and(eq(shMediaAssets.id, assetId), eq(shMediaAssets.briefId, briefId)));

      await db
        .update(shContentBriefs)
        .set({ status: 'done', updatedAt: new Date() })
        .where(eq(shContentBriefs.id, briefId));

      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
    } catch (err) {
      console.error('[SocialHub Render PUT]', err);
      return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
    }
  }

  return new Response(
    JSON.stringify({ error: 'Unknown action or missing assetId. Use: { assetId, action: "approve" }' }),
    { status: 400, headers: JSON_HEADERS },
  );
};
