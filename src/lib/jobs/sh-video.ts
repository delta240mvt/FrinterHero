import { and, eq, isNull, or } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { shContentBriefs, shGeneratedCopy, shMediaAssets } from '../../db/schema';
import {
  buildVideoRenderLogLines,
  generateTtsAudio,
  pollWaveSpeedStatus,
  submitToWaveSpeed,
  type VideoRenderContext,
  uploadAudioBuffer,
} from '../sh-video-gen';
import { getShSettings } from '../sh-settings';

const VIDEO_FORMAT_META: Record<string, { label: string; description: string }> = {
  talking_head_authority: {
    label: 'Talking Head Authority',
    description: 'Ekspercki monolog z wysoka klarownoscia i jedna mocna teza.',
  },
  problem_agitation_solution: {
    label: 'Problem Agitation Solution',
    description: 'Najpierw problem i koszt jego ignorowania, potem rozwiazanie.',
  },
  storytime_confession: {
    label: 'Storytime Confession',
    description: 'Osobisty lub founder-led case z wyrazna zmiana perspektywy.',
  },
  contrarian_hot_take: {
    label: 'Contrarian Hot Take',
    description: 'Kontrarianski punkt widzenia z szybkim uzasadnieniem.',
  },
  listicle_fast_cuts: {
    label: 'Listicle Fast Cuts',
    description: 'Lista krotkich punktow z szybkim montazem rytmicznym.',
  },
  myth_vs_reality: {
    label: 'Myth vs Reality',
    description: 'Obalenie mitu i podmiana na trafniejszy model.',
  },
  screen_demo_explainer: {
    label: 'Screen Demo Explainer',
    description: 'Demo lub walkthrough pokazujace mechanike dzialania.',
  },
  ugc_testimonial_style: {
    label: 'UGC Testimonial Style',
    description: 'Naturalna rekomendacja lub observed use-case w stylu UGC.',
  },
};

export interface ShVideoOptions {
  briefId: number;
  copyId: number;
  siteId: number | null;
  avatarUrl: string;
  videoModel: string;
  voiceId: string;
}

export interface ShVideoResult {
  videoUrl: string;
  protocolLines: string[];
}

export function describeShVideoFormat(slug: string | null | undefined): { slug: string; label: string; description: string } | null {
  if (!slug) return null;
  const meta = VIDEO_FORMAT_META[slug];
  if (meta) return { slug, ...meta };
  return {
    slug,
    label: slug.replace(/_/g, ' '),
    description: 'Custom or unknown format slug from brief settings.',
  };
}

export async function runShVideoJob(
  options: ShVideoOptions,
  overrides: {
    db?: typeof defaultDb;
    logger?: Pick<Console, 'log'>;
    generateTts?: typeof generateTtsAudio;
    uploadAudio?: typeof uploadAudioBuffer;
    submitVideo?: typeof submitToWaveSpeed;
    pollVideo?: typeof pollWaveSpeedStatus;
  } = {},
): Promise<ShVideoResult> {
  const db = overrides.db ?? defaultDb;
  const logger = overrides.logger ?? console;
  const generateTts = overrides.generateTts ?? generateTtsAudio;
  const uploadAudio = overrides.uploadAudio ?? uploadAudioBuffer;
  const submitVideo = overrides.submitVideo ?? submitToWaveSpeed;
  const pollVideo = overrides.pollVideo ?? pollWaveSpeedStatus;

  if (!options.briefId) throw new Error('SH_BRIEF_ID is required');
  if (!options.copyId) throw new Error('SH_COPY_ID is required');

  const [copyRow] = await db
    .select()
    .from(shGeneratedCopy)
    .where(
      and(eq(shGeneratedCopy.id, options.copyId), options.siteId ? or(eq(shGeneratedCopy.siteId, options.siteId), isNull(shGeneratedCopy.siteId)) : undefined),
    );
  if (!copyRow) throw new Error(`shGeneratedCopy id=${options.copyId} not found`);

  const [briefRow] = await db
    .select()
    .from(shContentBriefs)
    .where(
      and(eq(shContentBriefs.id, options.briefId), options.siteId ? or(eq(shContentBriefs.siteId, options.siteId), isNull(shContentBriefs.siteId)) : undefined),
    );
  if (!briefRow) throw new Error(`shContentBriefs id=${options.briefId} not found`);

  const resolvedSiteId = briefRow.siteId ?? copyRow.siteId ?? options.siteId;
  const settings = await getShSettings(resolvedSiteId);
  const selectedVideoFormatSlug =
    copyRow.videoFormatSlug ?? briefRow.videoFormatSlug ?? settings.viralEngine?.video?.preferredPrimaryFormat ?? null;
  const selectedVideoFormat = describeShVideoFormat(selectedVideoFormatSlug);
  const renderContext: VideoRenderContext = {
    briefId: options.briefId,
    copyId: options.copyId,
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
    logger.log(line);
  }

  const avatarImageUrl = options.avatarUrl || settings.avatarImageUrl;
  if (!avatarImageUrl) throw new Error('avatarImageUrl is required - set SH_AVATAR_URL or configure it in Social Hub settings');

  const videoScript = copyRow.videoScript ?? `${copyRow.hookLine}\n\n${copyRow.bodyText}`;
  if (!videoScript.trim()) throw new Error('videoScript is empty - cannot generate TTS');

  const audioBuffer = await generateTts(videoScript, options.voiceId);
  const audioUrl = await uploadAudio(audioBuffer);
  const predictionId = await submitVideo(audioUrl, avatarImageUrl, options.videoModel);
  const result = await pollVideo(predictionId, 60);
  if (result.status !== 'completed' || !result.videoUrl) {
    throw new Error(result.error ?? 'WaveSpeed render did not complete');
  }

  await db.insert(shMediaAssets).values({
    siteId: resolvedSiteId,
    briefId: options.briefId,
    copyId: options.copyId,
    type: 'video',
    mediaUrl: result.videoUrl,
    renderProvider: 'wavespeed',
    renderModel: options.videoModel,
    videoFormatSlug: selectedVideoFormat?.slug ?? selectedVideoFormatSlug,
    viralEngineSnapshot: (briefRow.viralEngineProfile as any) ?? settings.viralEngine,
    status: 'completed',
  });

  await db
    .update(shContentBriefs)
    .set({
      status: 'render_review',
      videoFormatSlug: selectedVideoFormat?.slug ?? selectedVideoFormatSlug,
      updatedAt: new Date(),
    })
    .where(and(eq(shContentBriefs.id, options.briefId), options.siteId ? or(eq(shContentBriefs.siteId, options.siteId), isNull(shContentBriefs.siteId)) : undefined));

  return {
    videoUrl: result.videoUrl,
    protocolLines: ['SH_TTS_DONE:', `SH_VIDEO_SUBMITTED:${predictionId}`, `SH_RENDER_DONE:${result.videoUrl}`],
  };
}
