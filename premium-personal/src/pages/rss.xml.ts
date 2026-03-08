import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  let posts: any[] = [];

  try {
    posts = await db
      .select()
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(50);
  } catch {
    // DB unavailable
  }

  const items = posts.map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>https://przemyslawfilipiak.com/blog/${post.slug}</link>
      <guid>https://przemyslawfilipiak.com/blog/${post.slug}</guid>
      <description><![CDATA[${post.description || ''}]]></description>
      <author>contact@przemyslawfilipiak.com (Przemysław Filipiak)</author>
      <pubDate>${new Date(post.publishedAt || post.createdAt).toUTCString()}</pubDate>
      ${post.content ? `<content:encoded><![CDATA[${post.content}]]></content:encoded>` : ''}
      ${(post.tags || []).map((tag: string) => `<category>${tag}</category>`).join('')}
    </item>
  `).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog — Przemysław Filipiak</title>
    <link>https://przemyslawfilipiak.com</link>
    <description>Essays on AI development, deep work, and building in public</description>
    <language>en</language>
    <copyright>© ${new Date().getFullYear()} Przemysław Filipiak</copyright>
    <atom:link href="https://przemyslawfilipiak.com/rss.xml" rel="self" type="application/rss+xml"/>
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
