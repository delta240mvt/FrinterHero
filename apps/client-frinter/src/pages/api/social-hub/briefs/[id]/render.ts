export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../../lib/internal-api';

function renderPath(id: string | undefined) {
  return `/v1/social-hub/briefs/${id ?? ''}/render`;
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: renderPath(params.id) });

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: renderPath(params.id) });
