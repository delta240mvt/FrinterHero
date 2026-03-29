import { Hono } from 'hono';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  articles,
  articleGenerations,
  contentGaps,
  knowledgeEntries,
  sites,
} from '../../../../../src/db/schema.ts';
import type { HonoEnv } from '../app.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import { generateSlug } from '../../../../../src/utils/slug.ts';
import { calculateReadingTime, parseMarkdown } from '../../../../../src/utils/markdown.ts';

export const articlesRouter = new Hono<HonoEnv>();

// --- Helpers ---

function extractBlogSlugFromSourceUrl(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const match = url.pathname.match(/^\/blog\/([^/]+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function articleScope(siteId: number) {
  return or(eq(articles.siteId, siteId), isNull(articles.siteId));
}

function kbScope(siteId: number) {
  return or(eq(knowledgeEntries.siteId, siteId), isNull(knowledgeEntries.siteId));
}

function toPositiveInt(value: string | null | undefined, fallback: number, opts?: { max?: number }): number {
  const max = opts?.max ?? 10000;
  return Math.min(Math.max(parseInt(value ?? '') || fallback, 1), max);
}

function toNonNegativeInt(value: string | null | undefined, fallback: number, max = 10000): number {
  return Math.min(Math.max(parseInt(value ?? '') || fallback, 0), max);
}

function parseTags(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

// --- Public routes ---

articlesRouter.get('/v1/articles', async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const rawSlug = (c.req.query('siteSlug') ?? '').trim().toLowerCase();
  if (!rawSlug) return c.json({ error: 'siteSlug is required' }, 400);
  const [site] = await db.select().from(sites).where(eq(sites.slug, rawSlug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  const status = c.req.query('status') ?? 'published';
  const limit = toPositiveInt(c.req.query('limit'), 20, { max: 5000 });
  const offset = toNonNegativeInt(c.req.query('offset'), 0, 1000);
  const whereClause = and(articleScope(site.id)!, eq(articles.status, status));
  const [rows, totals] = await Promise.all([
    db.select()
      .from(articles)
      .where(whereClause)
      .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(articles).where(whereClause),
  ]);
  return c.json({ results: rows, pagination: { limit, offset, total: totals[0]?.total ?? 0 } });
});

articlesRouter.get('/v1/articles/:slug', async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const rawSlug = (c.req.query('siteSlug') ?? '').trim().toLowerCase();
  if (!rawSlug) return c.json({ error: 'siteSlug is required' }, 400);
  const [site] = await db.select().from(sites).where(eq(sites.slug, rawSlug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  const articleSlug = decodeURIComponent(c.req.param('slug'));
  const [article] = await db.select()
    .from(articles)
    .where(and(eq(articles.siteId, site.id), eq(articles.slug, articleSlug)))
    .limit(1);
  if (!article) return c.json({ error: 'Article not found' }, 404);

  let relatedArticles: Array<typeof articles.$inferSelect> = [];

  const [generation] = await db.select({
    kbEntriesUsed: articleGenerations.kbEntriesUsed,
  }).from(articleGenerations).where(eq(articleGenerations.articleId, article.id)).limit(1);

  const kbEntryIds = Array.isArray(generation?.kbEntriesUsed)
    ? generation.kbEntriesUsed.map((entry) => Number(entry)).filter(Boolean)
    : [];

  if (kbEntryIds.length > 0) {
    const kbRows = await db.select({
      title: knowledgeEntries.title,
      sourceUrl: knowledgeEntries.sourceUrl,
      type: knowledgeEntries.type,
    }).from(knowledgeEntries).where(and(kbScope(site.id), inArray(knowledgeEntries.id, kbEntryIds)));

    const relatedSlugs = Array.from(new Set(
      kbRows
        .filter((entry) => entry.type === 'published_article')
        .map((entry) => extractBlogSlugFromSourceUrl(entry.sourceUrl))
        .filter((slug): slug is string => Boolean(slug) && slug !== article.slug),
    ));

    if (relatedSlugs.length > 0) {
      relatedArticles = await db.select()
        .from(articles)
        .where(and(eq(articles.siteId, site.id), eq(articles.status, 'published'), inArray(articles.slug, relatedSlugs)))
        .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
        .limit(3);
    }
  }

  return c.json({ ...article, relatedArticles });
});

// --- Admin routes ---

articlesRouter.get('/v1/admin/articles', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const page = toPositiveInt(c.req.query('page'), 1, { max: 1000 });
  const limit = toPositiveInt(c.req.query('limit'), 20, { max: 100 });
  const search = c.req.query('search')?.trim() ?? '';
  const status = c.req.query('status')?.trim() ?? '';
  const conditions = [articleScope(siteId)];
  if (search) conditions.push(ilike(articles.title, `%${search}%`));
  if (status) conditions.push(eq(articles.status, status));
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
  const offset = (page - 1) * limit;
  const [rows, totals] = await Promise.all([
    db.select().from(articles).where(whereClause).orderBy(desc(articles.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(articles).where(whereClause),
  ]);
  return c.json({ results: rows, total: totals[0]?.total ?? 0, page, limit });
});

// bulk-delete must be registered BEFORE /:id to avoid param capture
articlesRouter.post('/v1/admin/articles/bulk-delete', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => Number(id)).filter(Boolean) : [];
  if (ids.length === 0) return c.json({ error: 'ids are required' }, 400);
  const existing = await db.select({ id: articles.id }).from(articles).where(and(articleScope(siteId), inArray(articles.id, ids)));
  if (existing.length === 0) return c.json({ error: 'No matching articles found' }, 404);
  await db.delete(articles).where(and(articleScope(siteId), inArray(articles.id, existing.map((row) => row.id))));
  return c.json({ success: true, deletedIds: existing.map((row) => row.id), deletedCount: existing.length });
});

articlesRouter.get('/v1/admin/articles/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const articleId = Number(c.req.param('id'));
  if (!articleId) return c.json({ error: 'Invalid article id' }, 400);
  const [article] = await db.select().from(articles).where(and(articleScope(siteId), eq(articles.id, articleId))).limit(1);
  if (!article) return c.json({ error: 'Article not found' }, 404);
  return c.json(article);
});

articlesRouter.post('/v1/admin/articles', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return c.json({ error: 'title is required' }, 400);
  const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : generateSlug(title);
  const [existing] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, slug), eq(articles.siteId, siteId))).limit(1);
  if (existing) return c.json({ error: 'Article slug already exists' }, 409);
  const htmlContent = parseMarkdown(typeof body.content === 'string' ? body.content : '');
  const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'draft';
  // get site for displayName fallback
  const [site] = await db.select({ displayName: sites.displayName }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const [created] = await db.insert(articles).values({
    siteId,
    slug,
    title,
    description: typeof body.description === 'string' ? body.description : null,
    content: htmlContent,
    tags: parseTags(body.tags),
    featured: Boolean(body.featured),
    status,
    readingTime: calculateReadingTime(htmlContent),
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : (site?.displayName ?? null),
    publishedAt: status === 'published' ? new Date() : null,
  }).returning();
  return c.json({ id: created.id, slug: created.slug, status: created.status, publishedAt: created.publishedAt, updatedAt: created.updatedAt }, 201);
});

articlesRouter.put('/v1/admin/articles/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const articleId = Number(c.req.param('id'));
  if (!articleId) return c.json({ error: 'Invalid article id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const [existing] = await db.select().from(articles).where(and(articleScope(siteId), eq(articles.id, articleId))).limit(1);
  if (!existing) return c.json({ error: 'Article not found' }, 404);
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.slug !== undefined) {
    const newSlug = String(body.slug).trim() || generateSlug(String(body.title ?? existing.title));
    const [collision] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, newSlug), eq(articles.siteId, siteId), sql`${articles.id} <> ${articleId}`)).limit(1);
    if (collision) return c.json({ error: 'Article slug already exists' }, 409);
    updates.slug = newSlug;
  }
  if (body.description !== undefined) updates.description = body.description ? String(body.description) : null;
  if (body.content !== undefined) {
    const htmlContent = parseMarkdown(String(body.content));
    updates.content = htmlContent;
    updates.readingTime = calculateReadingTime(htmlContent);
  }
  if (body.tags !== undefined) updates.tags = parseTags(body.tags);
  if (body.featured !== undefined) updates.featured = Boolean(body.featured);
  if (body.author !== undefined) updates.author = String(body.author).trim();
  if (body.status !== undefined) {
    const nextStatus = String(body.status).trim();
    updates.status = nextStatus;
    updates.publishedAt = nextStatus === 'published' ? (existing.publishedAt ?? new Date()) : null;
  }
  const [updated] = await db.update(articles).set(updates).where(and(eq(articles.id, articleId), articleScope(siteId))).returning();
  return c.json(updated);
});

articlesRouter.delete('/v1/admin/articles/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const articleId = Number(c.req.param('id'));
  if (!articleId) return c.json({ error: 'Invalid article id' }, 400);
  const [existing] = await db.select({ id: articles.id }).from(articles).where(and(articleScope(siteId), eq(articles.id, articleId))).limit(1);
  if (!existing) return c.json({ error: 'Article not found' }, 404);
  await db.delete(articles).where(and(eq(articles.id, articleId), articleScope(siteId)));
  return c.json({ success: true, deletedId: articleId });
});

articlesRouter.post('/v1/admin/articles/:id/publish', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const articleId = Number(c.req.param('id'));
  if (!articleId) return c.json({ error: 'Invalid article id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const [article] = await db.select().from(articles).where(and(articleScope(siteId), eq(articles.id, articleId))).limit(1);
  if (!article) return c.json({ error: 'Article not found' }, 404);
  if (article.status === 'published') return c.json({ error: 'Article already published' }, 409);
  const publishedAt = body.publishedAt ? new Date(String(body.publishedAt)) : new Date();
  const [updated] = await db.update(articles).set({ status: 'published', publishedAt, updatedAt: new Date() }).where(and(eq(articles.id, articleId), articleScope(siteId))).returning();
  if (article.sourceGapId) {
    await db.update(contentGaps).set({ status: 'acknowledged', acknowledgedAt: new Date() }).where(and(eq(contentGaps.id, article.sourceGapId), eq(contentGaps.siteId, siteId)));
  }
  const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent }).from(articleGenerations).where(eq(articleGenerations.articleId, articleId)).limit(1);
  if (generation) {
    await db.update(articleGenerations).set({ publicationTimestamp: new Date(), finalContent: updated.content, contentChanged: generation.originalContent !== updated.content }).where(eq(articleGenerations.id, generation.id));
  }
  return c.json({ id: updated.id, slug: updated.slug, status: updated.status, publishedAt: updated.publishedAt, url: `/blog/${updated.slug}` });
});

articlesRouter.get('/v1/admin/article-generations', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const articleIdParam = c.req.query('articleId') ?? c.req.query('article_id') ?? null;
  const gapIdParam = c.req.query('gapId') ?? c.req.query('gap_id') ?? null;
  const articleId = toPositiveInt(articleIdParam, 0);
  const gapId = toPositiveInt(gapIdParam, 0);
  const conditions = [articleScope(siteId)];
  if (articleId > 0) conditions.push(eq(articleGenerations.articleId, articleId));
  if (gapId > 0) conditions.push(eq(articleGenerations.gapId, gapId));
  const rows = await db.select({
    id: articleGenerations.id,
    articleId: articleGenerations.articleId,
    gapId: articleGenerations.gapId,
    generatedByModel: articleGenerations.generatedByModel,
    generationTimestamp: articleGenerations.generationTimestamp,
    publicationTimestamp: articleGenerations.publicationTimestamp,
    contentChanged: articleGenerations.contentChanged,
    kbEntriesUsed: articleGenerations.kbEntriesUsed,
    modelsQueried: articleGenerations.modelsQueried,
    authorNotes: articleGenerations.authorNotes,
  })
    .from(articleGenerations)
    .innerJoin(articles, eq(articles.id, articleGenerations.articleId))
    .where(and(...conditions));
  const generations = rows.map(({ id, articleId, gapId, generatedByModel, generationTimestamp, publicationTimestamp, contentChanged, kbEntriesUsed, modelsQueried, authorNotes }) => ({
    id, articleId, gapId, generatedByModel, generationTimestamp, publicationTimestamp, contentChanged, kbEntriesUsed, modelsQueried, authorNotes,
    original_content_length: 0,
    final_content_length: 0,
  }));
  return c.json({ generations });
});
