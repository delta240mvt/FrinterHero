/**
 * sh-copywriter.ts — AI copywriter for SocialHub content briefs.
 *
 * Spawned as a child process by sh-copywriter-job.ts.
 * Model: SH_COPYWRITER_MODEL (default: claude-sonnet-4-6)
 * Input env: SH_BRIEF_ID, SH_COPYWRITER_MODEL, SH_COPYWRITER_THINKING_BUDGET
 * Output: inserts shGeneratedCopy rows, stdout RESULT_JSON:{"variantsCreated":3,"briefId":N}
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { readFileSync } from 'fs';
import { db } from '../src/db/client';
import { shContentBriefs, shGeneratedCopy } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { callBcLlm } from '../src/lib/bc-llm-client';
import { getBcSettings } from '../src/lib/bc-settings';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const briefIdRaw = process.env.SH_BRIEF_ID;
const model = process.env.SH_COPYWRITER_MODEL || 'claude-sonnet-4-6';
const thinkingBudget = process.env.SH_COPYWRITER_THINKING_BUDGET
  ? parseInt(process.env.SH_COPYWRITER_THINKING_BUDGET, 10)
  : undefined;

function log(msg: string) {
  console.log(`[SH] ${msg}`);
}

function shError(msg: string): never {
  process.stderr.write(`SH_ERROR:${msg}\n`);
  process.exit(1);
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

async function run() {
  if (!briefIdRaw) shError('SH_BRIEF_ID env var is required');
  const briefId = parseInt(briefIdRaw, 10);
  if (isNaN(briefId) || briefId <= 0) shError(`Invalid SH_BRIEF_ID: ${briefIdRaw}`);

  // ── 1. Load brief ────────────────────────────────────────────────────────────
  log('Loading brief and global LLM config...');
  const [brief] = await db.select().from(shContentBriefs).where(eq(shContentBriefs.id, briefId));
  if (!brief) shError(`Brief ${briefId} not found`);

  // Load Brand Clarity settings to get the preferred provider/config (user's "ściągnij ustawienia")
  const bcSettings = await getBcSettings();
  if (bcSettings.provider) {
    process.env.BC_LLM_PROVIDER = bcSettings.provider;
    log(`Using LLM provider from Brand Clarity settings: ${bcSettings.provider}`);
  }

  const targetPlatforms = Array.isArray(brief.targetPlatforms) ? brief.targetPlatforms : [];

  // ── 2. Load brand voice ──────────────────────────────────────────────────────
  let brandVoiceRaw = '';
  try {
    brandVoiceRaw = readFileSync('public/llms-full.txt', 'utf-8');
  } catch {
    // file missing — proceed without brand voice context
  }
  const brandVoice = brandVoiceRaw.substring(0, 2000);

  // ── 3. Build prompt ──────────────────────────────────────────────────────────
  const systemPrompt = [
    'You are a Social Media Copywriter.',
    brandVoice ? `Brand voice:\n${brandVoice}` : '',
    'Grade 6 reading level. Max 15 words per sentence.',
    'Banned words: leverage, revolutionary, innovative, game-changer.',
    'Style: direct, authentic, with humor.',
  ].filter(Boolean).join('\n');

  const userPrompt = `=== SOURCE ===
${brief.sourceSnapshot || '(no source snapshot)'}

=== SUGGESTION ===
${brief.suggestionPrompt || 'none'}

=== PLATFORMS ===
${targetPlatforms.join(', ') || 'general'}

Generate 3 copy variants (aggressive, empathetic, humorous). For EACH variant return a JSON object:
{ "variantIndex": 0|1|2, "hookLine": string, "bodyText": string, "hashtags": string[], "cta": string, "imageLayoutDescription": string, "videoScript": string }

Return ONLY a valid JSON array of 3 objects. No markdown, no explanation.`;

  // ── 4. Call AI ───────────────────────────────────────────────────────────────
  log('Calling AI copywriter...');
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
  } catch (e: any) {
    shError(`LLM call failed: ${e.message}`);
  }

  // ── 5. Parse JSON array from response ────────────────────────────────────────
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let variants: CopyVariant[];
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
    variants = parsed;
  } catch (e: any) {
    shError(`Failed to parse LLM response as JSON array: ${e.message}`);
  }

  if (variants.length === 0) shError('LLM returned zero variants');

  // ── 6. Save variants ─────────────────────────────────────────────────────────
  log(`Saving ${variants.length} variants...`);
  const fullPrompt = `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`;

  for (const v of variants) {
    await db.insert(shGeneratedCopy).values({
      briefId,
      hookLine:                 String(v.hookLine                || ''),
      bodyText:                 String(v.bodyText                || ''),
      hashtags:                 Array.isArray(v.hashtags)  ? v.hashtags.map(String)  : [],
      cta:                      v.cta                   ? String(v.cta)                   : null,
      imageLayoutDescription:   v.imageLayoutDescription ? String(v.imageLayoutDescription) : null,
      videoScript:              v.videoScript            ? String(v.videoScript)            : null,
      variantIndex:             typeof v.variantIndex === 'number' ? v.variantIndex : 0,
      generationModel:          model,
      promptUsed:               fullPrompt,
      status:                   'draft',
    });
  }

  // ── 7. Update brief status ───────────────────────────────────────────────────
  await db.update(shContentBriefs)
    .set({ status: 'copy_review' })
    .where(eq(shContentBriefs.id, briefId));

  // ── 8. Done ──────────────────────────────────────────────────────────────────
  log('Done.');
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ variantsCreated: variants.length, briefId })}\n`);
}

run().catch((e) => {
  process.stderr.write(`SH_ERROR:${e.message}\n`);
  process.exit(1);
});
