export const prerender = false;

import type { APIRoute } from 'astro';
import { shCopywriterJob, type ShCopywriterLogEntry } from '@/lib/sh-copywriter-job';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const fromIndex = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10));
  const encoder = new TextEncoder();

  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  const send = (payload: object) => {
    try { ctrl?.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch {}
  };

  const onLine = (entry: ShCopywriterLogEntry) => send({ line: entry.line });
  const onDone = ({ code }: { code: number | null }) => {
    const snap = shCopywriterJob.getSnapshot();
    send({ done: true, code: code ?? 0, status: snap.status, result: snap.result });
    try { ctrl?.close(); } catch {}
    cleanup();
  };
  const cleanup = () => {
    shCopywriterJob.off('line', onLine);
    shCopywriterJob.off('done', onDone);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const snap = shCopywriterJob.getSnapshot();

      for (let i = fromIndex; i < snap.lines.length; i++) {
        send({ line: snap.lines[i].line });
      }

      if (snap.status !== 'running') {
        send({ done: true, code: snap.exitCode ?? 0, status: snap.status });
        c.close();
        return;
      }

      shCopywriterJob.on('line', onLine);
      shCopywriterJob.on('done', onDone);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
