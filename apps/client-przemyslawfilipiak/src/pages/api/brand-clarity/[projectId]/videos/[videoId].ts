import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function path(projectId: string | undefined, videoId: string | undefined) {
  return `/v1/admin/bc/projects/${projectId ?? ''}/videos/${videoId ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: path(params.projectId, params.videoId) });
