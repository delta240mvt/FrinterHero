export const prerender = false;

import type { APIRoute } from 'astro';
import {
  addToQueue,
  getQueueStatus,
  clearQueue,
  removeQueueItem,
  reprioritizeQueueItem,
  runQueue,
  requestStop,
} from '@/lib/sh-queue-processor';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── GET: queue status ─────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const status = await getQueueStatus();
    return new Response(JSON.stringify(status), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Queue GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── POST: add brief(s) to queue ───────────────────────────────────────────────

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const briefIds: number[] = Array.isArray(body?.briefIds) ? body.briefIds.map(Number).filter(Boolean) : [];
  if (!briefIds.length) {
    return new Response(JSON.stringify({ error: 'briefIds must be a non-empty array of numbers' }), { status: 400, headers: JSON_HEADERS });
  }

  const priority = typeof body?.priority === 'number' ? Math.min(100, Math.max(0, body.priority)) : 50;

  try {
    const ids: number[] = [];
    for (const briefId of briefIds) {
      const id = await addToQueue(briefId, priority);
      ids.push(id);
    }
    return new Response(JSON.stringify({ ok: true, queueIds: ids }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Queue POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── DELETE: clear done/failed items ──────────────────────────────────────────

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  // Optional: delete a single item by id via ?id=123
  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');

  try {
    if (idParam) {
      const id = parseInt(idParam, 10);
      if (!id || isNaN(id)) {
        return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });
      }
      await removeQueueItem(id);
      return new Response(JSON.stringify({ ok: true, removed: id }), { status: 200, headers: JSON_HEADERS });
    }

    // No id param → clear all done/failed
    await clearQueue();
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Queue DELETE]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── PUT: start/stop processing, or reprioritize ───────────────────────────────

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const action: string = body?.action ?? '';

  try {
    if (action === 'start') {
      // Fire-and-forget: run queue in background without awaiting
      runQueue().catch(err => console.error('[SocialHub Queue runQueue]', err));
      return new Response(JSON.stringify({ ok: true, action: 'started' }), { status: 200, headers: JSON_HEADERS });
    }

    if (action === 'stop') {
      requestStop();
      return new Response(JSON.stringify({ ok: true, action: 'stop_requested' }), { status: 200, headers: JSON_HEADERS });
    }

    if (action === 'reprioritize') {
      const id = Number(body?.id);
      const priority = Number(body?.priority);
      if (!id || isNaN(id) || isNaN(priority)) {
        return new Response(JSON.stringify({ error: 'id and priority are required for reprioritize' }), { status: 400, headers: JSON_HEADERS });
      }
      const clamped = Math.min(100, Math.max(0, priority));
      await reprioritizeQueueItem(id, clamped);
      return new Response(JSON.stringify({ ok: true, id, priority: clamped }), { status: 200, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Queue PUT]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
