/**
 * PUT    /api/brand-clarity/[projectId]/iterations/[itId]  — update name/intention
 * DELETE /api/brand-clarity/[projectId]/iterations/[itId]  — delete iteration (cascades)
 */
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcIterations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) { return !!cookies.get('session')?.value; }
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, cookies, request }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const itId = parseInt(params.itId || '0', 10);
  if (!projectId || !itId) return new Response(JSON.stringify({ error: 'Invalid ids' }), { status: 400, headers: JSON_HEADERS });

  let body: { name?: string; intention?: string } = {};
  try { body = await request.json(); } catch { /* empty ok */ }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.intention !== undefined) updates.intention = body.intention.trim() || null;

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcIterations)
    .set(updates)
    .where(and(eq(bcIterations.id, itId), eq(bcIterations.projectId, projectId)))
    .returning();

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify({ iteration: updated }), { headers: JSON_HEADERS });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const itId = parseInt(params.itId || '0', 10);
  if (!projectId || !itId) return new Response(JSON.stringify({ error: 'Invalid ids' }), { status: 400, headers: JSON_HEADERS });

  await db.delete(bcIterations)
    .where(and(eq(bcIterations.id, itId), eq(bcIterations.projectId, projectId)));

  return new Response(JSON.stringify({ deleted: true }), { headers: JSON_HEADERS });
};
