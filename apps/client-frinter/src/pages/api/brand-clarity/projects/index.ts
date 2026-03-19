import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

export const GET: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/bc/projects', includeSiteSlug: true });

export const POST: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/bc/projects', includeSiteSlug: true });
