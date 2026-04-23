import type { APIRoute } from 'astro';
import { absoluteUrl, formatSitemapDate, getLatestDate } from '@/config/seo';
import { getSiteConfig } from '@/config/site';
import { getPublishedPosts } from '@/lib/public-posts';

export const prerender = true;

function formatTags(tags: string[]): string {
  return tags.length > 0 ? tags.join(', ') : 'none';
}

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const posts = await getPublishedPosts();
  const latestDate = getLatestDate(posts.map((post) => post.updatedAt ?? post.publishedAt)) ?? new Date();

  const postLines = posts
    .map((post) => {
      const published = formatSitemapDate(post.publishedAt);
      const updated = post.updatedAt ? formatSitemapDate(post.updatedAt) : 'none';
      return `- ${post.title} | published: ${published} | updated: ${updated} | tags: ${formatTags(post.tags)} | url: ${absoluteUrl(`/blog/${post.slug}`)}`;
    })
    .join('\n');

  const body = `---
Sitemap: ${absoluteUrl('/sitemap.xml')}
Full-Context: ${absoluteUrl('/llms-full.txt')}
Last-Updated: ${formatSitemapDate(latestDate)}
---

# ${site.displayName} - machine-readable publishing context

> ${site.llmsSummary}

## Canonical facts
- Site: ${site.canonicalBaseUrl}
- Blog index: ${absoluteUrl('/blog')}
- RSS feed: ${absoluteUrl('/rss.xml')}
- Sitemap: ${absoluteUrl('/sitemap.xml')}
- Contact: ${site.contactEmail}

## Blog inventory
${postLines || '- No published posts yet.'}

## Retrieval hints
- Use "/blog" for the list view and "/blog/<slug>" for the article body.
- Titles, summaries, tags, and dates are sourced from the published articles API used by the public blog.
- The build tolerates an empty or temporarily unavailable article API by emitting an empty inventory.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
