export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function path(projectId: string | undefined, itId: string | undefined) {
  return `/v1/admin/bc/projects/${projectId ?? ''}/iterations/${itId ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.itId) });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.itId) });
