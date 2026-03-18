/**
 * sh-viral-engine-types.ts — Shared contracts for Social Hub VIRAL ENGINE.
 *
 * This file is intentionally self-contained so settings/API/scripts can import
 * the same runtime, profile, and format definitions without circular deps.
 */

export type ViralEngineMode = 'default' | 'personalized';
export type ViralEngineOutputFormat = 'text' | 'image' | 'video';
export type PcmProfileMode = 'manual' | 'auto';
export type VideoFormatMode = 'manual' | 'auto';
export type HookIntensity = 'low' | 'medium' | 'high';
export type CtaIntensity = 'soft' | 'medium' | 'hard';
export type VideoPacing = 'calm' | 'medium' | 'fast';
export type VisualDensity = 'low' | 'medium' | 'high';

export const WRITTEN_PCM_PROFILE_KEYS = [
  'harmonizer',
  'thinker',
  'persister',
  'rebel',
  'promoter',
  'imaginer',
] as const;

export type WrittenPcmProfileKey = typeof WRITTEN_PCM_PROFILE_KEYS[number];
export type ShViralEnginePcmProfile = WrittenPcmProfileKey;
export type ShViralEngineMode = ViralEngineMode;
export type ShViralEngineProfileMode = PcmProfileMode;
export type ShViralEngineHookIntensity = HookIntensity;
export type ShViralEngineCtaIntensity = CtaIntensity;
export type ShViralEngineVideoPacing = VideoPacing;
export type ShViralEngineVideoDensity = VisualDensity;

export const VIDEO_FORMAT_SLUGS = [
  'talking_head_authority',
  'problem_agitation_solution',
  'storytime_confession',
  'contrarian_hot_take',
  'listicle_fast_cuts',
  'myth_vs_reality',
  'screen_demo_explainer',
  'ugc_testimonial_style',
] as const;

export type VideoFormatSlug = typeof VIDEO_FORMAT_SLUGS[number];
export type ShViralEngineVideoFormat = VideoFormatSlug;

export interface PcmFivePointSnapshot {
  coreAudienceState: string;
  dominantPsychologicalNeed: string;
  channelOfCommunication: string;
  preferredToneAndLanguage: string;
  callToActionStyle: string;
}

export interface WrittenPcmProfileDefinition extends PcmFivePointSnapshot {
  key: WrittenPcmProfileKey;
  name: string;
  summary: string;
  snapshot: PcmFivePointSnapshot;
  hookAngle: string;
  ctaHint: string;
  bestForPlatforms: string[];
  matchKeywords: string[];
  avoidKeywords: string[];
}

export interface VideoFormatDefinition {
  slug: VideoFormatSlug;
  name: string;
  summary: string;
  bestForPlatforms: string[];
  matchKeywords: string[];
  avoidKeywords: string[];
  hookPattern: string;
  openingPattern: string;
  pacing: VideoPacing;
  visualDensity: VisualDensity;
  sceneStructure: string[];
  ctaPattern: string;
  constraints: string[];
}

export interface ShViralEngineWrittenConfig {
  enabled: boolean;
  pcmProfileMode: PcmProfileMode;
  defaultPcmProfile: WrittenPcmProfileKey;
  enforceFivePoints: boolean;
  hookIntensity: HookIntensity;
  ctaIntensity: CtaIntensity;
  additionalRules: string[] | string;
}

export interface ShViralEngineVideoConfig {
  enabled: boolean;
  formatMode: VideoFormatMode;
  defaultFormats: string[];
  allowedFormats?: string[];
  preferredPrimaryFormat: string;
  pacing: VideoPacing;
  visualDensity: VisualDensity;
  additionalRules: string[] | string;
}

export interface ShViralEngineConfig {
  enabled: boolean;
  mode: ViralEngineMode;
  allowPersonalization: boolean;
  personalizationLabel: string;
  personalizationNotes: string;
  written: ShViralEngineWrittenConfig;
  video: ShViralEngineVideoConfig;
}

export interface ViralEnginePromptContext {
  briefId?: number;
  sourceType: string;
  sourceTitle: string;
  sourceSnapshot: string;
  suggestionPrompt: string;
  targetPlatforms: string[];
  outputFormat: ViralEngineOutputFormat;
  brandVoice: string;
  toneOverrides: string;
  maxPostLength?: number;
  audienceNotes: string;
  contentAngle: string;
  customBriefNotes: string;
}

export interface ViralEnginePromptBundle {
  system: string;
  user: string;
  summary: string;
  selectedWrittenProfileKey: WrittenPcmProfileKey | null;
  selectedVideoFormatSlug: VideoFormatSlug | null;
  writtenSnapshot: PcmFivePointSnapshot | null;
  videoFormat: VideoFormatDefinition | null;
}

export interface ShViralEngineRuntime extends ShViralEngineConfig {
  scope: 'global' | 'brief';
  sourceType?: string;
  outputFormat?: string;
  briefId?: number | null;
  promptLabel: string;
  config: ShViralEngineConfig;
  context: ViralEnginePromptContext;
  active: boolean;
  shouldUseWrittenEngine: boolean;
  shouldUseVideoEngine: boolean;
  selectedWrittenProfileKey: WrittenPcmProfileKey;
  selectedWrittenProfile: WrittenPcmProfileDefinition | null;
  selectedVideoFormatSlug: VideoFormatSlug;
  selectedVideoFormat: VideoFormatDefinition | null;
  writtenSnapshot: PcmFivePointSnapshot | null;
  selectionReason: string;
  selectionSummary: string;
}

export type ViralEngineConfig = ShViralEngineConfig;
export type ViralEngineRuntime = ShViralEngineRuntime;
export type ShViralEnginePromptContext = ViralEnginePromptContext;
export type ShViralEnginePromptBundle = ViralEnginePromptBundle;

export const SH_VIRAL_ENGINE_DEFAULTS: ShViralEngineConfig = {
  enabled: false,
  mode: 'default',
  allowPersonalization: false,
  personalizationLabel: '',
  personalizationNotes: '',
  written: {
    enabled: true,
    pcmProfileMode: 'auto',
    defaultPcmProfile: 'thinker',
    enforceFivePoints: true,
    hookIntensity: 'medium',
    ctaIntensity: 'medium',
    additionalRules: [],
  },
  video: {
    enabled: true,
    formatMode: 'auto',
    defaultFormats: ['talking_head_authority', 'myth_vs_reality'],
    preferredPrimaryFormat: 'talking_head_authority',
    pacing: 'medium',
    visualDensity: 'medium',
    additionalRules: [],
  },
};

export const WRITTEN_PCM_PROFILE_LIBRARY: Record<WrittenPcmProfileKey, WrittenPcmProfileDefinition> = {
  harmonizer: {
    key: 'harmonizer',
    name: 'Harmonizer',
    summary: 'Warm, relational, and emotionally safe. Best when the audience wants to feel understood first.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when the message sounds human, safe, and emotionally aware.',
      dominantPsychologicalNeed: 'Belonging, care, and relational safety.',
      channelOfCommunication: 'Use empathy, acknowledgement, and a conversational invitation.',
      preferredToneAndLanguage: 'Warm, validating, non-judgmental, and lightly conversational.',
      callToActionStyle: 'Offer a soft invitation to try, reflect, or reply.',
    },
    hookAngle: 'Lead with human impact and emotional safety.',
    ctaHint: 'Invite the next step gently and without pressure.',
    bestForPlatforms: ['instagram', 'tiktok', 'threads'],
    matchKeywords: ['support', 'safe', 'feel', 'feeling', 'burnout', 'anxious', 'healing', 'rest', 'relationship', 'human', 'care'],
    avoidKeywords: ['hard sell', 'force', 'pressure', 'command'],
    coreAudienceState: 'Feels most engaged when the message sounds human, safe, and emotionally aware.',
    dominantPsychologicalNeed: 'Belonging, care, and relational safety.',
    channelOfCommunication: 'Use empathy, acknowledgement, and a conversational invitation.',
    preferredToneAndLanguage: 'Warm, validating, non-judgmental, and lightly conversational.',
    callToActionStyle: 'Offer a soft invitation to try, reflect, or reply.',
  },
  thinker: {
    key: 'thinker',
    name: 'Thinker',
    summary: 'Logical, structured, and evidence-led. Best when the audience wants clarity and well-reasoned guidance.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when the content is precise, useful, and logically structured.',
      dominantPsychologicalNeed: 'Understanding, order, and confidence in accuracy.',
      channelOfCommunication: 'Explain clearly, sequence the logic, and remove ambiguity.',
      preferredToneAndLanguage: 'Calm, concise, informed, and grounded in evidence.',
      callToActionStyle: 'Ask the audience to consider, compare, or test a practical idea.',
    },
    hookAngle: 'Lead with facts, framework, or a clear explanation.',
    ctaHint: 'Invite careful consideration or a practical next step.',
    bestForPlatforms: ['linkedin', 'youtube', 'x'],
    matchKeywords: ['data', 'framework', 'logic', 'research', 'why', 'analysis', 'evidence', 'statistics', 'explained', 'strategy', 'system'],
    avoidKeywords: ['vague', 'fluffy', 'hype'],
    coreAudienceState: 'Feels most engaged when the content is precise, useful, and logically structured.',
    dominantPsychologicalNeed: 'Understanding, order, and confidence in accuracy.',
    channelOfCommunication: 'Explain clearly, sequence the logic, and remove ambiguity.',
    preferredToneAndLanguage: 'Calm, concise, informed, and grounded in evidence.',
    callToActionStyle: 'Ask the audience to consider, compare, or test a practical idea.',
  },
  persister: {
    key: 'persister',
    name: 'Persister',
    summary: 'Values quality, standards, and responsibility. Best when the message shows rigor and care.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when quality, standards, and responsibility are obvious.',
      dominantPsychologicalNeed: 'Integrity, correctness, and respect for standards.',
      channelOfCommunication: 'Be specific, measured, and precise about what matters.',
      preferredToneAndLanguage: 'Steady, serious, careful, and detail-aware.',
      callToActionStyle: 'Invite a considered commitment or a standards-driven response.',
    },
    hookAngle: 'Lead with standards, discipline, and proof of effort.',
    ctaHint: 'Invite a thoughtful commitment or a standards-based decision.',
    bestForPlatforms: ['linkedin', 'youtube', 'x'],
    matchKeywords: ['quality', 'standards', 'discipline', 'consistency', 'careful', 'responsible', 'principle', 'craft', 'detail', 'reliable'],
    avoidKeywords: ['sloppy', 'casual', 'random'],
    coreAudienceState: 'Feels most engaged when quality, standards, and responsibility are obvious.',
    dominantPsychologicalNeed: 'Integrity, correctness, and respect for standards.',
    channelOfCommunication: 'Be specific, measured, and precise about what matters.',
    preferredToneAndLanguage: 'Steady, serious, careful, and detail-aware.',
    callToActionStyle: 'Invite a considered commitment or a standards-driven response.',
  },
  rebel: {
    key: 'rebel',
    name: 'Rebel',
    summary: 'Contrarian, playful, and challenge-oriented. Best when the message breaks stale assumptions.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when the content flips expectations and sounds alive.',
      dominantPsychologicalNeed: 'Freedom, novelty, and resistance to stale authority.',
      channelOfCommunication: 'Use pattern breaks, contrast, and direct challenge.',
      preferredToneAndLanguage: 'Sharp, playful, brisk, and somewhat irreverent.',
      callToActionStyle: 'Let the audience choose, challenge, or react.',
    },
    hookAngle: 'Lead with a sharp contradiction or a pattern interrupt.',
    ctaHint: 'Invite the audience to decide for themselves.',
    bestForPlatforms: ['tiktok', 'x', 'instagram'],
    matchKeywords: ['contrarian', 'wrong', 'stop', 'challenge', 'unpopular', 'myth', 'break', 'ignore', 'bold', 'unexpected', 'hot take'],
    avoidKeywords: ['lecture', 'formal', 'polite-only'],
    coreAudienceState: 'Feels most engaged when the content flips expectations and sounds alive.',
    dominantPsychologicalNeed: 'Freedom, novelty, and resistance to stale authority.',
    channelOfCommunication: 'Use pattern breaks, contrast, and direct challenge.',
    preferredToneAndLanguage: 'Sharp, playful, brisk, and somewhat irreverent.',
    callToActionStyle: 'Let the audience choose, challenge, or react.',
  },
  promoter: {
    key: 'promoter',
    name: 'Promoter',
    summary: 'Energetic, outcome-driven, and action-oriented. Best when the message sells a next move or visible result.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when the content clearly points to a result or outcome.',
      dominantPsychologicalNeed: 'Movement, momentum, and visible payoff.',
      channelOfCommunication: 'Be concise, motivating, and clearly outcome-linked.',
      preferredToneAndLanguage: 'Energetic, persuasive, direct, and optimistic.',
      callToActionStyle: 'Ask for a decisive action with an obvious benefit.',
    },
    hookAngle: 'Lead with the result, gain, or opportunity.',
    ctaHint: 'Ask for a direct action with clear payoff.',
    bestForPlatforms: ['instagram', 'tiktok', 'x', 'threads'],
    matchKeywords: ['results', 'opportunity', 'action', 'sale', 'buy', 'now', 'growth', 'win', 'convert', 'launch', 'momentum'],
    avoidKeywords: ['slow', 'hesitate', 'maybe later'],
    coreAudienceState: 'Feels most engaged when the content clearly points to a result or outcome.',
    dominantPsychologicalNeed: 'Movement, momentum, and visible payoff.',
    channelOfCommunication: 'Be concise, motivating, and clearly outcome-linked.',
    preferredToneAndLanguage: 'Energetic, persuasive, direct, and optimistic.',
    callToActionStyle: 'Ask for a decisive action with an obvious benefit.',
  },
  imaginer: {
    key: 'imaginer',
    name: 'Imaginer',
    summary: 'Vision-led, reflective, and identity-aware. Best when the content helps the audience see a future self.',
    snapshot: {
      coreAudienceState: 'Feels most engaged when the content opens a meaningful future.',
      dominantPsychologicalNeed: 'Meaning, identity, and possibility.',
      channelOfCommunication: 'Use imagery, future framing, and a sense of direction.',
      preferredToneAndLanguage: 'Elevated, evocative, calm, and intentionally aspirational.',
      callToActionStyle: 'Invite reflection on identity and the future they want to build.',
    },
    hookAngle: 'Lead with possibility, future identity, or aspiration.',
    ctaHint: 'Invite the audience to picture the future and step into it.',
    bestForPlatforms: ['instagram', 'youtube', 'linkedin'],
    matchKeywords: ['vision', 'future', 'imagine', 'identity', 'become', 'possibility', 'dream', 'aspiration', 'potential', 'future self'],
    avoidKeywords: ['too literal', 'dry'],
    coreAudienceState: 'Feels most engaged when the content opens a meaningful future.',
    dominantPsychologicalNeed: 'Meaning, identity, and possibility.',
    channelOfCommunication: 'Use imagery, future framing, and a sense of direction.',
    preferredToneAndLanguage: 'Elevated, evocative, calm, and intentionally aspirational.',
    callToActionStyle: 'Invite reflection on identity and the future they want to build.',
  },
};

export const WRITTEN_PCM_PROFILE_LIST = WRITTEN_PCM_PROFILE_KEYS.map(
  (key) => WRITTEN_PCM_PROFILE_LIBRARY[key],
);

export const VIDEO_FORMAT_LIBRARY: Record<VideoFormatSlug, VideoFormatDefinition> = {
  talking_head_authority: {
    slug: 'talking_head_authority',
    name: 'Talking Head Authority',
    summary: 'Direct address, authority-first framing, and clear editorial control.',
    bestForPlatforms: ['linkedin', 'youtube', 'instagram'],
    matchKeywords: ['authority', 'expert', 'explainer', 'interview', 'direct', 'clarity', 'teaching'],
    avoidKeywords: ['silent montage', 'rapid meme'],
    hookPattern: 'Open with a direct claim, lesson, or credibility marker.',
    openingPattern: 'Camera-facing opening, short sentence, immediate framing.',
    pacing: 'medium',
    visualDensity: 'low',
    sceneStructure: ['hook', 'thesis', 'proof', 'example', 'closing cta'],
    ctaPattern: 'Close with a simple invite, question, or follow-up action.',
    constraints: ['Keep framing stable.', 'Avoid over-cutting.', 'Prioritize face and voice clarity.'],
  },
  problem_agitation_solution: {
    slug: 'problem_agitation_solution',
    name: 'Problem Agitation Solution',
    summary: 'Classic funnel arc: identify pain, deepen it, then release into a practical solution.',
    bestForPlatforms: ['tiktok', 'instagram', 'linkedin', 'youtube'],
    matchKeywords: ['problem', 'pain', 'struggle', 'solution', 'fix', 'why it hurts', 'frustration', 'blocked'],
    avoidKeywords: ['pure fluff'],
    hookPattern: 'Open with the pain point in one sentence.',
    openingPattern: 'Show the problem fast, then increase tension before resolving it.',
    pacing: 'fast',
    visualDensity: 'medium',
    sceneStructure: ['hook', 'problem', 'agitation', 'solution', 'proof', 'cta'],
    ctaPattern: 'Offer a next step that removes friction.',
    constraints: ['Do not over-explain the pain.', 'Keep the solution concrete.'],
  },
  storytime_confession: {
    slug: 'storytime_confession',
    name: 'Storytime Confession',
    summary: 'First-person narrative with a reveal, lesson, and emotional release.',
    bestForPlatforms: ['tiktok', 'instagram', 'youtube'],
    matchKeywords: ['story', 'confession', 'i was', 'when i', 'learned', 'realized', 'mistake', 'before', 'after'],
    avoidKeywords: ['dry tutorial'],
    hookPattern: 'Open with the most interesting part of the story.',
    openingPattern: 'Use a confessional line that creates curiosity immediately.',
    pacing: 'medium',
    visualDensity: 'medium',
    sceneStructure: ['hook', 'setup', 'turning point', 'lesson', 'reflection', 'cta'],
    ctaPattern: 'Invite viewers to share their own version of the story.',
    constraints: ['Keep the confession honest.', 'Avoid unnecessary backstory.'],
  },
  contrarian_hot_take: {
    slug: 'contrarian_hot_take',
    name: 'Contrarian Hot Take',
    summary: 'A sharp, opinion-led format designed to stop scrolls and trigger discussion.',
    bestForPlatforms: ['x', 'tiktok', 'instagram', 'linkedin'],
    matchKeywords: ['hot take', 'unpopular', 'wrong', 'contrary', 'stop doing', 'nobody tells you', 'myth'],
    avoidKeywords: ['overly polite'],
    hookPattern: 'Open with the sentence that most people would disagree with.',
    openingPattern: 'Immediate opinion, then evidence or rationale.',
    pacing: 'fast',
    visualDensity: 'low',
    sceneStructure: ['hook', 'claim', 'contrast', 'evidence', 'challenge', 'cta'],
    ctaPattern: 'Prompt reactions, debate, or reflection.',
    constraints: ['Make the argument defendable.', 'Avoid empty provocation.'],
  },
  listicle_fast_cuts: {
    slug: 'listicle_fast_cuts',
    name: 'Listicle Fast Cuts',
    summary: 'Compact itemized structure with rapid visual changes and clear numeric progression.',
    bestForPlatforms: ['tiktok', 'instagram', 'youtube shorts'],
    matchKeywords: ['top', 'three', '5', '7', 'list', 'steps', 'tips', 'ways', 'mistakes'],
    avoidKeywords: ['slow monologue'],
    hookPattern: 'Open with the list promise and the payoff.',
    openingPattern: 'Fast pacing, visible counters, and punchy segment titles.',
    pacing: 'fast',
    visualDensity: 'high',
    sceneStructure: ['hook', 'item 1', 'item 2', 'item 3', 'item n', 'cta'],
    ctaPattern: 'Invite a comment, save, or follow for the next list.',
    constraints: ['Keep each item distinct.', 'Do not overload each segment.'],
  },
  myth_vs_reality: {
    slug: 'myth_vs_reality',
    name: 'Myth vs Reality',
    summary: 'Contrast format that dismantles a false assumption and replaces it with a clearer truth.',
    bestForPlatforms: ['linkedin', 'x', 'youtube', 'instagram'],
    matchKeywords: ['myth', 'reality', 'truth', 'misunderstood', 'common belief', 'actually', 'false'],
    avoidKeywords: ['vague opinion'],
    hookPattern: 'Open with the myth, then flip to reality.',
    openingPattern: 'Two-part structure: false assumption, then correction.',
    pacing: 'medium',
    visualDensity: 'medium',
    sceneStructure: ['myth', 'why it sticks', 'reality', 'proof', 'implication', 'cta'],
    ctaPattern: 'Ask the audience to rethink the old assumption.',
    constraints: ['Keep the correction crisp.', 'Anchor the reality in evidence or example.'],
  },
  screen_demo_explainer: {
    slug: 'screen_demo_explainer',
    name: 'Screen Demo Explainer',
    summary: 'Instructional, product or workflow-led demo with visual proof and clear steps.',
    bestForPlatforms: ['youtube', 'linkedin', 'instagram'],
    matchKeywords: ['how to', 'demo', 'walkthrough', 'tutorial', 'screen', 'workflow', 'show you'],
    avoidKeywords: ['theatrical monologue'],
    hookPattern: 'Open with the outcome the demo will unlock.',
    openingPattern: 'Show the interface or mechanism early, then narrate the steps.',
    pacing: 'medium',
    visualDensity: 'medium',
    sceneStructure: ['hook', 'setup', 'demo step 1', 'demo step 2', 'result', 'cta'],
    ctaPattern: 'Invite viewers to try the workflow themselves.',
    constraints: ['Keep cursor motion deliberate.', 'Avoid clutter on screen.'],
  },
  ugc_testimonial_style: {
    slug: 'ugc_testimonial_style',
    name: 'UGC Testimonial Style',
    summary: 'Casual proof-led format that feels like a real user sharing a real result.',
    bestForPlatforms: ['tiktok', 'instagram', 'youtube shorts'],
    matchKeywords: ['testimonial', 'proof', 'result', 'review', 'experience', 'before and after', 'worked'],
    avoidKeywords: ['overproduced'],
    hookPattern: 'Open with the result or transformation.',
    openingPattern: 'Natural delivery, first-person credibility, and visible proof.',
    pacing: 'medium',
    visualDensity: 'medium',
    sceneStructure: ['hook', 'context', 'use case', 'result', 'proof', 'cta'],
    ctaPattern: 'Ask viewers to try it, check it out, or compare it to their current approach.',
    constraints: ['Make it feel believable.', 'Do not overscript the voice.'],
  },
};

export const VIDEO_FORMAT_LIST = VIDEO_FORMAT_SLUGS.map(
  (slug) => VIDEO_FORMAT_LIBRARY[slug],
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return fallback;
}

function toStringArray(value: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(value)) return value.map((item) => toStringValue(item)).filter(Boolean);
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : fallback.slice();
  }
  return fallback.slice();
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = toStringValue(value, '').toLowerCase();
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}

export function normalizeShViralEngineConfig(raw: unknown): ShViralEngineConfig {
  const source = isRecord(raw) ? raw : {};
  const writtenRaw = isRecord(source.written) ? source.written : {};
  const videoRaw = isRecord(source.video) ? source.video : {};

  const defaultFormats = toStringArray(
    videoRaw.defaultFormats ?? videoRaw.allowedFormats,
    SH_VIRAL_ENGINE_DEFAULTS.video.defaultFormats,
  );
  const preferredPrimaryFormat = pickEnum(
    videoRaw.preferredPrimaryFormat,
    VIDEO_FORMAT_SLUGS,
    defaultFormats[0] ?? SH_VIRAL_ENGINE_DEFAULTS.video.preferredPrimaryFormat,
  );

  return {
    enabled: toBoolean(source.enabled, SH_VIRAL_ENGINE_DEFAULTS.enabled),
    mode: pickEnum(source.mode, ['default', 'personalized'] as const, SH_VIRAL_ENGINE_DEFAULTS.mode),
    allowPersonalization: toBoolean(source.allowPersonalization, SH_VIRAL_ENGINE_DEFAULTS.allowPersonalization),
    personalizationLabel: toStringValue(source.personalizationLabel, SH_VIRAL_ENGINE_DEFAULTS.personalizationLabel),
    personalizationNotes: toStringValue(source.personalizationNotes, SH_VIRAL_ENGINE_DEFAULTS.personalizationNotes),
    written: {
      enabled: toBoolean(writtenRaw.enabled, SH_VIRAL_ENGINE_DEFAULTS.written.enabled),
      pcmProfileMode: pickEnum(writtenRaw.pcmProfileMode, ['manual', 'auto'] as const, SH_VIRAL_ENGINE_DEFAULTS.written.pcmProfileMode),
      defaultPcmProfile: pickEnum(writtenRaw.defaultPcmProfile, WRITTEN_PCM_PROFILE_KEYS, SH_VIRAL_ENGINE_DEFAULTS.written.defaultPcmProfile),
      enforceFivePoints: toBoolean(writtenRaw.enforceFivePoints, SH_VIRAL_ENGINE_DEFAULTS.written.enforceFivePoints),
      hookIntensity: pickEnum(writtenRaw.hookIntensity, ['low', 'medium', 'high'] as const, SH_VIRAL_ENGINE_DEFAULTS.written.hookIntensity),
      ctaIntensity: pickEnum(writtenRaw.ctaIntensity, ['soft', 'medium', 'hard'] as const, SH_VIRAL_ENGINE_DEFAULTS.written.ctaIntensity),
      additionalRules: toStringArray(writtenRaw.additionalRules, SH_VIRAL_ENGINE_DEFAULTS.written.additionalRules as string[]),
    },
    video: {
      enabled: toBoolean(videoRaw.enabled, SH_VIRAL_ENGINE_DEFAULTS.video.enabled),
      formatMode: pickEnum(videoRaw.formatMode, ['manual', 'auto'] as const, SH_VIRAL_ENGINE_DEFAULTS.video.formatMode),
      defaultFormats,
      allowedFormats: defaultFormats.slice(),
      preferredPrimaryFormat,
      pacing: pickEnum(videoRaw.pacing, ['calm', 'medium', 'fast'] as const, SH_VIRAL_ENGINE_DEFAULTS.video.pacing),
      visualDensity: pickEnum(videoRaw.visualDensity, ['low', 'medium', 'high'] as const, SH_VIRAL_ENGINE_DEFAULTS.video.visualDensity),
      additionalRules: toStringArray(videoRaw.additionalRules, SH_VIRAL_ENGINE_DEFAULTS.video.additionalRules as string[]),
    },
  };
}

export function mergeShViralEngineConfig(
  base: ShViralEngineConfig,
  overrides?: Partial<ShViralEngineConfig> | null,
): ShViralEngineConfig {
  const normalizedBase = normalizeShViralEngineConfig(base);
  if (!overrides) return normalizedBase;

  const normalizedOverrides = normalizeShViralEngineConfig(overrides);
  return {
    ...normalizedBase,
    ...normalizedOverrides,
    written: {
      ...normalizedBase.written,
      ...normalizedOverrides.written,
    },
    video: {
      ...normalizedBase.video,
      ...normalizedOverrides.video,
      defaultFormats: normalizedOverrides.video.defaultFormats.length
        ? normalizedOverrides.video.defaultFormats
        : normalizedBase.video.defaultFormats,
      allowedFormats: normalizedOverrides.video.allowedFormats?.length
        ? normalizedOverrides.video.allowedFormats
        : normalizedBase.video.allowedFormats,
    },
  };
}

export function buildShViralEngineRuntime(
  base: ShViralEngineConfig,
  overrides?: Partial<ShViralEngineConfig> | null,
  meta: {
    scope?: 'global' | 'brief';
    sourceType?: string;
    outputFormat?: string;
    briefId?: number | null;
  } = {},
): ShViralEngineRuntime {
  const config = mergeShViralEngineConfig(base, overrides);
  const selectedWrittenProfile = WRITTEN_PCM_PROFILE_LIBRARY[config.written.defaultPcmProfile];
  const selectedVideoFormatSlug = pickEnum(
    config.video.preferredPrimaryFormat,
    VIDEO_FORMAT_SLUGS,
    SH_VIRAL_ENGINE_DEFAULTS.video.preferredPrimaryFormat,
  ) as VideoFormatSlug;
  const selectedVideoFormat = VIDEO_FORMAT_LIBRARY[selectedVideoFormatSlug] ?? null;
  const context: ViralEnginePromptContext = {
    briefId: meta.briefId ?? undefined,
    sourceType: meta.sourceType ?? '',
    sourceTitle: '',
    sourceSnapshot: '',
    suggestionPrompt: '',
    targetPlatforms: [],
    outputFormat: pickEnum(meta.outputFormat, ['text', 'image', 'video'] as const, 'text'),
    brandVoice: '',
    toneOverrides: '',
    audienceNotes: '',
    contentAngle: '',
    customBriefNotes: '',
  };
  const active = config.enabled;

  return {
    ...config,
    scope: meta.scope ?? 'global',
    sourceType: meta.sourceType,
    outputFormat: context.outputFormat,
    briefId: meta.briefId ?? null,
    promptLabel: active ? `${config.mode}:${config.allowPersonalization ? 'personalized' : 'default'}` : 'disabled',
    config,
    context,
    active,
    shouldUseWrittenEngine: active && config.written.enabled,
    shouldUseVideoEngine: active && config.video.enabled && context.outputFormat === 'video',
    selectedWrittenProfileKey: selectedWrittenProfile.key,
    selectedWrittenProfile,
    selectedVideoFormatSlug,
    selectedVideoFormat,
    writtenSnapshot: selectedWrittenProfile,
    selectionReason: active
      ? `mode=${config.mode}; written=${config.written.pcmProfileMode}; video=${config.video.formatMode}`
      : 'viral_engine_disabled',
    selectionSummary: active
      ? `${selectedWrittenProfile.name} / ${selectedVideoFormat?.name ?? selectedVideoFormatSlug}`
      : 'disabled',
  };
}

export function buildShViralEngineEnv(runtime: ShViralEngineRuntime): Record<string, string> {
  return {
    SH_VIRAL_ENGINE_ENABLED: runtime.active ? 'true' : 'false',
    SH_VIRAL_ENGINE_MODE: runtime.mode,
    SH_VIRAL_ENGINE_ALLOW_PERSONALIZATION: runtime.allowPersonalization ? 'true' : 'false',
    SH_VIRAL_ENGINE_PERSONALIZATION_LABEL: runtime.personalizationLabel,
    SH_VIRAL_ENGINE_PERSONALIZATION_NOTES: runtime.personalizationNotes,
    SH_VIRAL_ENGINE_WRITTEN_CONFIG: JSON.stringify(runtime.written),
    SH_VIRAL_ENGINE_VIDEO_CONFIG: JSON.stringify(runtime.video),
    SH_VIRAL_ENGINE_RUNTIME: JSON.stringify(runtime),
  };
}

export function normalizeShViralEngineRuntime(raw: unknown): ShViralEngineRuntime {
  if (isRecord(raw) && isRecord(raw.config)) {
    return buildShViralEngineRuntime(normalizeShViralEngineConfig(raw.config), undefined, {
      scope: raw.scope === 'brief' ? 'brief' : 'global',
      sourceType: toStringValue(raw.sourceType, ''),
      outputFormat: toStringValue(raw.outputFormat, 'text'),
      briefId: typeof raw.briefId === 'number' ? raw.briefId : undefined,
    });
  }

  return buildShViralEngineRuntime(normalizeShViralEngineConfig(raw));
}
