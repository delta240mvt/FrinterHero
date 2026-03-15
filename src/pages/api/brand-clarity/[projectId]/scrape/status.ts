import type { APIRoute } from 'astro';
import { bcScrapeJob } from '@/lib/bc-scrape-job';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const snap = bcScrapeJob.getSnapshot();
  return new Response(JSON.stringify({
    status: snap.status,
    projectId: snap.projectId,
    commentsCollected: snap.commentsCollected,
    painPointsExtracted: snap.painPointsExtracted,
    startedAt: snap.startedAt,
    finishedAt: snap.finishedAt,
    exitCode: snap.exitCode,
    result: snap.result,
    linesCount: snap.lines.length,
  }), { headers: JSON_HEADERS });
};
