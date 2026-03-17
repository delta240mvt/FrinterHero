export const prerender = false;

import type { APIRoute } from 'astro';
import { publishBrief } from '@/lib/sh-distributor';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies, request }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  let body: { accountIds?: number[]; scheduledFor?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional — ignore parse errors
  }

  const overrides: { accountIds?: number[]; scheduledFor?: Date } = {};

  if (Array.isArray(body.accountIds) && body.accountIds.length > 0) {
    overrides.accountIds = body.accountIds.map((id) => parseInt(String(id), 10)).filter(Boolean);
  }

  if (body.scheduledFor) {
    const d = new Date(body.scheduledFor);
    if (!isNaN(d.getTime())) {
      overrides.scheduledFor = d;
    }
  }

  try {
    const publishLogs = await publishBrief(briefId, overrides);
    return new Response(
      JSON.stringify({ ok: true, publishLogs }),
      { headers: JSON_HEADERS },
    );
  } catch (err: any) {
    console.error('[SocialHub Publish POST]', err);
    const message: string = err?.message ?? 'Server error';

    // Surface domain errors (missing copy, media, accounts) as 422
    const isDomainError =
      message.includes('no approved copy') ||
      message.includes('no completed media') ||
      message.includes('no target accounts') ||
      message.includes('No active accounts');

    return new Response(
      JSON.stringify({ error: message }),
      { status: isDomainError ? 422 : 500, headers: JSON_HEADERS },
    );
  }
};
