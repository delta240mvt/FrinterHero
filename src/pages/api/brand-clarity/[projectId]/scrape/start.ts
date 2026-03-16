import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcTargetVideos } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { bcScrapeJob } from '@/lib/bc-scrape-job';
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  if (bcScrapeJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Scrape already running', status: 'running' }), { status: 409, headers: JSON_HEADERS });
  }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  const videos = await db.select({ id: bcTargetVideos.id })
    .from(bcTargetVideos)
    .where(and(eq(bcTargetVideos.projectId, projectId), eq(bcTargetVideos.isSelected, true)));

  if (!videos.length) {
    return new Response(JSON.stringify({ error: 'No selected videos — select at least one video to scrape' }), { status: 400, headers: JSON_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const videoId = parseInt(body?.videoId || '0', 10);

  const llmSettings = await getBcSettings();
  const extraEnv: Record<string, string> = { ...buildLlmEnv(llmSettings) };
  if (videoId) extraEnv.BC_VIDEO_ID = String(videoId);

  const result = bcScrapeJob.start(projectId, extraEnv);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ started: true, projectId, videoId: videoId || null, videosCount: videos.length }), { headers: JSON_HEADERS });
};
