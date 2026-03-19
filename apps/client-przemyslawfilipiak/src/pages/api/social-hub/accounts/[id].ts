export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function accountPath(id: string | undefined) {
  return `/v1/social-hub/accounts/${id ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: accountPath(params.id) });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: accountPath(params.id) });
