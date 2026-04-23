export const prerender = false;
import type { APIRoute } from 'astro';
import { buildInternalApiUrl } from '../../lib/internal-api';

export const GET: APIRoute = async ({ request, redirect }) => {
  const response = await fetch(buildInternalApiUrl('/v1/auth/logout'), {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
    redirect: 'manual',
  });

  const location = redirect('/admin/login');
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) location.headers.set('set-cookie', setCookie);
  return location;
};
