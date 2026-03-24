export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function acknowledgePath(id: string | undefined) {
  return `/v1/admin/content-gaps/${id ?? ''}/acknowledge`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: acknowledgePath(params.id),
    
  });
