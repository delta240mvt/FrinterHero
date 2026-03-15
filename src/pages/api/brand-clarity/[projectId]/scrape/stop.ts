import type { APIRoute } from 'astro';
import { bcScrapeJob } from '@/lib/bc-scrape-job';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  if (!bcScrapeJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'No scrape running' }), { status: 409, headers: JSON_HEADERS });
  }

  const stopped = bcScrapeJob.stop();
  return new Response(JSON.stringify({ stopped }), { headers: JSON_HEADERS });
};
