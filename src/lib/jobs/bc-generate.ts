import { db as defaultDb } from '../../db/client';
import { bcExtractedPainPoints, bcIterations, bcLandingPageVariants, bcPainClusters, bcProjects } from '../../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { callBcLlm, getBcGeneratorMaxTokens, getBcGeneratorModel, getBcThinkingBudget } from '../bc-llm-client';

interface PainCluster {
  id: number;
  clusterTheme: string;
  dominantEmotion: string | null;
  aggregateIntensity: number | null;
  bestQuotes: string[];
  synthesizedProblemLabel: string | null;
  synthesizedSuccessVision: string | null;
  failedSolutions: string[];
  triggerMoments: string[];
  painPointIds: number[];
}

export interface BcGenerateOptions {
  projectId: number;
  iterationId: number | null;
}

export interface BcGenerateResult {
  variantsGenerated: number;
  protocolLines: string[];
}

export function buildBcVariantPlan(clusters: PainCluster[], approvedPainPoints: any[]) {
  let cluster1: PainCluster | null = null;
  let cluster2: PainCluster | null = null;

  if (clusters.length >= 2) {
    const sorted = [...clusters].sort((left, right) => (right.aggregateIntensity || 0) - (left.aggregateIntensity || 0));
    cluster1 = sorted[0];
    cluster2 = sorted[1];
  } else if (clusters.length === 1) {
    cluster1 = clusters[0];
    cluster2 = clusters[0];
  } else {
    if (approvedPainPoints.length > 0) {
      const first = approvedPainPoints[0];
      cluster1 = {
        id: 0,
        clusterTheme: first.painPointTitle,
        dominantEmotion: 'frustration',
        aggregateIntensity: first.emotionalIntensity,
        bestQuotes: first.vocabularyQuotes as string[],
        synthesizedProblemLabel: first.painPointTitle,
        synthesizedSuccessVision: first.desiredOutcome,
        failedSolutions: [],
        triggerMoments: [],
        painPointIds: [first.id],
      };
    }
    if (approvedPainPoints.length > 1) {
      const second = approvedPainPoints[1];
      cluster2 = {
        id: 0,
        clusterTheme: second.painPointTitle,
        dominantEmotion: 'frustration',
        aggregateIntensity: second.emotionalIntensity,
        bestQuotes: second.vocabularyQuotes as string[],
        synthesizedProblemLabel: second.painPointTitle,
        synthesizedSuccessVision: second.desiredOutcome,
        failedSolutions: [],
        triggerMoments: [],
        painPointIds: [second.id],
      };
    }
  }

  return [
    { type: 'curiosity_hook', label: 'Curiosity Hook', cluster: cluster1 },
    { type: 'pain_mirror', label: cluster1 ? `Pain Mirror - ${cluster1.synthesizedProblemLabel || cluster1.clusterTheme}` : 'Pain Mirror', cluster: cluster1 },
    { type: 'outcome_promise', label: cluster2 ? `Outcome Promise - ${cluster2.synthesizedSuccessVision?.substring(0, 60) || cluster2.clusterTheme}` : 'Outcome Promise', cluster: cluster2 },
  ] as const;
}

export async function runBcGenerateJob(
  options: BcGenerateOptions,
  overrides: {
    db?: typeof defaultDb;
    callLlm?: typeof callBcLlm;
  } = {},
): Promise<BcGenerateResult> {
  const db = overrides.db ?? defaultDb;
  const callLlm = overrides.callLlm ?? callBcLlm;

  if (!options.projectId) throw new Error('BC_PROJECT_ID required');

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, options.projectId));
  if (!project) throw new Error(`Project ${options.projectId} not found`);

  const approvedPainPoints = await db
    .select()
    .from(bcExtractedPainPoints)
    .where(and(eq(bcExtractedPainPoints.projectId, options.projectId), eq(bcExtractedPainPoints.status, 'approved')))
    .orderBy(desc(bcExtractedPainPoints.emotionalIntensity))
    .limit(4);

  const clusters = await db
    .select()
    .from(bcPainClusters)
    .where(
      options.iterationId
        ? eq(bcPainClusters.iterationId, options.iterationId)
        : and(eq(bcPainClusters.projectId, options.projectId), isNull(bcPainClusters.iterationId)),
    );

  const variants = buildBcVariantPlan(clusters as PainCluster[], approvedPainPoints);
  let generatedCount = 0;

  if (options.iterationId) {
    await db.update(bcIterations).set({ status: 'generating' }).where(eq(bcIterations.id, options.iterationId));
  }

  for (const variant of variants) {
    const llmResponse = await callLlm({
      model: getBcGeneratorModel(),
      maxTokens: getBcGeneratorMaxTokens(),
      messages: [{ role: 'user', content: `Generate ${variant.type} landing page variant for ${project.name}.` }],
      thinkingBudget: getBcThinkingBudget('generator'),
    });

    await db.insert(bcLandingPageVariants).values({
      siteId: project.siteId ?? null,
      projectId: options.projectId,
      iterationId: options.iterationId ?? null,
      variantType: variant.type,
      variantLabel: variant.label,
      htmlContent: llmResponse.content,
      improvementSuggestions: {},
      featurePainMap: [],
      primaryPainPointId: variant.cluster?.painPointIds?.[0] ?? null,
      generationPromptUsed: `Generate ${variant.type}`,
      generationModel: getBcGeneratorModel(),
      isSelected: false,
    });
    generatedCount++;
  }

  await db.update(bcProjects).set({ status: 'done', updatedAt: new Date() }).where(eq(bcProjects.id, options.projectId));
  if (options.iterationId) {
    await db.update(bcIterations).set({ status: 'done' }).where(eq(bcIterations.id, options.iterationId));
  }

  return {
    variantsGenerated: generatedCount,
    protocolLines: [`VARIANTS_GENERATED:${generatedCount}`],
  };
}
