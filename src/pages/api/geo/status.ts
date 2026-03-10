import type { APIRoute } from 'astro';
import { geoJob } from '@/lib/geo-job';

/**
 * GET /api/geo/status
 *
 * Returns the current job state including ALL log lines collected so far.
 * Used by the frontend on page load to restore the panel state after
 * the user switched tabs or navigated away.
 *
 * Response shape:
 *   { status, startedAt, finishedAt, exitCode, queryCount, totalSteps, progress, lines[] }
 */
export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(geoJob.getSnapshot()), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
