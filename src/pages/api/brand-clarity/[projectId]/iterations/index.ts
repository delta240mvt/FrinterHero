/**
 * GET  /api/brand-clarity/[projectId]/iterations  — list iterations
 * POST /api/brand-clarity/[projectId]/iterations  — create iteration
 */
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcIterations, bcIterationSelections } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

function auth(cookies: any) { return !!cookies.get('session')?.value; }
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const iterations = await db.select().from(bcIterations)
    .where(eq(bcIterations.projectId, projectId))
    .orderBy(desc(bcIterations.createdAt));

  // Attach selection count for each iteration
  const result = await Promise.all(iterations.map(async (it) => {
    const sels = await db.select({ id: bcIterationSelections.id })
      .from(bcIterationSelections)
      .where(eq(bcIterationSelections.iterationId, it.id));
    return { ...it, selectionCount: sels.length };
  }));

  return new Response(JSON.stringify({ iterations: result }), { headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  let body: { name?: string; intention?: string } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  const name = (body.name || '').trim() || `Iteracja ${new Date().toLocaleDateString('pl-PL')}`;

  const [iteration] = await db.insert(bcIterations).values({
    projectId,
    name,
    intention: body.intention?.trim() || null,
    status: 'draft',
  }).returning();

  return new Response(JSON.stringify({ iteration }), { status: 201, headers: JSON_HEADERS });
};
