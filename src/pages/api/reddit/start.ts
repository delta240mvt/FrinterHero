import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditTargets, redditScrapeRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redditScrapeJob } from '@/lib/reddit-scrape-job';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (redditScrapeJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Job already running', status: 'running' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  let targets: string[] = [];
  try {
    const body = await request.json();
    targets = body.targets || [];
  } catch {}

  if (!targets.length) {
    const active = await db.select({ value: redditTargets.value }).from(redditTargets).where(eq(redditTargets.isActive, true));
    targets = active.map(t => t.value);
  }

  if (!targets.length) {
    return new Response(JSON.stringify({ error: 'No active targets configured' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const [run] = await db.insert(redditScrapeRuns).values({
    status: 'running',
    targetsScraped: targets,
  }).returning({ id: redditScrapeRuns.id });

  const result = redditScrapeJob.start(targets, run.id);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ runId: run.id, status: 'started', targetsCount: targets.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
