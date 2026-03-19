export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest, jsonError } from '@/lib/internal-api';

export const GET: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/social-hub/templates' });

export const POST: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/social-hub/templates' });

export const PUT: APIRoute = ({ request, cookies }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Missing or invalid ?id= query parameter', 400);
  return proxyInternalApiRequest({ request, cookies, pathname: `/v1/social-hub/templates/${id}` });
};
