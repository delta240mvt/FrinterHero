import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytTargets } from '@/db/schema';
import { desc } from 'drizzle-orm';

function extractVideoId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('v') ?? null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const targets = await db.select().from(ytTargets).orderBy(desc(ytTargets.priority));
  return new Response(JSON.stringify({ targets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!body.url?.trim() || !body.label?.trim()) {
    return new Response(JSON.stringify({ error: 'url and label required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const videoId = body.videoId?.trim() || extractVideoId(body.url.trim()) || null;

  const [target] = await db.insert(ytTargets).values({
    type: 'video',
    url: body.url.trim(),
    label: body.label.trim(),
    videoId,
    priority: parseInt(body.priority || '50', 10),
    maxComments: parseInt(body.maxComments || '300', 10),
    isActive: body.isActive !== false,
  }).returning();

  return new Response(JSON.stringify({ target }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
