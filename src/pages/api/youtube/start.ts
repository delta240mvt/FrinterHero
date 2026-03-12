import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytTargets, ytScrapeRuns } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { ytScrapeJob } from '@/lib/yt-scrape-job';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (ytScrapeJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Job already running', status: 'running' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  let targetIds: number[] = [];
  try {
    const body = await request.json();
    targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(Number).filter(Boolean) : [];
  } catch {}

  const targets = targetIds.length
    ? await db.select().from(ytTargets).where(inArray(ytTargets.id, targetIds))
    : await db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  if (!targets.length) {
    return new Response(JSON.stringify({ error: 'No active targets configured' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const [run] = await db.insert(ytScrapeRuns).values({
    status: 'running',
    targetsScraped: targets.map(t => t.label),
  }).returning({ id: ytScrapeRuns.id });

  const result = ytScrapeJob.start(targets.map(t => String(t.id)), run.id);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ runId: run.id, status: 'started', targetsCount: targets.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
