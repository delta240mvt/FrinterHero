import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytTargets } from '@/db/schema';
import { desc } from 'drizzle-orm';

function extractVideoId(url: string): string | null {
  try { return new URL(url).searchParams.get('v') ?? null; } catch { return null; }
}

/**
 * Extracts channel handle or channel ID from a YouTube channel URL.
 * @calnewport → "calnewport"
 * youtube.com/@calnewport → "calnewport"
 * youtube.com/channel/UCxxxx → "UCxxxx"
 * youtube.com/c/Name → "Name"
 */
function extractChannelHandle(url: string): string | null {
  try {
    const trimmed = url.trim();
    if (/^@[\w.-]+$/.test(trimmed)) return trimmed.replace(/^@/, '');

    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel') return parts[1] ?? null;
    if (parts[0]?.startsWith('@')) return parts[0].replace('@', '');
    if (parts[0] === 'c' || parts[0] === 'user') return parts[1] ?? null;
    return null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const targets = await db.select().from(ytTargets).orderBy(desc(ytTargets.priority));
  return new Response(JSON.stringify({ targets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!body.url?.trim() || !body.label?.trim())
    return new Response(JSON.stringify({ error: 'url and label required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const type: 'video' | 'channel' = body.type === 'channel' ? 'channel' : 'video';
  const url = body.url.trim();

  const videoId = type === 'video' ? (body.videoId?.trim() || extractVideoId(url) || null) : null;
  const channelHandle = type === 'channel' ? (body.channelHandle?.trim() || extractChannelHandle(url) || null) : null;

  const [target] = await db.insert(ytTargets).values({
    type,
    url,
    label: body.label.trim(),
    videoId,
    channelHandle,
    maxVideosPerChannel: parseInt(body.maxVideosPerChannel || '5', 10),
    priority: parseInt(body.priority || '50', 10),
    maxComments: parseInt(body.maxComments || '300', 10),
    isActive: body.isActive !== false,
  }).returning();

  return new Response(JSON.stringify({ target }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
