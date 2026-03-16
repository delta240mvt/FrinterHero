import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcExtractedPainPoints } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';
import { bcLpGenJob } from '@/lib/bc-lp-gen-job';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  if (bcLpGenJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Generation already running', status: 'running' }), { status: 409, headers: JSON_HEADERS });
  }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  if (!project.lpStructureJson) {
    return new Response(JSON.stringify({ error: 'lpStructureJson missing — run LP parser first' }), { status: 400, headers: JSON_HEADERS });
  }

  const approvedCount = await db.select({ id: bcExtractedPainPoints.id })
    .from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));

  if (!approvedCount.length) {
    return new Response(JSON.stringify({ error: 'No approved pain points — approve pain points first' }), { status: 400, headers: JSON_HEADERS });
  }

  await db.update(bcProjects).set({ status: 'generating', updatedAt: new Date() })
    .where(eq(bcProjects.id, projectId));

  const llmSettings = await getBcSettings();
  const result = bcLpGenJob.start(projectId, buildLlmEnv(llmSettings));
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ started: true, projectId }), { status: 202, headers: JSON_HEADERS });
};
