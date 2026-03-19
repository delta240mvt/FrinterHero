export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

function templatePath(id: string | undefined) {
  return `/v1/social-hub/templates/${id ?? ''}`;
}

export const PUT: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: templatePath(params.id) });

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: templatePath(params.id) });
