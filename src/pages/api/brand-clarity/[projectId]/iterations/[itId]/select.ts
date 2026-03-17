/**
 * POST /api/brand-clarity/[projectId]/iterations/[itId]/select
 * Starts AI pain point selection for this iteration (fire-and-forget).
 */
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcIterations, bcExtractedPainPoints } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';
import { bcSelectorJob } from '@/lib/bc-selector-job';

function auth(cookies: any) { return !!cookies.get('session')?.value; }
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  const snapshot = bcSelectorJob.getSnapshot();
  return new Response(JSON.stringify(snapshot), { headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId   = parseInt(params.projectId || '0', 10);
  const itId        = parseInt(params.itId || '0', 10);
  if (!projectId || !itId) return new Response(JSON.stringify({ error: 'Invalid ids' }), { status: 400, headers: JSON_HEADERS });

  if (bcSelectorJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Selection already running', status: 'running' }), { status: 409, headers: JSON_HEADERS });
  }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  const [iteration] = await db.select().from(bcIterations)
    .where(and(eq(bcIterations.id, itId), eq(bcIterations.projectId, projectId)));
  if (!iteration) return new Response(JSON.stringify({ error: 'Iteration not found' }), { status: 404, headers: JSON_HEADERS });

  if (!iteration.intention?.trim()) {
    return new Response(JSON.stringify({ error: 'Set an intention before selecting pain points' }), { status: 400, headers: JSON_HEADERS });
  }

  const approved = await db.select({ id: bcExtractedPainPoints.id })
    .from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));

  if (approved.length === 0) {
    return new Response(JSON.stringify({ error: 'No approved pain points — approve some first' }), { status: 400, headers: JSON_HEADERS });
  }

  // Mark iteration as selecting
  await db.update(bcIterations).set({ status: 'selecting' }).where(eq(bcIterations.id, itId));

  const llmSettings = await getBcSettings();
  const result = bcSelectorJob.start(projectId, itId, buildLlmEnv(llmSettings));
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ started: true, projectId, iterationId: itId, approvedCount: approved.length }), { status: 202, headers: JSON_HEADERS });
};
