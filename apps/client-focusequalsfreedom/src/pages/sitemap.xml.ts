import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@/lib/blog';
import { absoluteUrl } from '@/lib/site';

export const GET: APIRoute = async () => {
  const publishedArticles = await getPublishedPosts();

  const today = new Date().toISOString().split('T')[0];

  const staticUrls = [
    { loc: absoluteUrl('/'), lastmod: today },
    { loc: absoluteUrl('/blog'), lastmod: today },
    { loc: absoluteUrl('/rss.xml'), lastmod: today },
    { loc: absoluteUrl('/llms.txt'), lastmod: today },
    { loc: absoluteUrl('/llms-full.txt'), lastmod: today },
  ];

  const articleUrls = publishedArticles.map((article) => ({
    loc: absoluteUrl(`/blog/${article.slug}`),
    lastmod: (article.updatedDate ?? article.pubDate).toISOString().split('T')[0],
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
