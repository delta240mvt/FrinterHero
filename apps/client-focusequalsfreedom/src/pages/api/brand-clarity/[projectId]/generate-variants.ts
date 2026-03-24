export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const body = await request.json().catch(() => ({}));
  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/bc-generate',
    method: 'POST',
    includeSiteSlug: true,
    body: { projectId: Number(params.projectId), ...body },
  });
  return new Response(JSON.stringify(data), { status: response.status, headers: JSON_HEADERS });
};
