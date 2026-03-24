export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function route(id: string | undefined) {
  return `/v1/admin/youtube/gaps/${id ?? ''}/reject`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: route(params.id), includeSiteSlug: true });
