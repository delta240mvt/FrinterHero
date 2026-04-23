export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../lib/internal-api';

function resetDraftPath(id: string | undefined) {
  return `/v1/admin/content-gaps/${id ?? ''}/reset-draft`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: resetDraftPath(params.id),
  });
