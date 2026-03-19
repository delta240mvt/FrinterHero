import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function path(projectId: string | undefined) {
  return `/v1/admin/bc/projects/${projectId ?? ''}/videos`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId), includeSiteSlug: true });
