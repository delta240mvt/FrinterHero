import { db as defaultDb } from '../../db/client';
import { bcExtractedPainPoints, bcIterationSelections, bcIterations, bcPainClusters, bcProjects } from '../../db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { callBcLlm, getBcClusterMaxTokens, getBcClusterModel, getBcThinkingBudget } from '../bc-llm-client';

export interface BcClusterOptions {
  projectId: number;
  iterationId: number | null;
}

export interface BcClusterResult {
  clustersCreated: number;
  protocolLines: string[];
}

export function sanitizeBcClusters(responseText: string): any[] {
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }
  return parsed.slice(0, 3);
}

export async function runBcClusterJob(
  options: BcClusterOptions,
  overrides: {
    db?: typeof defaultDb;
    callLlm?: typeof callBcLlm;
  } = {},
): Promise<BcClusterResult> {
  const db = overrides.db ?? defaultDb;
  const callLlm = overrides.callLlm ?? callBcLlm;

  if (!options.projectId) throw new Error('BC_PROJECT_ID required');

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, options.projectId));
  if (!project) throw new Error(`Project ${options.projectId} not found`);

  let painPoints: any[];
  if (options.iterationId) {
    const [iteration] = await db.select().from(bcIterations).where(eq(bcIterations.id, options.iterationId));
    if (!iteration) throw new Error(`Iteration ${options.iterationId} not found`);
    const rows = await db
      .select({ pp: bcExtractedPainPoints })
      .from(bcIterationSelections)
      .innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id))
      .where(eq(bcIterationSelections.iterationId, options.iterationId))
      .orderBy(asc(bcIterationSelections.rank));
    painPoints = rows.map((row) => row.pp);
  } else {
    painPoints = await db
      .select()
      .from(bcExtractedPainPoints)
      .where(and(eq(bcExtractedPainPoints.projectId, options.projectId), eq(bcExtractedPainPoints.status, 'approved')))
      .orderBy(desc(bcExtractedPainPoints.emotionalIntensity));
  }

  if (painPoints.length < 2) throw new Error('Need at least 2 approved pain points to cluster');

  const summary = painPoints.map((painPoint, index) => `[${index + 1}] ID:${painPoint.id} ${painPoint.painPointTitle}`).join('\n');
  const llmResponse = await callLlm({
    model: getBcClusterModel(),
    maxTokens: getBcClusterMaxTokens(),
    messages: [{ role: 'user', content: `Group these into 2-3 clusters.\n${summary}` }],
    thinkingBudget: getBcThinkingBudget('cluster'),
  });

  const clusters = sanitizeBcClusters(llmResponse.content);

  if (options.iterationId) {
    await db.delete(bcPainClusters).where(eq(bcPainClusters.iterationId, options.iterationId));
    await db.update(bcIterations).set({ status: 'clustering' }).where(eq(bcIterations.id, options.iterationId));
  } else {
    await db.delete(bcPainClusters).where(and(eq(bcPainClusters.projectId, options.projectId), isNull(bcPainClusters.iterationId)));
  }

  let created = 0;
  for (const cluster of clusters) {
    await db.insert(bcPainClusters).values({
      siteId: project.siteId ?? null,
      projectId: options.projectId,
      iterationId: options.iterationId ?? null,
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
  }

  if (options.iterationId) {
    await db.update(bcIterations).set({ status: 'clustered' }).where(eq(bcIterations.id, options.iterationId));
  }

  return {
    clustersCreated: created,
    protocolLines: [`CLUSTERS_CREATED:${created}`],
  };
}
