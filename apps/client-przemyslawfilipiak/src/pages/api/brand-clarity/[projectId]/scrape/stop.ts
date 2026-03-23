import type { APIRoute } from 'astro';
import { fetchInternalApiJson, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const { response, data } = await fetchInternalApiJson({
    request,
    pathname: '/v1/jobs/active',
    method: 'DELETE',
    
    query: { topic: 'bc-scrape' },
  });
  return new Response(JSON.stringify(data), { status: response.status, headers: JSON_HEADERS });
};
