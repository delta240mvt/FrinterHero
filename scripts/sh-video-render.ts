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
import { eq } from 'drizzle-orm';
import {
  generateTtsAudio,
  uploadAudioBuffer,
  submitToWaveSpeed,
  pollWaveSpeedStatus,
} from '../src/lib/sh-video-gen';
import { getShSettings } from '../src/lib/sh-settings';

// ─── Env ──────────────────────────────────────────────────────────────────────

const SH_BRIEF_ID      = parseInt(process.env.SH_BRIEF_ID || '0', 10);
const SH_COPY_ID       = parseInt(process.env.SH_COPY_ID || '0', 10);
const SH_AVATAR_URL    = process.env.SH_AVATAR_URL || '';
const SH_VIDEO_MODEL   = process.env.SH_VIDEO_MODEL || 'wan-2.2-ultra-fast';
const SH_TTS_PROVIDER  = (process.env.SH_TTS_PROVIDER || 'elevenlabs') as 'elevenlabs' | 'kokoro';
const SH_VOICE_ID      = process.env.SH_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

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
    .where(eq(shGeneratedCopy.id, SH_COPY_ID));

  if (!copyRow) fatal(`shGeneratedCopy id=${SH_COPY_ID} not found`);

  const videoScript = copyRow.videoScript ?? `${copyRow.hookLine}\n\n${copyRow.bodyText}`;
  if (!videoScript.trim()) fatal('videoScript is empty — cannot generate TTS');

  // 2. Resolve avatar image URL (env override or from ShSettings)
  let avatarImageUrl = SH_AVATAR_URL;
  if (!avatarImageUrl) {
    log('SH_AVATAR_URL not set — loading from ShSettings');
    const settings = await getShSettings();
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
    briefId: SH_BRIEF_ID,
    copyId: SH_COPY_ID,
    type: 'video',
    mediaUrl: videoUrl,
    renderProvider: 'wavespeed',
    renderModel: SH_VIDEO_MODEL,
    status: 'ready',
  });

  // 8. Update brief status to 'render_review'
  await db
    .update(shContentBriefs)
    .set({ status: 'render_review' })
    .where(eq(shContentBriefs.id, SH_BRIEF_ID));

  // 9. Done
  process.stdout.write(`SH_RENDER_DONE:${videoUrl}\n`);
}

run().catch((e: any) => {
  process.stdout.write(`SH_ERROR:${e.message ?? String(e)}\n`);
  process.exit(1);
});
