export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const GET: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const { data } = await fetchInternalApiJson({
    request,
    pathname: `/v1/admin/bc/projects/${params.projectId ?? ''}/job-status`,
    includeSiteSlug: true,
    query: { topic: 'bc-generate' },
  });
  const job = data?.job ?? null;
  return new Response(JSON.stringify({
    status: !job ? 'idle' : job.status === 'done' ? 'done' : job.status === 'error' || job.status === 'cancelled' ? 'error' : 'running',
    projectId: job?.payload?.projectId ?? (params.projectId ? Number(params.projectId) : null),
    variantsGenerated: job?.progress?.variantsGenerated ?? 0,
    startedAt: job?.startedAt ?? null,
    finishedAt: job?.finishedAt ?? null,
    exitCode: job?.result?.code ?? null,
    linesCount: typeof job?.result?.stdout === 'string' ? job.result.stdout.split(/\r?\n/).filter(Boolean).length : 0,
  }), { headers: JSON_HEADERS });
};
