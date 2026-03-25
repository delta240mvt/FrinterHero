import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, normalizeSiteSlug, toPositiveInt, toNonNegativeInt, firstQueryValue, parseTags,
  getSiteBySlug, requireActiveSite, enqueueDraftJob, articleScope, kbScope,
  db, and, desc, eq, ilike, inArray, sql, articles, articleGenerations, contentGaps, knowledgeEntries,
} from '../helpers.js';
import { generateSlug } from '../../../../src/utils/slug';
import { calculateReadingTime, parseMarkdown } from '../../../../src/utils/markdown';

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

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  // --- Public routes ---

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'articles' && segments.length === 2) {
    const site = await getSiteBySlug(normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!site) return json(res, 404, { error: 'Site not found' }), true;
    const status = url.searchParams.get('status') ?? 'published';
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 5000 });
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 1000);
    const whereClause = and(eq(articles.siteId, site.id), eq(articles.status, status));
    const [rows, totals] = await Promise.all([
      db.select()
        .from(articles)
        .where(whereClause)
        .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(articles).where(whereClause),
    ]);
    json(res, 200, { results: rows, pagination: { limit, offset, total: totals[0]?.total ?? 0 } });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'articles' && segments.length === 3) {
    const site = await getSiteBySlug(normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!site) return json(res, 404, { error: 'Site not found' }), true;
    const [article] = await db.select().from(articles).where(and(eq(articles.siteId, site.id), eq(articles.slug, decodeURIComponent(segments[2])))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' }), true;

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

    json(res, 200, {
      ...article,
      relatedArticles,
    });
    return true;
  }

  // --- Admin routes ---

  if (method === 'GET' && pathname === '/v1/admin/articles') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const search = url.searchParams.get('search')?.trim() ?? '';
    const status = url.searchParams.get('status')?.trim() ?? '';
    const conditions: any[] = [articleScope(site.id)];
    if (search) conditions.push(ilike(articles.title, `%${search}%`));
    if (status) conditions.push(eq(articles.status, status));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const offset = (page - 1) * limit;
    const [rows, totals] = await Promise.all([
      db.select().from(articles).where(whereClause).orderBy(desc(articles.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(articles).where(whereClause),
    ]);
    json(res, 200, { results: rows, total: totals[0]?.total ?? 0, page, limit });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' }), true;
    const [article] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' }), true;
    json(res, 200, article);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/articles') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json(res, 400, { error: 'title is required' }), true;
    const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : generateSlug(title);
    const [existing] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, slug), eq(articles.siteId, site.id))).limit(1);
    if (existing) return json(res, 409, { error: 'Article slug already exists' }), true;
    const htmlContent = parseMarkdown(typeof body.content === 'string' ? body.content : '');
    const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'draft';
    const [created] = await db.insert(articles).values({
      siteId: site.id,
      slug,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      content: htmlContent,
      tags: parseTags(body.tags),
      featured: Boolean(body.featured),
      status,
      readingTime: calculateReadingTime(htmlContent),
      author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : site.displayName,
      publishedAt: status === 'published' ? new Date() : null,
    }).returning();
    json(res, 201, { id: created.id, slug: created.slug, status: created.status, publishedAt: created.publishedAt, updatedAt: created.updatedAt });
    return true;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' }), true;
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existing] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Article not found' }), true;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim() || generateSlug(String(body.title ?? existing.title));
      const [collision] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, slug), eq(articles.siteId, site.id), sql`${articles.id} <> ${articleId}`)).limit(1);
      if (collision) return json(res, 409, { error: 'Article slug already exists' }), true;
      updates.slug = slug;
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
    const [updated] = await db.update(articles).set(updates).where(and(eq(articles.id, articleId), articleScope(site.id))).returning();
    json(res, 200, updated);
    return true;
  }

  if (method === 'DELETE' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' }), true;
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existing] = await db.select({ id: articles.id }).from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Article not found' }), true;
    await db.delete(articles).where(and(eq(articles.id, articleId), articleScope(site.id)));
    json(res, 200, { success: true, deletedId: articleId });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/articles/bulk-delete') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => Number(id)).filter(Boolean) : [];
    if (ids.length === 0) return json(res, 400, { error: 'ids are required' }), true;
    const existing = await db.select({ id: articles.id }).from(articles).where(and(articleScope(site.id), inArray(articles.id, ids)));
    if (existing.length === 0) return json(res, 404, { error: 'No matching articles found' }), true;
    await db.delete(articles).where(and(articleScope(site.id), inArray(articles.id, existing.map((row) => row.id))));
    json(res, 200, { success: true, deletedIds: existing.map((row) => row.id), deletedCount: existing.length });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && segments[4] === 'publish') {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' }), true;
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [article] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' }), true;
    if (article.status === 'published') return json(res, 409, { error: 'Article already published' }), true;
    const publishedAt = body.publishedAt ? new Date(String(body.publishedAt)) : new Date();
    const [updated] = await db.update(articles).set({ status: 'published', publishedAt, updatedAt: new Date() }).where(and(eq(articles.id, articleId), articleScope(site.id))).returning();
    if (article.sourceGapId) await db.update(contentGaps).set({ status: 'acknowledged', acknowledgedAt: new Date() }).where(and(eq(contentGaps.id, article.sourceGapId), eq(contentGaps.siteId, site.id)));
    const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent }).from(articleGenerations).where(eq(articleGenerations.articleId, articleId)).limit(1);
    if (generation) {
      await db.update(articleGenerations).set({ publicationTimestamp: new Date(), finalContent: updated.content, contentChanged: generation.originalContent !== updated.content }).where(eq(articleGenerations.id, generation.id));
    }
    json(res, 200, { id: updated.id, slug: updated.slug, status: updated.status, publishedAt: updated.publishedAt, url: `/blog/${updated.slug}` });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/admin/article-generations') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const articleId = toPositiveInt(firstQueryValue(url, 'articleId', 'article_id'), 0);
    const gapId = toPositiveInt(firstQueryValue(url, 'gapId', 'gap_id'), 0);
    const conditions: any[] = [articleScope(site.id)];
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
    json(res, 200, { generations });
    return true;
  }

  return false;
}
