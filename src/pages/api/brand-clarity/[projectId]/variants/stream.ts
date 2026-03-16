import type { APIRoute } from 'astro';
import { bcLpGenJob, type BcGenLogEntry } from '@/lib/bc-lp-gen-job';

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

  const onLine = (entry: BcGenLogEntry) => send({ line: entry.line });
  const onDone = ({ code, variantsGenerated }: { code: number | null; variantsGenerated: number }) => {
    send({ done: true, code: code ?? 0, variantsGenerated });
    try { ctrl?.close(); } catch {}
    cleanup();
  };
  const cleanup = () => {
    bcLpGenJob.off('line', onLine);
    bcLpGenJob.off('done', onDone);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      const snap = bcLpGenJob.getSnapshot();

      // Replay buffered lines
      for (let i = fromIndex; i < snap.lines.length; i++) {
        send({ line: snap.lines[i].line });
      }

      if (snap.status !== 'running') {
        send({ done: true, code: snap.exitCode ?? 0, variantsGenerated: snap.variantsGenerated });
        c.close();
        return;
      }

      bcLpGenJob.on('line', onLine);
      bcLpGenJob.on('done', onDone);
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
