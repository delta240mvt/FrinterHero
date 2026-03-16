import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcTargetChannels, bcTargetVideos } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function parseVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shorts) return shorts[1];
    const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
    if (embed) return embed[1];
  } catch {}
  return null;
}

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const body = await request.json().catch(() => ({}));
  const url = String(body?.url || '').trim();
  if (!url) return new Response(JSON.stringify({ error: 'URL required' }), { status: 400, headers: JSON_HEADERS });

  const videoId = parseVideoId(url);
  if (!videoId) return new Response(JSON.stringify({ error: 'Could not parse YouTube video ID from URL' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey) return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }), { status: 500, headers: JSON_HEADERS });

  // Fetch video details from YouTube API
  const ytUrl = new URL(`${YT_BASE}/videos`);
  ytUrl.searchParams.set('part', 'snippet,statistics');
  ytUrl.searchParams.set('id', videoId);
  ytUrl.searchParams.set('key', ytKey);

  const ytRes = await fetch(ytUrl.toString());
  if (!ytRes.ok) {
    const err: any = await ytRes.json().catch(() => ({}));
    const msg = err?.error?.message ?? `YouTube API ${ytRes.status}`;
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: JSON_HEADERS });
  }
  const ytData = await ytRes.json();
  const item = ytData?.items?.[0];
  if (!item) return new Response(JSON.stringify({ error: 'Video not found on YouTube' }), { status: 404, headers: JSON_HEADERS });

  const snippet = item.snippet;
  const stats = item.statistics;
  const ytChannelId: string = snippet.channelId;
  const ytChannelTitle: string = snippet.channelTitle;

  // Check if video already exists
  const [existing] = await db.select({ id: bcTargetVideos.id }).from(bcTargetVideos)
    .where(and(eq(bcTargetVideos.projectId, projectId), eq(bcTargetVideos.videoId, videoId)));
  if (existing) return new Response(JSON.stringify({ error: 'Video already added to this project' }), { status: 409, headers: JSON_HEADERS });

  // Find or create channel entry
  let [channel] = await db.select().from(bcTargetChannels)
    .where(and(eq(bcTargetChannels.projectId, projectId), eq(bcTargetChannels.channelId, ytChannelId)));

  if (!channel) {
    [channel] = await db.insert(bcTargetChannels).values({
      projectId,
      channelId: ytChannelId,
      channelName: ytChannelTitle,
      channelUrl: `https://www.youtube.com/channel/${ytChannelId}`,
      isConfirmed: true,
    }).returning();
  }

  const [inserted] = await db.insert(bcTargetVideos).values({
    projectId,
    channelId: channel.id,
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: (snippet.title || videoId).substring(0, 500),
    description: snippet.description ? snippet.description.substring(0, 500) : null,
    viewCount: parseInt(stats?.viewCount || '0', 10) || null,
    commentCount: parseInt(stats?.commentCount || '0', 10) || null,
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
    relevanceScore: 0.5,
    isSelected: true,
  }).returning({ id: bcTargetVideos.id, videoId: bcTargetVideos.videoId, title: bcTargetVideos.title });

  return new Response(JSON.stringify({
    id: inserted.id,
    videoId: inserted.videoId,
    title: inserted.title,
    channelName: ytChannelTitle,
    channelId: channel.id,
    viewCount: parseInt(stats?.viewCount || '0', 10) || 0,
    commentCount: parseInt(stats?.commentCount || '0', 10) || 0,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }), { headers: JSON_HEADERS });
};
