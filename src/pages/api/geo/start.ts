import type { APIRoute } from 'astro';
import { geoJob } from '@/lib/geo-job';

/** POST /api/geo/start — spawn the GEO monitor job in the background */
export const POST: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = geoJob.start();

  if (!result.ok) {
    // Already running — frontend should connect to /api/geo/stream
    return new Response(JSON.stringify({ error: result.reason, status: 'running' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ status: 'started' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
