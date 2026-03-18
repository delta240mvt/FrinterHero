import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles, sites } from '@/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { absoluteUrl, getCurrentSiteSlug } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const siteSlug = getCurrentSiteSlug();
  let publishedArticles: { slug: string; updatedAt: Date }[] = [];

  try {
    const [siteRow] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, siteSlug)).limit(1);
    const siteCondition = siteRow
      ? (siteSlug === 'przemyslawfilipiak'
          ? or(eq(articles.siteId, siteRow.id), isNull(articles.siteId))
          : eq(articles.siteId, siteRow.id))
      : isNull(articles.siteId);

    publishedArticles = await db
      .select({ slug: articles.slug, updatedAt: articles.updatedAt })
      .from(articles)
      .where(and(eq(articles.status, 'published'), siteCondition));
  } catch {
    // DB unavailable
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
    lastmod: a.updatedAt?.toISOString().split('T')[0] || today,
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
