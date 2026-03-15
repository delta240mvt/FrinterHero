import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcTargetChannels } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const channelId = parseInt(params.channelId || '0', 10);
  if (!projectId || !channelId) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const updates: Record<string, any> = {};
  if (body.isConfirmed !== undefined) updates.isConfirmed = Boolean(body.isConfirmed);
  if (body.sortOrder !== undefined) updates.sortOrder = parseInt(body.sortOrder, 10);
  if (body.channelName !== undefined) updates.channelName = body.channelName.substring(0, 255);

  if (!Object.keys(updates).length) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcTargetChannels).set(updates)
    .where(and(eq(bcTargetChannels.id, channelId), eq(bcTargetChannels.projectId, projectId)))
    .returning();

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const channelId = parseInt(params.channelId || '0', 10);
  if (!projectId || !channelId) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  await db.delete(bcTargetChannels)
    .where(and(eq(bcTargetChannels.id, channelId), eq(bcTargetChannels.projectId, projectId)));

  return new Response(JSON.stringify({ deleted: true }), { headers: JSON_HEADERS });
};
