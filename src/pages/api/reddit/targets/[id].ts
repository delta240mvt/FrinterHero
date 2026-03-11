import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditTargets } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const updates: any = {};
  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
  if (typeof body.priority === 'number') updates.priority = body.priority;
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();

  const [updated] = await db.update(redditTargets).set(updates).where(eq(redditTargets.id, id)).returning();
  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ target: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  await db.delete(redditTargets).where(eq(redditTargets.id, id));
  return new Response(null, { status: 204 });
};
