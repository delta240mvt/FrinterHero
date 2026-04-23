import { getInternalApiBaseUrl } from './internal-api';
import { getCurrentSiteSlug } from './site-config';

export interface PublicPost {
  slug: string;
  title: string;
  description: string;
  excerpt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  tags: string[];
  featured: boolean;
  readingTimeMinutes: number | null;
  publishedAt: Date;
  updatedAt?: Date | null;
}

function toValidDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toReadingTimeMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function getPublishedPosts(limit = 500): Promise<PublicPost[]> {
  const siteSlug = getCurrentSiteSlug();
  const apiBase = getInternalApiBaseUrl();

  try {
    const params = new URLSearchParams({
      siteSlug,
      status: 'published',
      limit: String(limit),
    });
    const response = await fetch(`${apiBase}/v1/articles?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    const posts = Array.isArray(data?.results) ? data.results : [];

    return posts
      .map((post: any) => {
        const publishedAt = toValidDate(post.publishedAt);
        if (!publishedAt || !post?.slug || !post?.title) return null;

        return {
          slug: String(post.slug),
          title: String(post.title),
          description: String(post.description ?? ''),
          excerpt: post.excerpt ? String(post.excerpt) : null,
          seoTitle: post.seoTitle ? String(post.seoTitle) : null,
          seoDescription: post.seoDescription ? String(post.seoDescription) : null,
          tags: Array.isArray(post.tags) ? post.tags.map((tag: unknown) => String(tag)) : [],
          featured: Boolean(post.featured),
          readingTimeMinutes: toReadingTimeMinutes(post.readingTimeMinutes ?? post.readingTime),
          publishedAt,
          updatedAt: toValidDate(post.updatedAt),
        } satisfies PublicPost;
      })
      .filter((post): post is PublicPost => Boolean(post))
      .sort((left, right) => {
        const leftDate = left.updatedAt ?? left.publishedAt;
        const rightDate = right.updatedAt ?? right.publishedAt;
        return rightDate.getTime() - leftDate.getTime();
      });
  } catch {
    return [];
  }
}
