import {
  buildShViralEngineRuntime,
  SH_VIRAL_ENGINE_DEFAULTS,
  VIDEO_FORMAT_LIBRARY,
  WRITTEN_PCM_PROFILE_LIBRARY,
  type ShViralEngineConfig,
  type ShViralEngineRuntime,
  type VideoFormatDefinition,
  type WrittenPcmProfileDefinition,
} from './sh-viral-engine-types';

export { SH_VIRAL_ENGINE_DEFAULTS, VIDEO_FORMAT_LIBRARY as SH_VIDEO_FORMAT_LIBRARY, WRITTEN_PCM_PROFILE_LIBRARY as SH_PCM_PROFILE_LIBRARY };

export interface ShViralEngineResolved {
  runtime: ShViralEngineRuntime;
  pcmSnapshot: WrittenPcmProfileDefinition | null;
  videoFormat: VideoFormatDefinition | null;
  personalizationSummary: string | null;
}

export function resolveShViralEngine(
  baseConfig: ShViralEngineConfig | null | undefined,
  overrides?: Partial<ShViralEngineConfig> | null,
  meta: {
    sourceType?: string;
    outputFormat?: string;
    briefId?: number | null;
  } = {},
): ShViralEngineResolved {
  const runtime = buildShViralEngineRuntime(baseConfig ?? SH_VIRAL_ENGINE_DEFAULTS, overrides, {
    scope: meta.briefId ? 'brief' : 'global',
    sourceType: meta.sourceType,
    outputFormat: meta.outputFormat,
    briefId: meta.briefId ?? null,
  });

  const pcmSnapshot = runtime.shouldUseWrittenEngine ? WRITTEN_PCM_PROFILE_LIBRARY[runtime.selectedWrittenProfileKey] : null;
  const videoFormat = runtime.shouldUseVideoEngine ? VIDEO_FORMAT_LIBRARY[runtime.selectedVideoFormatSlug] : null;
  const personalizationSummary = [runtime.personalizationLabel, runtime.personalizationNotes].filter(Boolean).join(' | ') || null;

  return {
    runtime,
    pcmSnapshot,
    videoFormat,
    personalizationSummary,
  };
}

