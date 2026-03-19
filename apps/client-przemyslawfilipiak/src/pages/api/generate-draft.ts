import type { APIRoute } from 'astro';
import { proxyInternalApiRequest, fetchInternalApiJson, isAuthenticated, jsonUnauthorized } from '@/lib/internal-api';

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

  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/active',
    query: { topic: 'draft' },
    includeSiteSlug: true,
  });

  return new Response(JSON.stringify(data ?? { status: 'idle', job: null }), {
    status: response.status,
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
