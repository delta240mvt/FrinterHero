import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function path(projectId: string | undefined, channelId: string | undefined) {
  return `/v1/admin/bc/projects/${projectId ?? ''}/channels/${channelId ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.channelId), includeSiteSlug: true });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.channelId), includeSiteSlug: true });
