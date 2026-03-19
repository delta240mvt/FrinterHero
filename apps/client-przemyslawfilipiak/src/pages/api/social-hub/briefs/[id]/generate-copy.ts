export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

export const POST: APIRoute = ({ params, request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: `/v1/social-hub/briefs/${params.id ?? ''}/generate-copy`,
  });
