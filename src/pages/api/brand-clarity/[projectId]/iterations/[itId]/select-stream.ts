/**
 * GET /api/brand-clarity/[projectId]/iterations/[itId]/select-stream?from=N
 * SSE stream for selector job logs (mirrors scrape/stream.ts pattern).
 */
import type { APIRoute } from 'astro';
import { bcSelectorJob } from '@/lib/bc-selector-job';

function auth(cookies: any) { return !!cookies.get('session')?.value; }

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const from = parseInt(url.searchParams.get('from') || '0', 10);

  const snapshot = bcSelectorJob.getSnapshot();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      // Replay buffered lines
      const buffered = snapshot.lines.slice(from);
      for (const entry of buffered) {
        send({ line: entry.line });
      }

      if (snapshot.status !== 'running') {
        // Already finished — send final event and close
        send({ done: true, code: snapshot.exitCode ?? 0, selectedCount: snapshot.selectedCount });
        controller.close();
        return;
      }

      // Live events
      const onLine = (entry: { line: string }) => send({ line: entry.line });
      const onDone = ({ code, selectedCount }: { code: number | null; selectedCount: number }) => {
        send({ done: true, code: code ?? 0, selectedCount });
        bcSelectorJob.off('line', onLine);
        bcSelectorJob.off('done', onDone);
        try { controller.close(); } catch { /* already closed */ }
      };

      bcSelectorJob.on('line', onLine);
      bcSelectorJob.on('done', onDone);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
