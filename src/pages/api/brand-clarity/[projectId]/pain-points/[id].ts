import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcExtractedPainPoints } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const id = parseInt(params.id || '0', 10);
  if (!projectId || !id) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (!validStatuses.includes(body.status)) {
    return new Response(JSON.stringify({ error: `status must be one of: ${validStatuses.join(', ')}` }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcExtractedPainPoints).set({
    status: body.status,
  }).where(and(
    eq(bcExtractedPainPoints.id, id),
    eq(bcExtractedPainPoints.projectId, projectId),
  )).returning();

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const id = parseInt(params.id || '0', 10);
  if (!projectId || !id) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  await db.delete(bcExtractedPainPoints)
    .where(and(eq(bcExtractedPainPoints.id, id), eq(bcExtractedPainPoints.projectId, projectId)));

  return new Response(JSON.stringify({ deleted: true }), { headers: JSON_HEADERS });
};
