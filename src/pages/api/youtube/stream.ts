import type { APIRoute } from 'astro';
import { ytScrapeJob, type YtLogEntry } from '@/lib/yt-scrape-job';

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url       = new URL(request.url);
  const fromIndex = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10));
  const encoder   = new TextEncoder();

  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;

  const send = (payload: object) => {
    try { ctrl?.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch {}
  };

  const onLine = (entry: YtLogEntry) => send({ line: entry.line });
  const onDone = ({ code }: { code: number | null }) => {
    send({ done: true, code: code ?? 0 });
    try { ctrl?.close(); } catch {}
    cleanup();
  };
  const cleanup = () => {
    ytScrapeJob.off('line', onLine);
    ytScrapeJob.off('done', onDone);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const snap = ytScrapeJob.getSnapshot();

      for (let i = fromIndex; i < snap.lines.length; i++) {
        send({ line: snap.lines[i].line });
      }

      if (snap.status !== 'running') {
        send({ done: true, code: snap.exitCode ?? 0 });
        c.close();
        return;
      }

      ytScrapeJob.on('line', onLine);
      ytScrapeJob.on('done', onDone);
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
