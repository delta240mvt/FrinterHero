/**
 * bc-pain-selector.ts — AI-powered top-30 pain point selector for iterations.
 *
 * Model: claude-sonnet-4-6 (reasoning quality matters here)
 * Input env: BC_PROJECT_ID, BC_ITERATION_ID
 * Output: inserts bcIterationSelections rows, stdout SELECTED:N
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcExtractedPainPoints, bcIterations, bcIterationSelections } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { callBcLlm, getBcClusterModel, getBcClusterMaxTokens } from '../src/lib/bc-llm-client';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BC_PROJECT_ID  = parseInt(process.env.BC_PROJECT_ID  || '0', 10);
const BC_ITERATION_ID = parseInt(process.env.BC_ITERATION_ID || '0', 10);
const MODEL     = getBcClusterModel();
const MAX_TOKENS = getBcClusterMaxTokens();

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-SELECTOR] ${msg}`);
}

async function run() {
  if (!BC_PROJECT_ID)   { console.error('[ERROR] BC_PROJECT_ID required');   process.exit(1); }
  if (!BC_ITERATION_ID) { console.error('[ERROR] BC_ITERATION_ID required'); process.exit(1); }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }
  const projectSiteId = project.siteId ?? null;

  const [iteration] = await db.select().from(bcIterations).where(eq(bcIterations.id, BC_ITERATION_ID));
  if (!iteration) { console.error(`[ERROR] Iteration ${BC_ITERATION_ID} not found`); process.exit(1); }

  const intention = iteration.intention?.trim() || '';
  if (!intention) { console.error('[ERROR] Iteration has no intention set'); process.exit(1); }

  // Load all approved pain points for this project
  const painPoints = await db.select().from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, BC_PROJECT_ID),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));

  if (painPoints.length === 0) {
    console.error('[ERROR] No approved pain points in project');
    process.exit(1);
  }

  log(`Selecting top 30 from ${painPoints.length} approved pain points`);
  log(`Iteration intention: "${intention.substring(0, 120)}"`);

  // Build compact or full format depending on base size
  const useFull = painPoints.length <= 60;

  const ppList = painPoints.map((pp) => {
    const base = `ID:${pp.id} | "${pp.painPointTitle}" | intensity:${pp.emotionalIntensity}/10 | category:${pp.category}`;
    if (!useFull) return base;
    const voc = (pp as any).vocData as any;
    return `${base}
  customerLanguage: ${pp.customerLanguage || 'N/A'}
  desiredOutcome: ${pp.desiredOutcome || 'N/A'}
  ${voc ? `problemLabel: ${voc.problemLabel} | emotion: ${voc.dominantEmotion}` : ''}`;
  }).join('\n\n');

  const maxSelect = Math.min(30, painPoints.length);

  const prompt = `You are a conversion copywriting expert. Your task: select the best pain points to drive a targeted landing page.

ITERATION INTENT:
"${intention}"

PROJECT: ${project.name}
NICHE: ${Array.isArray(project.nicheKeywords) ? (project.nicheKeywords as string[]).join(', ') : 'high performance'}

AVAILABLE PAIN POINTS (${painPoints.length} total):
${ppList}

SELECTION RULES:
1. Select exactly ${maxSelect} pain points that best serve the iteration intent
2. Prioritize: direct relevance to intent > emotional intensity > specific customer language
3. Ensure variety across categories — avoid selecting 5 versions of the same problem
4. Rank 1 = most relevant to intent, rank ${maxSelect} = least

Return ONLY valid JSON, no markdown:
{
  "selected": [
    {
      "painPointId": <number>,
      "rank": <1-${maxSelect}>,
      "selectionReason": "<1 sentence why this fits the intent>"
    }
  ]
}`;

  let responseText = '';
  try {
    const llmResp = await callBcLlm({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    responseText = llmResp.content.trim();
    log(`Got LLM response (${responseText.length} chars)`);
  } catch (e: any) {
    log(`[ERROR] LLM call failed: ${e.message}`);
    process.exit(1);
  }

  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed: { selected: Array<{ painPointId: number; rank: number; selectionReason: string }> };
  try {
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.selected)) throw new Error('Expected .selected array');
  } catch (e: any) {
    log(`[ERROR] Failed to parse LLM response: ${e.message}`);
    process.exit(1);
  }

  // Validate that referenced pain point IDs actually exist in project
  const validIds = new Set(painPoints.map(pp => pp.id));
  const validSelections = parsed.selected.filter(s => validIds.has(s.painPointId));

  if (validSelections.length === 0) {
    log('[ERROR] No valid pain point IDs in selection');
    process.exit(1);
  }

  // Delete previous selections for this iteration (re-run support)
  await db.delete(bcIterationSelections).where(eq(bcIterationSelections.iterationId, BC_ITERATION_ID));

  let inserted = 0;
  for (const sel of validSelections) {
    await db.insert(bcIterationSelections).values({
      siteId: projectSiteId,
      iterationId: BC_ITERATION_ID,
      painPointId: sel.painPointId,
      rank: sel.rank,
      selectionReason: sel.selectionReason ? String(sel.selectionReason).substring(0, 500) : null,
    });
    inserted++;
  }

  // Update iteration status
  await db.update(bcIterations)
    .set({ status: 'selected' })
    .where(eq(bcIterations.id, BC_ITERATION_ID));

  log(`Done. Inserted ${inserted} selections.`);
  process.stdout.write(`SELECTED:${inserted}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
