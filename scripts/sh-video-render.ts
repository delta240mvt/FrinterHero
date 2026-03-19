/**
 * sh-video-render.ts — Spawned as a child process by ShVideoJobManager.
 *
 * Reads configuration from environment variables:
 *   SH_BRIEF_ID, SH_COPY_ID, SH_AVATAR_URL, SH_VIDEO_MODEL,
 *   SH_TTS_PROVIDER, SH_ELEVENLABS_VOICE_ID
 *
 * Output protocol (stdout lines parsed by sh-video-job.ts):
 *   [SH] ...             — human-readable log line
 *   SH_TTS_DONE:         — TTS audio generated successfully
 *   SH_VIDEO_SUBMITTED:{predictionId}
 *   [SH] Polling... attempt N
 *   SH_RENDER_DONE:{videoUrl}
 *   SH_ERROR:{message}   — fatal error (exits 1)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from '../src/db/client';
import { shContentBriefs, shGeneratedCopy, shMediaAssets } from '../src/db/schema';
import { and, eq, isNull, or } from 'drizzle-orm';
import {
  generateTtsAudio,
  buildVideoRenderLogLines,
  uploadAudioBuffer,
  submitToWaveSpeed,
  pollWaveSpeedStatus,
  type VideoRenderContext,
} from '../src/lib/sh-video-gen';
import { getShSettings } from '../src/lib/sh-settings';

// ─── Env ──────────────────────────────────────────────────────────────────────

const SH_BRIEF_ID      = parseInt(process.env.SH_BRIEF_ID || '0', 10);
const SH_COPY_ID       = parseInt(process.env.SH_COPY_ID || '0', 10);
const SITE_ID          = parseInt(process.env.SITE_ID || '0', 10) || null;
const SH_AVATAR_URL    = process.env.SH_AVATAR_URL || '';
const SH_VIDEO_MODEL   = process.env.SH_VIDEO_MODEL || 'wan-2.2-ultra-fast';
const SH_TTS_PROVIDER  = (process.env.SH_TTS_PROVIDER || 'elevenlabs') as 'elevenlabs' | 'kokoro';
const SH_VOICE_ID      = process.env.SH_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

const VIDEO_FORMAT_META: Record<string, { label: string; description: string }> = {
  talking_head_authority: {
    label: 'Talking Head Authority',
    description: 'Ekspercki monolog z wysoką klarownością i jedną mocną tezą.',
  },
  problem_agitation_solution: {
    label: 'Problem Agitation Solution',
    description: 'Najpierw problem i koszt jego ignorowania, potem rozwiązanie.',
  },
  storytime_confession: {
    label: 'Storytime Confession',
    description: 'Osobisty lub founder-led case z wyraźną zmianą perspektywy.',
  },
  contrarian_hot_take: {
    label: 'Contrarian Hot Take',
    description: 'Kontrariański punkt widzenia z szybkim uzasadnieniem.',
  },
  listicle_fast_cuts: {
    label: 'Listicle Fast Cuts',
    description: 'Lista krótkich punktów z szybkim montażem rytmicznym.',
  },
  myth_vs_reality: {
    label: 'Myth vs Reality',
    description: 'Obalenie mitu i podmiana na trafniejszy model.',
  },
  screen_demo_explainer: {
    label: 'Screen Demo Explainer',
    description: 'Demo lub walkthrough pokazujące mechanikę działania.',
  },
  ugc_testimonial_style: {
    label: 'UGC Testimonial Style',
    description: 'Naturalna rekomendacja lub observed use-case w stylu UGC.',
  },
};

function describeVideoFormat(slug: string | null | undefined): { slug: string; label: string; description: string } | null {
  if (!slug) return null;
  const meta = VIDEO_FORMAT_META[slug];
  if (meta) return { slug, ...meta };
  return {
    slug,
    label: slug.replace(/_/g, ' '),
    description: 'Custom or unknown format slug from brief settings.',
  };
}

function log(msg: string) {
  process.stdout.write(`[SH] ${msg}\n`);
}

function fatal(msg: string): never {
  process.stdout.write(`SH_ERROR:${msg}\n`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!SH_BRIEF_ID) fatal('SH_BRIEF_ID is required');
  if (!SH_COPY_ID)  fatal('SH_COPY_ID is required');

  // 1. Load shGeneratedCopy record
  const [copyRow] = await db
    .select()
    .from(shGeneratedCopy)
    .where(and(eq(shGeneratedCopy.id, SH_COPY_ID), SITE_ID ? or(eq(shGeneratedCopy.siteId, SITE_ID), isNull(shGeneratedCopy.siteId)) : undefined));

  if (!copyRow) fatal(`shGeneratedCopy id=${SH_COPY_ID} not found`);

  const videoScript = copyRow.videoScript ?? `${copyRow.hookLine}\n\n${copyRow.bodyText}`;
  if (!videoScript.trim()) fatal('videoScript is empty — cannot generate TTS');

  const [briefRow] = await db
    .select()
    .from(shContentBriefs)
    .where(and(eq(shContentBriefs.id, SH_BRIEF_ID), SITE_ID ? or(eq(shContentBriefs.siteId, SITE_ID), isNull(shContentBriefs.siteId)) : undefined));

  if (!briefRow) fatal(`shContentBriefs id=${SH_BRIEF_ID} not found`);
  const resolvedSiteId = briefRow.siteId ?? copyRow.siteId ?? SITE_ID;

  // 2. Resolve avatar image URL (env override or from ShSettings)
  const settings = await getShSettings(resolvedSiteId);

  const selectedVideoFormatSlug =
    copyRow.videoFormatSlug ??
    briefRow.videoFormatSlug ??
    settings.viralEngine?.video?.preferredPrimaryFormat ??
    null;

  const selectedVideoFormat = describeVideoFormat(selectedVideoFormatSlug);

  const renderContext: VideoRenderContext = {
    briefId: SH_BRIEF_ID,
    copyId: SH_COPY_ID,
    outputFormat: briefRow.outputFormat,
    videoFormatSlug: selectedVideoFormat?.slug ?? selectedVideoFormatSlug,
    videoFormatLabel: selectedVideoFormat?.label ?? selectedVideoFormatSlug ?? null,
    videoFormatDescription: selectedVideoFormat?.description ?? null,
    viralEngineEnabled: Boolean(briefRow.viralEngineEnabled ?? settings.viralEngine.enabled),
    viralEngineMode: String(briefRow.viralEngineMode ?? settings.viralEngine.mode),
    promptLabel: briefRow.viralEngineEnabled ? String(briefRow.viralEngineMode ?? 'default') : 'disabled',
    pacing: settings.viralEngine.video.pacing,
    visualDensity: settings.viralEngine.video.visualDensity,
  };

  for (const line of buildVideoRenderLogLines(renderContext)) {
    log(line.replace(/^\[SH\]\s?/, ''));
  }

  let avatarImageUrl = SH_AVATAR_URL;
  if (!avatarImageUrl) {
    log('SH_AVATAR_URL not set — loading from ShSettings');
    avatarImageUrl = settings.avatarImageUrl;
  }
  if (!avatarImageUrl) fatal('avatarImageUrl is required — set SH_AVATAR_URL or configure it in Social Hub settings');

  // 3. TTS
  log('Starting TTS...');
  let audioBuffer: Buffer;
  try {
    audioBuffer = await generateTtsAudio(videoScript, SH_VOICE_ID);
  } catch (e: any) {
    fatal(`TTS generation failed: ${e.message}`);
  }
  process.stdout.write('SH_TTS_DONE:\n');

  // 4. Upload audio
  let audioUrl: string;
  try {
    audioUrl = await uploadAudioBuffer(audioBuffer!);
  } catch (e: any) {
    fatal(`Audio upload failed: ${e.message}`);
  }
  log('Audio uploaded');

  // 5. Submit to WaveSpeed
  let predictionId: string;
  try {
    predictionId = await submitToWaveSpeed(audioUrl!, avatarImageUrl, SH_VIDEO_MODEL);
  } catch (e: any) {
    fatal(`WaveSpeed submit failed: ${e.message}`);
  }
  process.stdout.write(`SH_VIDEO_SUBMITTED:${predictionId!}\n`);

  // 6. Poll for completion
  const result = await pollWaveSpeedStatus(predictionId!, 60);

  if (result.status !== 'completed' || !result.videoUrl) {
    fatal(result.error ?? 'WaveSpeed render did not complete');
  }

  const videoUrl = result.videoUrl!;

  // 7. Insert shMediaAssets record
  await db.insert(shMediaAssets).values({
    siteId: resolvedSiteId,
    briefId: SH_BRIEF_ID,
    copyId: SH_COPY_ID,
    type: 'video',
    mediaUrl: videoUrl,
    renderProvider: 'wavespeed',
    renderModel: SH_VIDEO_MODEL,
    videoFormatSlug: selectedVideoFormat?.slug ?? selectedVideoFormatSlug,
    viralEngineSnapshot: (briefRow.viralEngineProfile as any) ?? settings.viralEngine,
    status: 'completed',
  });

  // 8. Update brief status to 'render_review'
  await db
    .update(shContentBriefs)
    .set({
      status: 'render_review',
      videoFormatSlug: selectedVideoFormat?.slug ?? selectedVideoFormatSlug,
      updatedAt: new Date(),
    })
    .where(and(eq(shContentBriefs.id, SH_BRIEF_ID), SITE_ID ? or(eq(shContentBriefs.siteId, SITE_ID), isNull(shContentBriefs.siteId)) : undefined));

  // 9. Done
  process.stdout.write(`SH_RENDER_DONE:${videoUrl}\n`);
}

run().catch((e: any) => {
  process.stdout.write(`SH_ERROR:${e.message ?? String(e)}\n`);
  process.exit(1);
});
