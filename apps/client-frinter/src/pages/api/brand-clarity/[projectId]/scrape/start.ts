export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../../../lib/internal-api';

export const POST: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({
    request,
    cookies,
    pathname: '/v1/jobs/bc-scrape',
    includeSiteSlug: true,
  });
