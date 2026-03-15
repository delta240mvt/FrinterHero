import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcTargetChannels } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const channels = await db.select().from(bcTargetChannels)
    .where(eq(bcTargetChannels.projectId, projectId))
    .orderBy(asc(bcTargetChannels.sortOrder));

  return new Response(JSON.stringify(channels), { headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { channelId, channelName, channelUrl, channelHandle, subscriberCount, description } = body;
  if (!channelId?.trim() || !channelName?.trim() || !channelUrl?.trim()) {
    return new Response(JSON.stringify({ error: 'channelId, channelName, channelUrl required' }), { status: 400, headers: JSON_HEADERS });
  }

  // Find next sort order
  const existing = await db.select({ sortOrder: bcTargetChannels.sortOrder })
    .from(bcTargetChannels).where(eq(bcTargetChannels.projectId, projectId));
  const nextOrder = existing.length ? Math.max(...existing.map(r => r.sortOrder)) + 1 : 0;

  const [channel] = await db.insert(bcTargetChannels).values({
    projectId,
    channelId: channelId.trim(),
    channelName: channelName.trim().substring(0, 255),
    channelUrl: channelUrl.trim(),
    channelHandle: channelHandle?.trim() || null,
    subscriberCount: subscriberCount ? parseInt(subscriberCount, 10) : null,
    description: description?.trim() || null,
    discoveryMethod: 'manual',
    isConfirmed: true,
    sortOrder: nextOrder,
  }).returning();

  return new Response(JSON.stringify(channel), { status: 201, headers: JSON_HEADERS });
};
