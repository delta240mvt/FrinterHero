export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '../../../lib/internal-api';

export const GET: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/bc/settings', includeSiteSlug: true });

export const PUT: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/bc/settings', includeSiteSlug: true });
