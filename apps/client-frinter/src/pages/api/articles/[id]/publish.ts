import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function publishPath(id: string | undefined) {
  return `/v1/admin/articles/${id ?? ''}/publish`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: publishPath(params.id),
    includeSiteSlug: true,
  });
