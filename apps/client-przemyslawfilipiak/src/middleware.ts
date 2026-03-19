import { defineMiddleware } from 'astro:middleware';
import { getInternalApiBaseUrl } from '@/lib/internal-api';

export const onRequest = defineMiddleware(async (context: any, next: any) => {
  const pathname = context.url.pathname;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = context.cookies.get('session')?.value;

    if (!token) {
      return context.redirect('/admin/login');
    }

    try {
      const apiBase = getInternalApiBaseUrl();
      const response = await fetch(`${apiBase}/v1/auth/me`, {
        headers: { cookie: `session=${encodeURIComponent(token)}` },
      });

      if (!response.ok) {
        context.cookies.delete('session', { path: '/' });
        return context.redirect('/admin/login');
      }

      const data = await response.json();
      if (!data.authenticated) {
        context.cookies.delete('session', { path: '/' });
        return context.redirect('/admin/login');
      }
    } catch {
      return context.redirect('/admin/login');
    }
  }

  return next();
});
