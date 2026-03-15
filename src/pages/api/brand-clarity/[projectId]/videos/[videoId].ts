import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcTargetVideos } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const videoId = parseInt(params.videoId || '0', 10);
  if (!projectId || !videoId) return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  if (body.isSelected === undefined) {
    return new Response(JSON.stringify({ error: 'isSelected required' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcTargetVideos)
    .set({ isSelected: Boolean(body.isSelected) })
    .where(and(eq(bcTargetVideos.id, videoId), eq(bcTargetVideos.projectId, projectId)))
    .returning({ id: bcTargetVideos.id, isSelected: bcTargetVideos.isSelected });

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};
