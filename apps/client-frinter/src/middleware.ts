import { defineMiddleware } from 'astro:middleware';

const STATIC_PREFIXES = ['/fonts/', '/faces/', '/_astro/'];
const ONE_YEAR = 31_536_000;

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  const path = context.url.pathname;
  if (STATIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    response.headers.set(
      'Cache-Control',
      `public, max-age=${ONE_YEAR}, immutable`,
    );
  }

  return response;
});
