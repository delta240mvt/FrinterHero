export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function projectPath(id: string | undefined) {
  return `/v1/admin/bc/projects/${id ?? ''}`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: projectPath(params.id) });

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: projectPath(params.id) });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: projectPath(params.id) });
