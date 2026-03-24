export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated } from '@/lib/internal-api';

function toLines(stdout: unknown) {
  return typeof stdout === 'string'
    ? stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  let sent = Math.max(0, parseInt(url.searchParams.get('from') || '0', 10));
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      const tick = async () => {
        const { data } = await fetchInternalApiJson({ request, pathname: '/v1/jobs/latest', query: { topic: 'youtube' } });
        const job = data?.job ?? null;
        const lines = toLines(job?.result?.stdout);
        while (sent < lines.length) {
          send({ line: lines[sent] });
          sent += 1;
        }
        if (job && ['done', 'error', 'cancelled'].includes(job.status)) {
          send({ done: true, code: job?.result?.code ?? (job.status === 'done' ? 0 : 1) });
          if (timer) clearInterval(timer);
          controller.close();
        }
      };

      void tick();
      timer = setInterval(() => void tick(), 2000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
