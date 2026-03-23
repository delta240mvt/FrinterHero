import type { APIRoute } from 'astro';
import { createAdminActiveSiteCookie, normalizeScopedSiteSlug } from '@/lib/internal-api';

export const GET: APIRoute = ({ request, redirect }) => {
  const url = new URL(request.url);
  const siteSlug = normalizeScopedSiteSlug(url.searchParams.get('siteSlug'), 'frinter');
  const returnTo = url.searchParams.get('returnTo') || '/admin';
  const response = redirect(returnTo);
  response.headers.append('Set-Cookie', createAdminActiveSiteCookie(siteSlug));
  return response;
};
