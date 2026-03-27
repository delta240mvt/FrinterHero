import { db as defaultDb } from '../../db/client';
import { bcExtractedPainPoints, bcIterationSelections, bcIterations, bcProjects } from '../../db/schema';
import { and, eq } from 'drizzle-orm';
import { callBcLlm, getBcClusterMaxTokens, getBcClusterModel } from '../bc-llm-client';

export interface BcSelectorOptions {
  projectId: number;
  iterationId: number;
}

export interface BcSelectorResult {
  selectedCount: number;
  protocolLines: string[];
}

export function sanitizeBcSelections(
  responseText: string,
  validIds: Set<number>,
): Array<{ painPointId: number; rank: number; selectionReason: string }> {
  const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned) as {
    selected: Array<{ painPointId: number; rank: number; selectionReason: string }>;
  };

  if (!Array.isArray(parsed.selected)) {
    throw new Error('Expected .selected array');
  }

  return parsed.selected.filter((selection) => validIds.has(selection.painPointId));
}

export async function runBcSelectorJob(
  options: BcSelectorOptions,
  overrides: {
    db?: typeof defaultDb;
    callLlm?: typeof callBcLlm;
  } = {},
): Promise<BcSelectorResult> {
  const db = overrides.db ?? defaultDb;
  const callLlm = overrides.callLlm ?? callBcLlm;

  if (!options.projectId) throw new Error('BC_PROJECT_ID required');
  if (!options.iterationId) throw new Error('BC_ITERATION_ID required');

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, options.projectId));
  if (!project) throw new Error(`Project ${options.projectId} not found`);

  const [iteration] = await db.select().from(bcIterations).where(eq(bcIterations.id, options.iterationId));
  if (!iteration) throw new Error(`Iteration ${options.iterationId} not found`);

  const intention = iteration.intention?.trim() || '';
  if (!intention) throw new Error('Iteration has no intention set');

  const painPoints = await db
    .select()
    .from(bcExtractedPainPoints)
    .where(and(eq(bcExtractedPainPoints.projectId, options.projectId), eq(bcExtractedPainPoints.status, 'approved')));
  if (painPoints.length === 0) throw new Error('No approved pain points in project');

  const ppList = painPoints
    .map(
      (painPoint) =>
        `ID:${painPoint.id} | "${painPoint.painPointTitle}" | intensity:${painPoint.emotionalIntensity}/10 | category:${painPoint.category}`,
    )
    .join('\n');

  const llmResponse = await callLlm({
    model: getBcClusterModel(),
    maxTokens: getBcClusterMaxTokens(),
    messages: [
      {
        role: 'user',
        content: `ITERATION INTENT:\n"${intention}"\n\nAVAILABLE PAIN POINTS:\n${ppList}\n\nReturn JSON with selected[].`,
      },
    ],
  });

  const validSelections = sanitizeBcSelections(llmResponse.content, new Set(painPoints.map((painPoint) => painPoint.id)));
  if (validSelections.length === 0) throw new Error('No valid pain point IDs in selection');

  await db.delete(bcIterationSelections).where(eq(bcIterationSelections.iterationId, options.iterationId));
  for (const selection of validSelections) {
    await db.insert(bcIterationSelections).values({
      siteId: project.siteId ?? null,
      iterationId: options.iterationId,
      painPointId: selection.painPointId,
      rank: selection.rank,
      selectionReason: selection.selectionReason ? String(selection.selectionReason).substring(0, 500) : null,
    });
  }

  await db.update(bcIterations).set({ status: 'selected' }).where(eq(bcIterations.id, options.iterationId));

  return {
    selectedCount: validSelections.length,
    protocolLines: [`SELECTED:${validSelections.length}`],
  };
}
