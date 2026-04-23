export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest, fetchInternalApiJson, isAuthenticated, jsonUnauthorized } from '../../lib/internal-api';

function jobLinesFromSnapshot(job: any) {
  if (!job) return [];

  const createdTs = job?.createdAt ? Date.parse(job.createdAt) : Date.now();
  const startedTs = job?.startedAt ? Date.parse(job.startedAt) : createdTs;
  const progressLogs = Array.isArray(job?.progress?.logs)
    ? job.progress.logs
        .filter((entry: any) => entry && typeof entry.line === 'string')
        .map((entry: any) => ({
          line: entry.line,
          ts: typeof entry.ts === 'number' ? entry.ts : startedTs,
        }))
    : [];

  const lines = [
    { line: `[JOB] Created ${job.topic} job #${job.id}`, ts: createdTs },
    ...(job.status === 'pending' || job.status === 'running'
      ? [{ line: '[JOB] Running in distributed worker...', ts: startedTs }]
      : []),
    ...progressLogs,
    ...(job.error
      ? [{ line: `[JOB] ${job.error}`, ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() }]
      : []),
    ...(job.result?.domainResult?.article_id
      ? [{ line: `[JOB] Draft created: article #${job.result.domainResult.article_id}`, ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() }]
      : []),
    ...(job.status === 'cancelled'
      ? [{ line: '[JOB] Cancelled manually', ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() }]
      : []),
  ];

  return lines;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { gap_id, author_notes, model } = body;
  if (!gap_id) {
    return new Response(JSON.stringify({ error: 'gap_id is required' }), { status: 400 });
  }

  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/draft',
    method: 'POST',
    body: {
      gapId: Number(gap_id),
      authorNotes: author_notes || '',
      model: model || 'anthropic/claude-sonnet-4-6',
    },
    includeSiteSlug: true,
  });

  return new Response(JSON.stringify(data ?? { success: true, message: 'Draft generation started in background' }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  const [{ response: activeResponse, data: activeData }, { data: latestData }] = await Promise.all([
    fetchInternalApiJson({
      request,
      pathname: '/v1/jobs/active',
      query: { topic: 'draft' },
      includeSiteSlug: true,
    }),
    fetchInternalApiJson({
      request,
      pathname: '/v1/jobs/latest',
      query: { topic: 'draft' },
      includeSiteSlug: true,
    }),
  ]);

  const job = activeData?.job ?? latestData?.job ?? null;
  const payload = !job
    ? { status: 'idle', gapId: null, canAbort: false, lines: [], result: null }
    : {
        status: job.status === 'pending' || job.status === 'cancelled' ? (job.status === 'cancelled' ? 'idle' : 'running') : job.status,
        gapId: job.payload?.gapId ?? null,
        canAbort: job.status === 'pending' || job.status === 'running',
        lines: jobLinesFromSnapshot(job),
        startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
        finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
        result: job.result?.domainResult ?? job.result ?? null,
      };

  return new Response(JSON.stringify(payload), {
    status: activeResponse.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/active',
    method: 'DELETE',
    query: { topic: 'draft' },
    includeSiteSlug: true,
  });

  return new Response(JSON.stringify(data ?? { success: false }), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
