import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcTargetVideos, bcTargetChannels } from '@/db/schema';
import { eq } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const videos = await db
    .select({
      id: bcTargetVideos.id,
      videoId: bcTargetVideos.videoId,
      videoUrl: bcTargetVideos.videoUrl,
      title: bcTargetVideos.title,
      description: bcTargetVideos.description,
      viewCount: bcTargetVideos.viewCount,
      commentCount: bcTargetVideos.commentCount,
      relevanceScore: bcTargetVideos.relevanceScore,
      publishedAt: bcTargetVideos.publishedAt,
      channelName: bcTargetChannels.channelName,
      channelUrl: bcTargetChannels.channelUrl,
    })
    .from(bcTargetVideos)
    .innerJoin(bcTargetChannels, eq(bcTargetVideos.channelId, bcTargetChannels.id))
    .where(eq(bcTargetVideos.projectId, projectId));

  return new Response(JSON.stringify(videos), { headers: JSON_HEADERS });
};
