import type { APIRoute } from 'astro';
import { geoJob, type GeoLogEntry } from '@/lib/geo-job';

/**
 * GET /api/geo/stream?from=N
 *
 * SSE endpoint that streams GEO Monitor log events.
 *
 * Behaviour:
 *  1. Sends a catch-up burst of all log lines already collected (starting
 *     from index `from`, default 0). This lets a reconnecting client
 *     skip lines it already displayed.
 *  2. If the job is already finished, sends { done, code } and closes.
 *  3. Otherwise subscribes to the live EventEmitter and streams new lines
 *     as they arrive from the child process.
 *  4. When the client disconnects (tab closed / navigation), the
 *     ReadableStream `cancel` handler removes all listeners — the child
 *     process keeps running on the server.
 *
 * Events sent:
 *   data: { "line": "..." }
 *   data: { "done": true, "code": 0 }
 */
export const GET: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url       = new URL(request.url);
  const fromIndex = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10));
  const encoder   = new TextEncoder();

  // These are declared outside ReadableStream so both start() and cancel()
  // can reference them for proper event-listener cleanup.
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  const send = (payload: object) => {
    try {
      ctrl?.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      // Controller already closed (client gone) — ignore
    }
  };

  const onLine = (entry: GeoLogEntry) => send({ line: entry.line });

  const onDone = ({ code }: { code: number | null }) => {
    send({ done: true, code: code ?? 0 });
    try { ctrl?.close(); } catch {}
    cleanup();
  };

  const cleanup = () => {
    geoJob.off('line', onLine);
    geoJob.off('done', onDone);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const snap = geoJob.getSnapshot();

      // ── 1. Catch-up burst ────────────────────────────────────────────────
      for (let i = fromIndex; i < snap.lines.length; i++) {
        send({ line: snap.lines[i].line });
      }

      // ── 2. Already finished → send done and close ────────────────────────
      if (snap.status !== 'running') {
        send({ done: true, code: snap.exitCode ?? 0 });
        c.close();
        return;
      }

      // ── 3. Subscribe to live events ──────────────────────────────────────
      geoJob.on('line', onLine);
      geoJob.on('done', onDone);
    },

    cancel() {
      // Client disconnected (tab switch, navigation, browser close).
      // Remove listeners so the GeoJobManager doesn't accumulate dead refs.
      // The child process keeps running — it's owned by geo-job.ts, not this stream.
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
