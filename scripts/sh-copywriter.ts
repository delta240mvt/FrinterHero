/**
 * sh-copywriter.ts — AI copywriter for SocialHub content briefs.
 *
 * Spawned by sh-copywriter-job.ts. Loads brief + settings, resolves VIRAL
 * ENGINE, injects it into the model prompt, then persists generated variants.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { readFileSync } from 'fs';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../src/db/client';
import { shContentBriefs, shGeneratedCopy } from '../src/db/schema';
import { getShSettings } from '../src/lib/sh-settings';
import { callBcLlm } from '../src/lib/bc-llm-client';
import { buildShViralEngineSystemPrompt, buildShViralEngineUserPrompt } from '../src/lib/sh-viral-engine-prompts';
import { normalizeShViralEngineRuntime, type PcmFivePointSnapshot } from '../src/lib/sh-viral-engine-types';
import { resolveShViralEngine } from '../src/lib/sh-viral-engine';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const briefIdRaw = process.env.SH_BRIEF_ID;
const siteId = Number.parseInt(process.env.SITE_ID ?? '0', 10) || null;
const model = process.env.SH_COPYWRITER_MODEL || 'claude-sonnet-4-6';
const thinkingBudget = process.env.SH_COPYWRITER_THINKING_BUDGET
  ? parseInt(process.env.SH_COPYWRITER_THINKING_BUDGET, 10)
  : undefined;

interface CopyVariant {
  variantIndex: 0 | 1 | 2;
  hookLine: string;
  bodyText: string;
  hashtags: string[];
  cta: string;
  imageLayoutDescription: string;
  videoScript: string;
}

function log(message: string) {
  console.log(`[SH] ${message}`);
}

function shError(message: string): never {
  process.stderr.write(`SH_ERROR:${message}\n`);
  process.exit(1);
}

function normalizeHashtags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((tag) => String(tag ?? '').trim()).filter(Boolean);
}

function readBrandVoice(filePath: string): string {
  if (!filePath) return '';

  try {
    return readFileSync(filePath, 'utf-8').slice(0, 4_000);
  } catch {
    return '';
  }
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

async function run() {
  if (!briefIdRaw) shError('SH_BRIEF_ID env var is required');

  const briefId = parseInt(briefIdRaw, 10);
  if (Number.isNaN(briefId) || briefId <= 0) {
    shError(`Invalid SH_BRIEF_ID: ${briefIdRaw}`);
  }

  log('Loading brief and settings...');
  const briefScope = siteId ? or(eq(shContentBriefs.siteId, siteId), isNull(shContentBriefs.siteId)) : undefined;
  const [brief] = await db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), briefScope)).limit(1);
  if (!brief) shError(`Brief ${briefId} not found`);

  const resolvedSiteId = brief.siteId ?? siteId;
  const settings = await getShSettings(resolvedSiteId);
  const targetPlatforms = Array.isArray(brief.targetPlatforms) ? brief.targetPlatforms.map(String) : [];
  const defaultHashtags = normalizeHashtags(settings.defaultHashtags, []);
  const toneOverrides = settings.toneOverrides?.trim() || '';
  const brandVoice = readBrandVoice(settings.brandVoiceFile || process.env.SH_BRAND_VOICE_FILE || '');
  const runtimeFromEnv = process.env.SH_VIRAL_ENGINE_RUNTIME
    ? normalizeShViralEngineRuntime(JSON.parse(process.env.SH_VIRAL_ENGINE_RUNTIME))
    : null;

  const resolved = resolveShViralEngine(
    (brief.viralEngineProfile as any) ?? settings.viralEngine,
    null,
    {
      sourceType: String(brief.sourceType || runtimeFromEnv?.sourceType || ''),
      outputFormat: String(brief.outputFormat || runtimeFromEnv?.outputFormat || 'text'),
      briefId,
    },
  );

  if (runtimeFromEnv?.active && !resolved.runtime.active) {
    resolved.runtime.enabled = runtimeFromEnv.enabled;
    resolved.runtime.active = runtimeFromEnv.active;
    resolved.runtime.mode = runtimeFromEnv.mode;
    resolved.runtime.allowPersonalization = runtimeFromEnv.allowPersonalization;
    resolved.runtime.personalizationLabel = runtimeFromEnv.personalizationLabel;
    resolved.runtime.personalizationNotes = runtimeFromEnv.personalizationNotes;
  }

  const systemSections = [
    'You are a SocialHub social media copywriter.',
    brandVoice ? `Brand voice:\n${brandVoice}` : '',
    toneOverrides ? `Tone overrides:\n${toneOverrides}` : '',
    `Max post length: ${settings.maxPostLength} characters where relevant.`,
    'Write concrete, platform-native copy.',
    'Keep sentences short, readable, and specific.',
    'Banned words: leverage, revolutionary, innovative, game-changer.',
    buildShViralEngineSystemPrompt(resolved),
  ].filter(Boolean);

  const userSections = [
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
    targetPlatforms.join(', ') || 'general',
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
  ];

  const systemPrompt = systemSections.join('\n\n');
  const userPrompt = userSections.join('\n');

  const provider = process.env.BC_LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openrouter';
  log(`Calling AI copywriter using model: ${model} (provider: ${provider})...`);
  let responseText = '';

  try {
    const llmResp = await callBcLlm({
      model,
      maxTokens: 4096,
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    });
    responseText = llmResp.content.trim();
    log(`Got response (${responseText.length} chars)`);
  } catch (error: any) {
    shError(`LLM call failed: ${error.message}`);
  }

  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let variants: CopyVariant[];
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
    variants = parsed as CopyVariant[];
  } catch (error: any) {
    shError(`Failed to parse LLM response as JSON array: ${error.message}`);
  }

  if (!variants.length) shError('LLM returned zero variants');

  log(`Saving ${variants.length} variants...`);
  const fullPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;
  const pcmProfileRecord = toPcmRecord(resolved.runtime.writtenSnapshot);
  const contentAngle = resolved.pcmSnapshot?.hookAngle ?? resolved.runtime.selectionSummary;
  const videoFormatSlug = resolved.videoFormat?.slug ?? null;

  for (const variant of variants) {
    await db.insert(shGeneratedCopy).values({
      siteId: resolvedSiteId,
      briefId,
      hookLine: String(variant.hookLine || ''),
      bodyText: String(variant.bodyText || ''),
      hashtags: normalizeHashtags(variant.hashtags, defaultHashtags),
      cta: variant.cta ? String(variant.cta) : null,
      imageLayoutDescription: variant.imageLayoutDescription ? String(variant.imageLayoutDescription) : null,
      videoScript: variant.videoScript ? String(variant.videoScript) : null,
      variantIndex: typeof variant.variantIndex === 'number' ? variant.variantIndex : 0,
      generationModel: model,
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
    .where(and(eq(shContentBriefs.id, briefId), briefScope));

  log('Done.');
  process.stdout.write(`variantsCreated:${variants.length}\n`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ variantsCreated: variants.length, briefId })}\n`);
}

run().catch((error) => {
  process.stderr.write(`SH_ERROR:${error.message}\n`);
  process.exit(1);
});
