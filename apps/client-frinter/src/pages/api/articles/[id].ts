import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function articlePath(id: string | undefined) {
  return `/v1/admin/articles/${id ?? ''}`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: articlePath(params.id),
    includeSiteSlug: true,
  });

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: articlePath(params.id),
    includeSiteSlug: true,
  });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: articlePath(params.id),
    includeSiteSlug: true,
  });
