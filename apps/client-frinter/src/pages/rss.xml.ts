import type { APIRoute } from 'astro';
import { absoluteUrl, formatRssDate, getLatestDate } from '@/config/seo';
import { getSiteConfig } from '@/config/site';
import type { PublicPost } from '@/lib/public-posts';
import { getPublishedPosts } from '@/lib/public-posts';

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getItemDescription(post: PublicPost): string {
  return post.seoDescription ?? post.description ?? post.excerpt ?? '';
}

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const posts = await getPublishedPosts();
  const latestDate = getLatestDate(posts.map((post) => post.updatedAt ?? post.publishedAt)) ?? new Date();

  const items = posts
    .map((post) => {
      const itemUrl = absoluteUrl(`/blog/${post.slug}`);
      const title = post.title;
      const description = getItemDescription(post);
      const pubDate = post.updatedAt ?? post.publishedAt;
      const categories = post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('\n      ');

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
      <description>${escapeXml(description)}</description>
      <pubDate>${formatRssDate(pubDate)}</pubDate>
      ${categories ? `${categories}\n      ` : ''}
    </item>`;
    })
    .join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.blogTitle)}</title>
    <link>${escapeXml(absoluteUrl('/blog'))}</link>
    <description>${escapeXml(site.blogDescription)}</description>
    <language>en-US</language>
    <copyright>© ${latestDate.getFullYear()} ${escapeXml(site.displayName)}</copyright>
    <atom:link href="${escapeXml(absoluteUrl('/rss.xml'))}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${formatRssDate(latestDate)}</lastBuildDate>
${items ? `${items}\n` : ''}  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
