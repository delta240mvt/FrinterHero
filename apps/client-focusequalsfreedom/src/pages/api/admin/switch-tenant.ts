import type { APIRoute } from 'astro';
import { getInternalApiBaseUrl, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  const body = await request.json().catch(() => ({}));
  const siteSlug = typeof body.siteSlug === 'string' ? body.siteSlug.trim() : '';
  if (!siteSlug) {
    return new Response(JSON.stringify({ error: 'siteSlug is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const apiBase = getInternalApiBaseUrl();
  const response = await fetch(`${apiBase}/v1/auth/set-tenant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ siteSlug }),
  });

  const data = await response.json().catch(() => null);
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: JSON_HEADERS,
  });
};
