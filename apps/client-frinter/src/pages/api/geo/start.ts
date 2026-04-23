export const prerender = false;
import type { APIRoute } from 'astro';
import { fetchInternalApiJson, JSON_HEADERS, jsonUnauthorized, isAuthenticated } from '../../../lib/internal-api';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/geo',
    method: 'POST',
    body: {},
    includeSiteSlug: true,
  });

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: JSON_HEADERS,
  });
};
