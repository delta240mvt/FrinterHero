export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../lib/internal-api';

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: `/v1/admin/bc/projects/${params.projectId ?? ''}/cluster-pain-points`,
    includeSiteSlug: true,
  });

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: `/v1/admin/bc/projects/${params.projectId ?? ''}/cluster-pain-points`,
    includeSiteSlug: true,
  });
