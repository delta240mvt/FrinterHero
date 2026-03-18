import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles, sites } from '@/db/schema';
import { eq, desc, and, or, isNull } from 'drizzle-orm';
import { absoluteUrl, getCurrentSiteSlug, getSitePresentation } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const site = getSitePresentation();
  const siteSlug = getCurrentSiteSlug();
  let posts: any[] = [];

  try {
    const [siteRow] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, siteSlug)).limit(1);
    const siteCondition = siteRow
      ? (siteSlug === 'przemyslawfilipiak'
          ? or(eq(articles.siteId, siteRow.id), isNull(articles.siteId))
          : eq(articles.siteId, siteRow.id))
      : isNull(articles.siteId);

    posts = await db
      .select()
      .from(articles)
      .where(and(eq(articles.status, 'published'), siteCondition))
      .orderBy(desc(articles.publishedAt))
      .limit(50);
  } catch {
    // DB unavailable
  }

  const items = posts.map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${absoluteUrl(`/blog/${post.slug}`)}</link>
      <guid>${absoluteUrl(`/blog/${post.slug}`)}</guid>
      <description><![CDATA[${post.description || ''}]]></description>
      <author>${site.contactEmail} (${site.authorName})</author>
      <pubDate>${new Date(post.publishedAt || post.createdAt).toUTCString()}</pubDate>
      ${post.content ? `<content:encoded><![CDATA[${post.content}]]></content:encoded>` : ''}
      ${(post.tags || []).map((tag: string) => `<category>${tag}</category>`).join('')}
    </item>
  `).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${site.blogTitle}</title>
    <link>${site.canonicalBaseUrl}</link>
    <description>${site.blogDescription}</description>
    <language>en</language>
    <copyright>© ${new Date().getFullYear()} ${site.displayName}</copyright>
    <atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
