import type { APIRoute } from 'astro';
import { getSeoConfig } from '@/config/seo';
import { getSiteConfig } from '@/config/site';

export const prerender = true;

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const seo = getSeoConfig();

  return Response.json({
    name: site.displayName,
    short_name: site.shortName,
    start_url: '/',
    display: 'standalone',
    background_color: seo.backgroundColor,
    theme_color: seo.themeColor,
    icons: [
      { src: '/favicon-48x48.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
      { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
      { src: '/favicon-16x16.png', sizes: '16x16', type: 'image/png', purpose: 'any' },
      { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  });
};
