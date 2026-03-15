import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcLandingPageVariants } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const id = parseInt(params.id || '0', 10);
  if (!projectId || !id) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  const [variant] = await db.select().from(bcLandingPageVariants)
    .where(and(eq(bcLandingPageVariants.id, id), eq(bcLandingPageVariants.projectId, projectId)));

  if (!variant) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(variant), { headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const id = parseInt(params.id || '0', 10);
  if (!projectId || !id) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const updates: Record<string, any> = {};
  if (body.isSelected !== undefined) updates.isSelected = Boolean(body.isSelected);

  if (!Object.keys(updates).length) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcLandingPageVariants).set(updates)
    .where(and(eq(bcLandingPageVariants.id, id), eq(bcLandingPageVariants.projectId, projectId)))
    .returning();

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};
