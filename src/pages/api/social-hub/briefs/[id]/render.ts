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

      const effectiveAspectRatio = (template?.aspectRatio as '1:1' | '9:16' | '16:9') ?? '1:1';
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
      })
      .returning();

    return new Response(
      JSON.stringify({ ok: true, status: 'rendering', assetId: asset.id }),
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

