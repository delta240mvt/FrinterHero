export const prerender = false;

import type { APIRoute } from 'astro';
import { shCopywriterJob } from '@/lib/sh-copywriter-job';
import { getShSettings, buildShEnv } from '@/lib/sh-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  if (shCopywriterJob.isRunning()) {
    return new Response(
      JSON.stringify({ error: 'Copywriter already running', status: 'running' }),
      { status: 409, headers: JSON_HEADERS },
    );
  }

  const settings = await getShSettings();
  const extraEnv: Record<string, string> = {
    ...buildShEnv(settings),
    SH_BRIEF_ID: String(briefId),
  };

  const result = shCopywriterJob.start(briefId, extraEnv);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, status: 'started', briefId }), { headers: JSON_HEADERS });
};
