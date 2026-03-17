/**
 * bc-pain-clusterer.ts — Clusters approved pain points into 2-3 thematic groups.
 *
 * Model: claude-sonnet-4-6 (1 call — precision matters for synthesis)
 * Input env: BC_PROJECT_ID
 * Output: inserts bcPainClusters rows, stdout CLUSTERS_CREATED:N
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcExtractedPainPoints, bcPainClusters, bcIterations, bcIterationSelections } from '../src/db/schema';
import { eq, and, desc, asc, isNull } from 'drizzle-orm';
import { callBcLlm, getBcClusterModel, getBcClusterMaxTokens, getBcThinkingBudget } from '../src/lib/bc-llm-client';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BC_PROJECT_ID   = parseInt(process.env.BC_PROJECT_ID   || '0', 10);
const BC_ITERATION_ID = parseInt(process.env.BC_ITERATION_ID || '0', 10) || null;
const MODEL = getBcClusterModel();
const MAX_TOKENS = getBcClusterMaxTokens();
const THINKING_BUDGET = getBcThinkingBudget('cluster');

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-CLUSTER] ${msg}`);
}

async function run() {
  if (!BC_PROJECT_ID) { console.error('[ERROR] BC_PROJECT_ID required'); process.exit(1); }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }

  const niche = Array.isArray(project.nicheKeywords)
    ? (project.nicheKeywords as string[]).join(', ')
    : 'high performance, focus';

  // Load pain points — from iteration selection if BC_ITERATION_ID provided, else all approved
  let painPoints: any[];
  if (BC_ITERATION_ID) {
    const [iteration] = await db.select().from(bcIterations).where(eq(bcIterations.id, BC_ITERATION_ID));
    if (!iteration) { console.error(`[ERROR] Iteration ${BC_ITERATION_ID} not found`); process.exit(1); }
    log(`Clustering iteration ${BC_ITERATION_ID}: "${iteration.name}"`);
    const rows = await db
      .select({ pp: bcExtractedPainPoints })
      .from(bcIterationSelections)
      .innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id))
      .where(eq(bcIterationSelections.iterationId, BC_ITERATION_ID))
      .orderBy(asc(bcIterationSelections.rank));
    painPoints = rows.map(r => r.pp);
  } else {
    painPoints = await db.select().from(bcExtractedPainPoints)
      .where(and(
        eq(bcExtractedPainPoints.projectId, BC_PROJECT_ID),
        eq(bcExtractedPainPoints.status, 'approved'),
      ))
      .orderBy(desc(bcExtractedPainPoints.emotionalIntensity));
  }

  if (painPoints.length < 2) {
    console.error('[ERROR] Need at least 2 approved pain points to cluster');
    process.exit(1);
  }

  log(`Clustering ${painPoints.length} pain points for "${project.name}"`);

  // Build pain point summary for LLM
  const ppSummary = painPoints.map((pp, i) => {
    const voc = (pp as any).vocData as any;
    return `[${i + 1}] ID:${pp.id}
  Title: ${pp.painPointTitle}
  Intensity: ${pp.emotionalIntensity}/10 | Frequency: ${pp.frequency} | Category: ${pp.category}
  Description: ${pp.painPointDescription}
  Customer Language: ${pp.customerLanguage || 'N/A'}
  Desired Outcome: ${pp.desiredOutcome || 'N/A'}
  Quotes: ${(pp.vocabularyQuotes as string[]).slice(0, 3).join(' | ')}
  ${voc ? `Problem Label: ${voc.problemLabel} | Emotion: ${voc.dominantEmotion} | Trigger: ${voc.triggerMoment}` : ''}`;
  }).join('\n\n');

  const prompt = `You are a customer research analyst. You have ${painPoints.length} validated customer pain points extracted from YouTube comments about "${niche}".

Group these into 2-3 DISTINCT clusters. Each cluster represents a DIFFERENT dimension of customer frustration.

RULES:
- Clusters must be MEANINGFULLY DIFFERENT (not subcategories of the same issue)
- Weight by: frequency × intensity (recurring pain at intensity 7 > one-off at intensity 10)
- Each cluster synthesizes the shared voice across all its pain points
- Use the customers' own words, not marketing language

PAIN POINTS:
${ppSummary}

OUTPUT: JSON array of 2-3 clusters:
[
  {
    "clusterTheme": "1 sentence describing what unites these pain points",
    "dominantEmotion": "ONE word: frustration | shame | fear | longing | anger | exhaustion | overwhelm",
    "aggregateIntensity": 8.5,
    "synthesizedProblemLabel": "how customers collectively NAME this problem — in their plain words",
    "synthesizedSuccessVision": "what success looks like across these pain points — in customer words, concrete",
    "bestQuotes": ["most powerful verbatim quote", "second most powerful", "third"],
    "failedSolutions": ["thing they tried 1", "thing they tried 2", "thing they tried 3"],
    "triggerMoments": ["specific situation 1", "specific situation 2"],
    "painPointIds": [1, 3, 7]
  }
]

Return ONLY valid JSON array. No markdown.`;

  let responseText = '';
  try {
    const llmResp = await callBcLlm({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
      thinkingBudget: THINKING_BUDGET,
    });
    responseText = llmResp.content.trim();
    log(`Got response (${responseText.length} chars)`);
  } catch (e: any) {
    log(`[ERROR] LLM call failed: ${e.message}`);
    process.exit(1);
  }

  // Parse response
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let clusters: any[];
  try {
    clusters = JSON.parse(cleaned);
    if (!Array.isArray(clusters)) throw new Error('Expected JSON array');
  } catch (e: any) {
    log(`[ERROR] Failed to parse clusters: ${e.message}`);
    process.exit(1);
  }

  // Delete existing clusters (scoped to iteration if provided, else project-global)
  if (BC_ITERATION_ID) {
    await db.delete(bcPainClusters).where(eq(bcPainClusters.iterationId, BC_ITERATION_ID));
    // Update iteration status
    await db.update(bcIterations).set({ status: 'clustering' }).where(eq(bcIterations.id, BC_ITERATION_ID));
  } else {
    await db.delete(bcPainClusters).where(
      and(eq(bcPainClusters.projectId, BC_PROJECT_ID), isNull(bcPainClusters.iterationId))
    );
  }

  let created = 0;
  for (const cluster of clusters.slice(0, 3)) {
    await db.insert(bcPainClusters).values({
      projectId: BC_PROJECT_ID,
      iterationId: BC_ITERATION_ID ?? null,
      clusterTheme: String(cluster.clusterTheme || '').substring(0, 255),
      dominantEmotion: String(cluster.dominantEmotion || 'frustration').substring(0, 100),
      aggregateIntensity: parseFloat(String(cluster.aggregateIntensity || 7)),
      bestQuotes: Array.isArray(cluster.bestQuotes) ? cluster.bestQuotes.slice(0, 5).map(String) : [],
      synthesizedProblemLabel: cluster.synthesizedProblemLabel ? String(cluster.synthesizedProblemLabel) : null,
      synthesizedSuccessVision: cluster.synthesizedSuccessVision ? String(cluster.synthesizedSuccessVision) : null,
      failedSolutions: Array.isArray(cluster.failedSolutions) ? cluster.failedSolutions.map(String) : [],
      triggerMoments: Array.isArray(cluster.triggerMoments) ? cluster.triggerMoments.map(String) : [],
      painPointIds: Array.isArray(cluster.painPointIds) ? cluster.painPointIds.map(Number) : [],
    });
    created++;
    log(`  Created cluster: "${cluster.clusterTheme}"`);
  }

  // Mark iteration as clustered
  if (BC_ITERATION_ID) {
    await db.update(bcIterations).set({ status: 'clustered' }).where(eq(bcIterations.id, BC_ITERATION_ID));
  }

  log(`Done. ${created} clusters created.`);
  process.stdout.write(`CLUSTERS_CREATED:${created}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
