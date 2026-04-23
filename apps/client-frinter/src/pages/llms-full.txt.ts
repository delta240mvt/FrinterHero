import type { APIRoute } from 'astro';
import { absoluteUrl, formatSitemapDate, getLatestDate } from '@/config/seo';
import { getSiteConfig } from '@/config/site';
import { getPublishedPosts } from '@/lib/public-posts';

export const prerender = true;

function formatTags(tags: string[]): string {
  return tags.length > 0 ? tags.join(', ') : 'none';
}

function formatOptionalDate(date: Date | undefined): string {
  return date ? formatSitemapDate(date) : 'none';
}

export const GET: APIRoute = async () => {
  const site = getSiteConfig();
  const posts = await getPublishedPosts();
  const latestDate = getLatestDate(posts.map((post) => post.updatedAt ?? post.publishedAt)) ?? new Date();

  const postSections = posts
    .map((post) => {
      const url = absoluteUrl(`/blog/${post.slug}`);
      const published = formatSitemapDate(post.publishedAt);
      const updated = formatOptionalDate(post.updatedAt ?? undefined);
      const tags = formatTags(post.tags);

      return `### ${post.title}
- URL: ${url}
- Slug: ${post.slug}
- Published: ${published}
- Updated: ${updated}
- Reading time: ${post.readingTimeMinutes ?? 'unknown'} min
- Featured: ${post.featured ? 'yes' : 'no'}
- Tags: ${tags}
- Description: ${post.description}
- Excerpt: ${post.excerpt ?? 'none'}
- SEO title: ${post.seoTitle ?? 'none'}
- SEO description: ${post.seoDescription ?? 'none'}`;
    })
    .join('\n\n');

  const body = `# Full Context: ${site.displayName}

## Publishing model
This site reads published articles from the same article API used by the public blog. Discovery surfaces should stay deterministic and degrade safely when the API has no published posts.

## Canonical facts
- Site: ${site.canonicalBaseUrl}
- Blog index: ${absoluteUrl('/blog')}
- RSS feed: ${absoluteUrl('/rss.xml')}
- Sitemap: ${absoluteUrl('/sitemap.xml')}
- Last updated: ${formatSitemapDate(latestDate)}
- Contact: ${site.contactEmail}
- GitHub: ${site.socialLinks[0]}
- LinkedIn: ${site.socialLinks[1]}

## Identity
${site.llmsSummary}

## Content schema
- title
- description
- excerpt
- publishDate
- updatedDate
- readingTimeMinutes
- featured
- draft
- tags
- seoTitle
- seoDescription
- faq

## Blog inventory
${postSections || 'No published posts yet.'}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
