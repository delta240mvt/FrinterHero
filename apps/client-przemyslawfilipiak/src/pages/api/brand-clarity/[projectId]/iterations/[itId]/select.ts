export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const GET: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: `/v1/admin/bc/projects/${params.projectId ?? ''}/job-status`,
    
    query: { topic: 'bc-selector', iterationId: params.itId ?? '' },
  });
  return new Response(JSON.stringify(data), { status: response.status, headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const body = await request.json().catch(() => ({}));
  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/bc-selector',
    method: 'POST',
    
    body: { projectId: Number(params.projectId), iterationId: Number(params.itId), ...body },
  });
  return new Response(JSON.stringify(data), { status: response.status, headers: JSON_HEADERS });
};
