import type { APIRoute } from 'astro';
import { fetchInternalApiJson, JSON_HEADERS, jsonUnauthorized, isAuthenticated } from '@/lib/internal-api';

function toLines(stdout: unknown) {
  return typeof stdout === 'string'
    ? stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ line }))
    : [];
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const [{ data: activeData }, { data: latestData }] = await Promise.all([
    fetchInternalApiJson({ request, pathname: '/v1/jobs/active', includeSiteSlug: true, query: { topic: 'youtube' } }),
    fetchInternalApiJson({ request, pathname: '/v1/jobs/latest', includeSiteSlug: true, query: { topic: 'youtube' } }),
  ]);

  const activeJob = activeData?.job ?? null;
  const latestJob = latestData?.job ?? null;
  const job = activeJob ?? latestJob;
  const status = activeJob
    ? 'running'
    : latestJob?.status === 'done'
      ? 'done'
      : latestJob?.status === 'error' || latestJob?.status === 'cancelled'
        ? 'error'
        : 'idle';

  return new Response(JSON.stringify({
    status,
    startedAt: job?.startedAt ?? null,
    finishedAt: job?.finishedAt ?? null,
    exitCode: job?.result?.code ?? null,
    lines: toLines(job?.result?.stdout),
  }), {
    status: 200,
    headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
  });
};
