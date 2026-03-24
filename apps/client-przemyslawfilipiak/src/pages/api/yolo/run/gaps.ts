import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

export const POST: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/yolo/run/gaps' });
