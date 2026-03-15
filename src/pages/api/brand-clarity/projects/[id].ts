import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects } from '@/db/schema';
import { eq } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id || '0', 10);
  if (!id) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, id));
  if (!project) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(project), { headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id || '0', 10);
  if (!id) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim().substring(0, 255);
  if (body.founderDescription !== undefined) updates.founderDescription = body.founderDescription;
  if (body.lpRawInput !== undefined) updates.lpRawInput = body.lpRawInput;
  if (body.status !== undefined) updates.status = body.status;

  const [updated] = await db.update(bcProjects).set(updates).where(eq(bcProjects.id, id)).returning();
  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id || '0', 10);
  if (!id) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  await db.delete(bcProjects).where(eq(bcProjects.id, id));
  return new Response(JSON.stringify({ deleted: true }), { headers: JSON_HEADERS });
};
