export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

function toLines(stdout: unknown) {
  return typeof stdout === 'string'
    ? stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ line }))
    : [];
}

export const GET: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const { data } = await fetchInternalApiJson({
    request,
    pathname: `/v1/admin/bc/projects/${params.projectId ?? ''}/job-status`,
    includeSiteSlug: true,
    query: { topic: 'bc-scrape' },
  });
  const job = data?.job ?? null;
  const status = !job ? 'idle' : job.status === 'done' ? 'done' : job.status === 'error' || job.status === 'cancelled' ? 'error' : 'running';
  return new Response(JSON.stringify({
    status,
    projectId: job?.payload?.projectId ?? (params.projectId ? Number(params.projectId) : null),
    commentsCollected: job?.progress?.commentsCollected ?? 0,
    painPointsExtracted: job?.progress?.painPointsExtracted ?? 0,
    startedAt: job?.startedAt ?? null,
    finishedAt: job?.finishedAt ?? null,
    exitCode: job?.result?.code ?? null,
    result: job?.result ?? null,
    lines: toLines(job?.result?.stdout),
  }), { headers: JSON_HEADERS });
};
