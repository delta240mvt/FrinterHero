export const prerender = false;

import type { APIRoute } from 'astro';
import { buildInternalApiUrl, isAuthenticated } from '@/lib/internal-api';

const TERMINAL_JOB_STATUSES = new Set(['done', 'error', 'cancelled']);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const GET: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return new Response('Unauthorized', { status: 401 });

  const briefId = Number(params.id ?? 0);
  if (!briefId) return new Response('Invalid brief id', { status: 400 });

  const encoder = new TextEncoder();
  const cookieHeader = request.headers.get('cookie');
  let cancelled = false;

  const send = (controller: ReadableStreamDefaultController<Uint8Array>, payload: Record<string, unknown>) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastJobId: number | null = null;
      let lastStatus = '';

      try {
        while (!cancelled) {
          const response = await fetch(
            buildInternalApiUrl(`/v1/social-hub/briefs/${briefId}/job-status`, '?topic=sh-copy'),
            {
              headers: cookieHeader ? { cookie: cookieHeader } : undefined,
            },
          );

          if (!response.ok) {
            send(controller, { done: true, code: response.status, status: 'error' });
            controller.close();
            return;
          }

          const data = await response.json().catch(() => ({ job: null })) as {
            job?: {
              id?: number;
              status?: string;
              error?: string | null;
              result?: {
                metrics?: {
                  variantsCreated?: number;
                };
              } | null;
            } | null;
          };

          const job = data.job ?? null;
          const variantCount = job?.result?.metrics?.variantsCreated;

          if (job?.id && job.id !== lastJobId) {
            lastJobId = job.id;
            send(controller, { line: `[sh-copy] Job ${job.id} connected` });
          }

          if (job?.status && job.status !== lastStatus) {
            lastStatus = job.status;
            send(controller, {
              line: `[sh-copy] Status: ${job.status}`,
              variantCount,
            });
          }

          if (job && TERMINAL_JOB_STATUSES.has(job.status ?? '')) {
            if (job.error) send(controller, { line: `[sh-copy] ${job.error}` });
            send(controller, {
              done: true,
              code: job.status === 'done' ? 0 : 1,
              status: job.status,
              variantCount,
              result: job.result ?? null,
            });
            controller.close();
            return;
          }

          await sleep(1500);
        }
      } catch (error) {
        send(controller, {
          done: true,
          code: 1,
          status: 'error',
          line: error instanceof Error ? error.message : 'Stream failed',
        });
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
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
