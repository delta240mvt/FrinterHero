import type { APIRoute } from 'astro';
import { getInternalApiBaseUrl } from '@/lib/internal-api';
import { absoluteUrl, getCurrentSiteSlug } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const siteSlug = getCurrentSiteSlug();
  let publishedArticles: { slug: string; updatedAt: string }[] = [];

  try {
    const apiBase = getInternalApiBaseUrl();
    const params = new URLSearchParams({ siteSlug, status: 'published', limit: '100' });
    const response = await fetch(`${apiBase}/v1/articles?${params}`);
    if (response.ok) {
      const data = await response.json();
      publishedArticles = (data.results ?? []).map((a: any) => ({
        slug: a.slug,
        updatedAt: a.updatedAt,
      }));
    }
  } catch {
    // API unavailable
  }

  const today = new Date().toISOString().split('T')[0];

  const staticUrls = [
    { loc: absoluteUrl('/'), lastmod: today },
    { loc: absoluteUrl('/blog'), lastmod: today },
    { loc: absoluteUrl('/rss.xml'), lastmod: today },
    { loc: absoluteUrl('/llms.txt'), lastmod: today },
    { loc: absoluteUrl('/llms-full.txt'), lastmod: today },
  ];

  const articleUrls = publishedArticles.map(a => ({
    loc: absoluteUrl(`/blog/${a.slug}`),
    lastmod: a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : today,
  }));

  const allUrls = [...staticUrls, ...articleUrls];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
