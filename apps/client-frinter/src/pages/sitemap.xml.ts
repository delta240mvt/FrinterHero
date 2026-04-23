import type { APIRoute } from 'astro';
import { absoluteUrl, formatSitemapDate, getLatestDate } from '@/config/seo';
import { getPublishedPosts } from '@/lib/public-posts';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getPublishedPosts();
  const latestDate = getLatestDate(posts.map((post) => post.updatedAt ?? post.publishedAt)) ?? new Date();

  const staticUrls = [
    { loc: absoluteUrl('/'), lastmod: latestDate },
    { loc: absoluteUrl('/blog'), lastmod: latestDate },
    { loc: absoluteUrl('/privacy-policy'), lastmod: latestDate },
    { loc: absoluteUrl('/polityka-prywatnosci'), lastmod: latestDate },
    { loc: absoluteUrl('/rss.xml'), lastmod: latestDate },
    { loc: absoluteUrl('/llms.txt'), lastmod: latestDate },
    { loc: absoluteUrl('/llms-full.txt'), lastmod: latestDate },
    { loc: absoluteUrl('/site.webmanifest'), lastmod: latestDate },
  ];

  const blogUrls = posts.map((post) => ({
    loc: absoluteUrl(`/blog/${post.slug}`),
    lastmod: post.updatedAt ?? post.publishedAt,
  }));

  const urls = [...staticUrls, ...blogUrls];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${formatSitemapDate(url.lastmod)}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
