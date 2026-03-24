export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function archivePath(id: string | undefined) {
  return `/v1/admin/content-gaps/${id ?? ''}/archive`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: archivePath(params.id),
    includeSiteSlug: true,
  });
