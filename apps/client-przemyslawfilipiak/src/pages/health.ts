export const GET = async () =>
  new Response(JSON.stringify({ ok: true, siteSlug: process.env.SITE_SLUG ?? 'przemyslawfilipiak' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
