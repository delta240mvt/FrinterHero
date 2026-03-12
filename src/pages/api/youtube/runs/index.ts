import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytScrapeRuns } from '@/db/schema';
import { desc, count } from 'drizzle-orm';

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url   = new URL(request.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10));
  const offset = (page - 1) * limit;

  const [runs, totalRes] = await Promise.all([
    db.select().from(ytScrapeRuns).orderBy(desc(ytScrapeRuns.runAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(ytScrapeRuns),
  ]);

  return new Response(JSON.stringify({ runs, total: totalRes[0].c, page, limit }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
