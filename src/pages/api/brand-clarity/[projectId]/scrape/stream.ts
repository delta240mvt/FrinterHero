import type { APIRoute } from 'astro';
import { bcScrapeJob, type BcLogEntry } from '@/lib/bc-scrape-job';

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

  const onLine = (entry: BcLogEntry) => send({ line: entry.line });
  const onDone = ({ code }: { code: number | null }) => {
    send({ done: true, code: code ?? 0 });
    try { ctrl?.close(); } catch {}
    cleanup();
  };
  const cleanup = () => {
    bcScrapeJob.off('line', onLine);
    bcScrapeJob.off('done', onDone);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const snap = bcScrapeJob.getSnapshot();

      for (let i = fromIndex; i < snap.lines.length; i++) {
        send({ line: snap.lines[i].line });
      }

      if (snap.status !== 'running') {
        send({ done: true, code: snap.exitCode ?? 0 });
        c.close();
        return;
      }

      bcScrapeJob.on('line', onLine);
      bcScrapeJob.on('done', onDone);
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
