export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../lib/internal-api';

function entryPath(id: string | undefined) {
  return `/v1/admin/knowledge-base/${id ?? ''}`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: entryPath(params.id),
    includeSiteSlug: true,
  });

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: entryPath(params.id),
    includeSiteSlug: true,
  });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: entryPath(params.id),
    includeSiteSlug: true,
  });
