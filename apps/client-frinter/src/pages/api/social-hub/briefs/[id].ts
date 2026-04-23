export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../lib/internal-api';

function briefPath(id: string | undefined) {
  return `/v1/social-hub/briefs/${id ?? ''}`;
}

export const GET: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: briefPath(params.id) });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: briefPath(params.id) });
