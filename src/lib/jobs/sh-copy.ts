import { readFileSync } from 'fs';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { shContentBriefs, shGeneratedCopy } from '../../db/schema';
import { getShSettings } from '../sh-settings';
import { callBcLlm } from '../bc-llm-client';
import { buildShViralEngineSystemPrompt, buildShViralEngineUserPrompt } from '../sh-viral-engine-prompts';
import { normalizeShViralEngineRuntime, type PcmFivePointSnapshot } from '../sh-viral-engine-types';
import { resolveShViralEngine } from '../sh-viral-engine';

export interface ShCopyOptions {
  briefId: number;
  siteId: number | null;
  model: string;
  thinkingBudget?: number;
  brandVoiceFile?: string;
  viralEngineRuntime?: unknown;
}

export interface ShCopyResult {
  variantsCreated: number;
  briefId: number;
  protocolLines: string[];
}

interface CopyVariant {
  variantIndex: 0 | 1 | 2;
  hookLine: string;
  bodyText: string;
  hashtags: string[];
  cta: string;
  imageLayoutDescription: string;
  videoScript: string;
}

export function normalizeShHashtags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((tag) => String(tag ?? '').trim()).filter(Boolean);
}

export function readShBrandVoice(filePath: string): string {
  if (!filePath) return '';
  try {
    return readFileSync(filePath, 'utf-8').slice(0, 4000);
  } catch {
    return '';
  }
}

export function normalizeShCopyVariants(responseText: string): CopyVariant[] {
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }
  return parsed as CopyVariant[];
}

function toPcmRecord(snapshot: PcmFivePointSnapshot | null): Record<string, string> | null {
  if (!snapshot) return null;
  return {
    coreAudienceState: snapshot.coreAudienceState,
    dominantPsychologicalNeed: snapshot.dominantPsychologicalNeed,
    channelOfCommunication: snapshot.channelOfCommunication,
    preferredToneAndLanguage: snapshot.preferredToneAndLanguage,
    callToActionStyle: snapshot.callToActionStyle,
  };
}

export async function runShCopyJob(
  options: ShCopyOptions,
  overrides: {
    db?: typeof defaultDb;
    callLlm?: typeof callBcLlm;
    logger?: Pick<Console, 'log'>;
  } = {},
): Promise<ShCopyResult> {
  const db = overrides.db ?? defaultDb;
  const callLlm = overrides.callLlm ?? callBcLlm;
  const logger = overrides.logger ?? console;

  if (!options.briefId) throw new Error('SH_BRIEF_ID env var is required');

  const briefScope = options.siteId
    ? or(eq(shContentBriefs.siteId, options.siteId), isNull(shContentBriefs.siteId))
    : undefined;
  const [brief] = await db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, options.briefId), briefScope)).limit(1);
  if (!brief) throw new Error(`Brief ${options.briefId} not found`);

  const resolvedSiteId = brief.siteId ?? options.siteId;
  const settings = await getShSettings(resolvedSiteId);
  const defaultHashtags = normalizeShHashtags(settings.defaultHashtags, []);
  const brandVoice = readShBrandVoice(settings.brandVoiceFile || options.brandVoiceFile || '');
  const runtimeFromEnv = options.viralEngineRuntime
    ? normalizeShViralEngineRuntime(options.viralEngineRuntime)
    : null;
  const resolved = resolveShViralEngine((brief.viralEngineProfile as any) ?? settings.viralEngine, null, {
    sourceType: String(brief.sourceType || runtimeFromEnv?.sourceType || ''),
    outputFormat: String(brief.outputFormat || runtimeFromEnv?.outputFormat || 'text'),
    briefId: options.briefId,
  });

  if (runtimeFromEnv?.active && !resolved.runtime.active) {
    resolved.runtime.enabled = runtimeFromEnv.enabled;
    resolved.runtime.active = runtimeFromEnv.active;
    resolved.runtime.mode = runtimeFromEnv.mode;
    resolved.runtime.allowPersonalization = runtimeFromEnv.allowPersonalization;
    resolved.runtime.personalizationLabel = runtimeFromEnv.personalizationLabel;
    resolved.runtime.personalizationNotes = runtimeFromEnv.personalizationNotes;
  }

  const systemPrompt = [
    'You are a SocialHub social media copywriter.',
    brandVoice ? `Brand voice:\n${brandVoice}` : '',
    settings.toneOverrides?.trim() ? `Tone overrides:\n${settings.toneOverrides.trim()}` : '',
    `Max post length: ${settings.maxPostLength} characters where relevant.`,
    'Write concrete, platform-native copy.',
    'Keep sentences short, readable, and specific.',
    'Banned words: leverage, revolutionary, innovative, game-changer.',
    buildShViralEngineSystemPrompt(resolved),
  ]
    .filter(Boolean)
    .join('\n\n');

  const userPrompt = [
    buildShViralEngineUserPrompt(resolved),
    'SOURCE TITLE:',
    brief.sourceTitle || '(no source title)',
    '',
    'SOURCE SNAPSHOT:',
    brief.sourceSnapshot || '(no source snapshot)',
    '',
    'SUGGESTION PROMPT:',
    brief.suggestionPrompt || settings.defaultSuggestionPrompt || 'none',
    '',
    'TARGET PLATFORMS:',
    Array.isArray(brief.targetPlatforms) ? brief.targetPlatforms.map(String).join(', ') || 'general' : 'general',
    '',
    'OUTPUT FORMAT:',
    String(brief.outputFormat || 'text'),
    '',
    'RESPONSE REQUIREMENTS:',
    'Generate exactly 3 variants: aggressive, empathetic, humorous.',
    `If hashtags are useful, prefer these defaults when relevant: ${defaultHashtags.join(', ') || 'none'}.`,
    'For each variant return JSON object:',
    '{ "variantIndex": 0|1|2, "hookLine": string, "bodyText": string, "hashtags": string[], "cta": string, "imageLayoutDescription": string, "videoScript": string }',
    'Return ONLY a valid JSON array of 3 objects. No markdown. No explanation.',
  ].join('\n');

  logger.log(`[SH] Calling AI copywriter using model: ${options.model}...`);
  const response = await callLlm({
    model: options.model,
    maxTokens: 4096,
    messages: [{ role: 'user', content: userPrompt }],
    systemPrompt,
    ...(options.thinkingBudget !== undefined ? { thinkingBudget: options.thinkingBudget } : {}),
  });

  const variants = normalizeShCopyVariants(response.content.trim());
  if (!variants.length) throw new Error('LLM returned zero variants');

  const fullPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;
  const pcmProfileRecord = toPcmRecord(resolved.runtime.writtenSnapshot);
  const contentAngle = resolved.pcmSnapshot?.hookAngle ?? resolved.runtime.selectionSummary;
  const videoFormatSlug = resolved.videoFormat?.slug ?? null;

  for (const variant of variants) {
    await db.insert(shGeneratedCopy).values({
      siteId: resolvedSiteId,
      briefId: options.briefId,
      hookLine: String(variant.hookLine || ''),
      bodyText: String(variant.bodyText || ''),
      hashtags: normalizeShHashtags(variant.hashtags, defaultHashtags),
      cta: variant.cta ? String(variant.cta) : null,
      imageLayoutDescription: variant.imageLayoutDescription ? String(variant.imageLayoutDescription) : null,
      videoScript: variant.videoScript ? String(variant.videoScript) : null,
      variantIndex: typeof variant.variantIndex === 'number' ? variant.variantIndex : 0,
      generationModel: options.model,
      promptUsed: fullPrompt,
      viralEngineSnapshot: resolved.runtime.config,
      pcmProfile: pcmProfileRecord,
      contentAngle,
      videoFormatSlug,
      status: 'draft',
    });
  }

  await db
    .update(shContentBriefs)
    .set({ status: 'copy_review', updatedAt: new Date() })
    .where(and(eq(shContentBriefs.id, options.briefId), briefScope));

  return {
    variantsCreated: variants.length,
    briefId: options.briefId,
    protocolLines: [
      `variantsCreated:${variants.length}`,
      `RESULT_JSON:${JSON.stringify({ variantsCreated: variants.length, briefId: options.briefId })}`,
    ],
  };
}
