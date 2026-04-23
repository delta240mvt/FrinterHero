export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../../lib/internal-api';

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: `/v1/admin/bc/projects/${params.id ?? ''}/documentation`,
    includeSiteSlug: true,
  });
