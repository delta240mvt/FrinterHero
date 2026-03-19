import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function route(id: string | undefined) {
  return `/v1/admin/reddit/targets/${id ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: route(params.id), includeSiteSlug: true });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: route(params.id), includeSiteSlug: true });
