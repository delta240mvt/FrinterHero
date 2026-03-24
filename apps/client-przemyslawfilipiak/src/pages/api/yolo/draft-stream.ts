export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated } from '@/lib/internal-api';

function toLogLines(progress: unknown): string[] {
  if (!progress || typeof progress !== 'object') return [];
  const logs = (progress as any).logs;
  if (!Array.isArray(logs)) return [];
  return logs.map((entry: any) => (typeof entry === 'object' ? entry.line : entry)).filter(Boolean);
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') ?? '';

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const sentLines: Record<number, number> = {};
  const reportedDone = new Set<number>();
  const reportedRunning = new Set<number>();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      const tick = async () => {
        const { data } = await fetchInternalApiJson({
          request,
          pathname: '/v1/admin/yolo/draft-status',
          query: { ids: idsParam },
        });
        const jobs: Array<{ id: number; status: string; result: any; progress: any; error: string | null }> =
          data?.jobs ?? [];

        for (const job of jobs) {
          if (!sentLines[job.id]) sentLines[job.id] = 0;

          // Emit status transition: pending → running
          if (job.status === 'running' && !reportedRunning.has(job.id)) {
            reportedRunning.add(job.id);
            send({ jobRunning: true, jobId: job.id });
          }

          // Stream live logs from progress.logs
          const lines = toLogLines(job.progress);
          while (sentLines[job.id] < lines.length) {
            send({ line: lines[sentLines[job.id]], jobId: job.id });
            sentLines[job.id]++;
          }

          if (['done', 'error', 'cancelled'].includes(job.status) && !reportedDone.has(job.id)) {
            reportedDone.add(job.id);
            send({ jobDone: true, jobId: job.id, status: job.status, error: job.error ?? null });
          }
        }

        const allFinished =
          jobs.length > 0 &&
          jobs.every((j) => ['done', 'error', 'cancelled'].includes(j.status));
        if (allFinished) {
          const errors = jobs.filter((j) => j.status !== 'done').length;
          send({ done: true, total: jobs.length, errors });
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
