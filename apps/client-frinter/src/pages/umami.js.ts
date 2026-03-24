export const prerender = false;

const UMAMI_URL = 'https://umami-blogi-astro.up.railway.app/script.js';

export async function GET() {
  const response = await fetch(UMAMI_URL);
  const text = await response.text();
  return new Response(text, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
