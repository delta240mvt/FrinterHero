/**
 * sh-video-gen.ts — WaveSpeed API client for AI video generation.
 *
 * Flow: TTS (ElevenLabs or Kokoro) → upload audio → WaveSpeed talking-head render → poll result.
 * Used by scripts/sh-video-render.ts (spawned as a child process).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface VideoRenderOptions {
  videoScript: string;      // text for TTS
  avatarImageUrl: string;   // image to animate
  model: string;            // 'wan-2.2-ultra-fast' | 'InfiniteTalk'
  voiceId?: string;         // ElevenLabs voice ID
  ttsProvider: 'elevenlabs' | 'kokoro';
  renderContext?: VideoRenderContext;
}

export interface VideoRenderContext {
  briefId?: number | null;
  copyId?: number | null;
  outputFormat?: string | null;
  videoFormatSlug?: string | null;
  videoFormatLabel?: string | null;
  videoFormatDescription?: string | null;
  viralEngineEnabled?: boolean;
  viralEngineMode?: string | null;
  promptLabel?: string | null;
  pacing?: string | null;
  visualDensity?: string | null;
}

export function buildVideoRenderLogLines(context: VideoRenderContext): string[] {
  const lines: string[] = ['[SH] Video render context'];

  if (context.briefId != null) lines.push(`[SH] briefId: ${context.briefId}`);
  if (context.copyId != null) lines.push(`[SH] copyId: ${context.copyId}`);
  if (context.outputFormat) lines.push(`[SH] outputFormat: ${context.outputFormat}`);
  if (context.videoFormatSlug) lines.push(`[SH] videoFormatSlug: ${context.videoFormatSlug}`);
  if (context.videoFormatLabel) lines.push(`[SH] videoFormatLabel: ${context.videoFormatLabel}`);
  if (context.videoFormatDescription) lines.push(`[SH] videoFormatDescription: ${context.videoFormatDescription}`);
  if (context.viralEngineEnabled != null) {
    lines.push(`[SH] viralEngineEnabled: ${context.viralEngineEnabled ? 'true' : 'false'}`);
  }
  if (context.viralEngineMode) lines.push(`[SH] viralEngineMode: ${context.viralEngineMode}`);
  if (context.promptLabel) lines.push(`[SH] viralEnginePromptLabel: ${context.promptLabel}`);
  if (context.pacing) lines.push(`[SH] videoPacing: ${context.pacing}`);
  if (context.visualDensity) lines.push(`[SH] videoVisualDensity: ${context.visualDensity}`);

  return lines;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

/**
 * Generate TTS audio via ElevenLabs multilingual v2 model.
 * Returns a binary Buffer of the MP3 file.
 */
export async function generateTtsAudio(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Audio upload ─────────────────────────────────────────────────────────────

/**
 * Save the audio buffer to a temp file and return its file:// URL.
 * In production this would upload to S3/Cloudinary and return an https:// URL.
 */
export async function uploadAudioBuffer(buffer: Buffer): Promise<string> {
  const filename = `sh-tts-${Date.now()}.mp3`;
  const filePath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(filePath, buffer);
  // Convert to forward-slash URL for cross-platform safety
  const normalised = filePath.replace(/\\/g, '/');
  return `file://${normalised.startsWith('/') ? '' : '/'}${normalised}`;
}

// ─── WaveSpeed ────────────────────────────────────────────────────────────────

/**
 * Submit a talking-head video job to WaveSpeed.
 * Returns the WaveSpeed prediction ID.
 */
export async function submitToWaveSpeed(
  audioUrl: string,
  imageUrl: string,
  model: string,
): Promise<string> {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) throw new Error('WAVESPEED_API_KEY is not set');

  const res = await fetch('https://api.wavespeed.ai/api/v3/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: model,
      input: {
        audio_url: audioUrl,
        image_url: imageUrl,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`WaveSpeed submit failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as any;
  const predictionId: string = data?.id ?? data?.prediction_id ?? data?.data?.id;
  if (!predictionId) throw new Error(`WaveSpeed: no prediction ID in response: ${JSON.stringify(data)}`);
  return predictionId;
}

// ─── WaveSpeed polling ────────────────────────────────────────────────────────

export interface WaveSpeedResult {
  status: string;
  videoUrl?: string;
  error?: string;
}

/**
 * Poll WaveSpeed until the prediction is 'completed' or 'failed'.
 * Polls every 5 seconds up to maxAttempts times.
 */
export async function pollWaveSpeedStatus(
  predictionId: string,
  maxAttempts = 60,
): Promise<WaveSpeedResult> {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) throw new Error('WAVESPEED_API_KEY is not set');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`WaveSpeed poll failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as any;
    const status: string = data?.status ?? data?.data?.status ?? 'unknown';

    if (status === 'completed' || status === 'succeeded') {
      const videoUrl: string =
        data?.output?.video_url ??
        data?.output?.url ??
        data?.data?.output?.video_url ??
        data?.data?.output?.url ??
        '';
      return { status: 'completed', videoUrl };
    }

    if (status === 'failed' || status === 'error') {
      const error: string =
        data?.error ??
        data?.data?.error ??
        'WaveSpeed render failed';
      return { status: 'failed', error };
    }

    // Still processing — wait 5 s before next attempt
    await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
    process.stdout.write(`[SH] Polling... attempt ${attempt}\n`);
  }

  return { status: 'timeout', error: `Timed out after ${maxAttempts} attempts` };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Main orchestration function.
 * Generates TTS audio, uploads it, submits to WaveSpeed and returns the prediction ID.
 * The caller is responsible for polling (or the render script handles it inline).
 */
export async function requestVideoRender(opts: VideoRenderOptions): Promise<string> {
  const voiceId = opts.voiceId ?? process.env.SH_ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL';

  const audioBuffer = await generateTtsAudio(opts.videoScript, voiceId);
  const audioUrl = await uploadAudioBuffer(audioBuffer);
  const predictionId = await submitToWaveSpeed(audioUrl, opts.avatarImageUrl, opts.model);
  return predictionId;
}
