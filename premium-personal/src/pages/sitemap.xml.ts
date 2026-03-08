import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  let publishedArticles: { slug: string; updatedAt: Date }[] = [];

  try {
    publishedArticles = await db
      .select({ slug: articles.slug, updatedAt: articles.updatedAt })
      .from(articles)
      .where(eq(articles.status, 'published'));
  } catch {
    // DB unavailable
  }

  const staticUrls = [
    { loc: 'https://przemyslawfilipiak.com', lastmod: new Date().toISOString(), changefreq: 'weekly', priority: '1.0' },
    { loc: 'https://przemyslawfilipiak.com/blog', lastmod: new Date().toISOString(), changefreq: 'daily', priority: '0.8' },
  ];

  const articleUrls = publishedArticles.map(a => ({
    loc: `https://przemyslawfilipiak.com/blog/${a.slug}`,
    lastmod: a.updatedAt?.toISOString() || new Date().toISOString(),
    changefreq: 'monthly',
    priority: '0.6',
  }));

  const allUrls = [...staticUrls, ...articleUrls];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
