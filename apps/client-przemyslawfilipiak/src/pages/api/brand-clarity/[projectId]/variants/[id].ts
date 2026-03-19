import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function path(projectId: string | undefined, id: string | undefined) {
  return `/v1/admin/bc/projects/${projectId ?? ''}/variants/${id ?? ''}`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.id), includeSiteSlug: true });

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.id), includeSiteSlug: true });
