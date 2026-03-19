import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, normalizeSiteSlug, toPositiveInt, firstQueryValue,
  resolveAuthedSite, redditStatuses, hydrateRedditGaps, redditSourcePosts, enqueueAppJob,
  redditTargetScope, redditRunScope, redditGapScope,
  db, and, desc, eq, inArray, sql,
  redditTargets, redditScrapeRuns, redditExtractedGaps, contentGaps,
} from '../helpers.js';
import { findOffBrandMatch } from '../../../../src/utils/brandFilter';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/reddit/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const targets = await db.select().from(redditTargets).where(redditTargetScope(site.id)).orderBy(desc(redditTargets.priority), desc(redditTargets.createdAt));
    json(res, 200, { targets });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/reddit/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const body = await readJsonBody(req);
    const type = typeof body.type === 'string' ? body.type : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!['subreddit', 'keyword_search'].includes(type)) { json(res, 400, { error: 'type must be subreddit or keyword_search' }); return true; }
    if (!value || !label) { json(res, 400, { error: 'value and label required' }); return true; }
    const [target] = await db.insert(redditTargets).values({
      siteId: site.id,
      type,
      value,
      label,
      priority: toPositiveInt(String(body.priority ?? '50'), 50, { min: 0, max: 100 }),
      isActive: body.isActive !== false,
    }).returning();
    json(res, 201, { target });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'targets' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) { json(res, 400, { error: 'Invalid id' }); return true; }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, unknown> = {};
      if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
      if (typeof body.priority === 'number') updates.priority = Math.max(0, Math.min(100, body.priority));
      if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
      if (typeof body.value === 'string' && body.value.trim()) updates.value = body.value.trim();
      const [target] = await db.update(redditTargets).set(updates).where(and(eq(redditTargets.id, id), redditTargetScope(site.id))).returning();
      if (!target) { json(res, 404, { error: 'Not found' }); return true; }
      json(res, 200, { target });
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(redditTargets).where(and(eq(redditTargets.id, id), redditTargetScope(site.id)));
      res.writeHead(204);
      res.end();
      return true;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/reddit/runs') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 10, { min: 1, max: 50 });
    const offset = (page - 1) * limit;
    const [runs, totals] = await Promise.all([
      db.select().from(redditScrapeRuns).where(redditRunScope(site.id)).orderBy(desc(redditScrapeRuns.runAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(redditScrapeRuns).where(redditRunScope(site.id)),
    ]);
    json(res, 200, { runs, total: totals[0]?.total ?? 0, page, limit });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'runs' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) { json(res, 400, { error: 'Invalid id' }); return true; }

    if (method === 'GET') {
      const [run] = await db.select().from(redditScrapeRuns).where(and(eq(redditScrapeRuns.id, id), redditRunScope(site.id))).limit(1);
      if (!run) { json(res, 404, { error: 'Run not found' }); return true; }
      const gaps = await db.select()
        .from(redditExtractedGaps)
        .where(and(eq(redditExtractedGaps.scrapeRunId, id), redditGapScope(site.id)))
        .orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt));
      json(res, 200, { run, gaps: await hydrateRedditGaps(gaps) });
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(redditScrapeRuns).where(and(eq(redditScrapeRuns.id, id), redditRunScope(site.id)));
      json(res, 200, { success: true });
      return true;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/reddit/gaps') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const statuses = redditStatuses(url.searchParams.get('status'));
    const category = url.searchParams.get('category')?.trim() ?? '';
    const runId = Number(url.searchParams.get('runId') ?? 0);
    const conditions: any[] = [redditGapScope(site.id), inArray(redditExtractedGaps.status, statuses.length > 0 ? statuses : ['pending'])];
    if (category) conditions.push(eq(redditExtractedGaps.category, category));
    if (runId) conditions.push(eq(redditExtractedGaps.scrapeRunId, runId));
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const [gaps, totalRows, statsRows] = await Promise.all([
      db.select().from(redditExtractedGaps).where(whereClause).orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(redditExtractedGaps).where(whereClause),
      db.select({
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(redditExtractedGaps).where(redditGapScope(site.id)),
    ]);
    const items = await hydrateRedditGaps(gaps);
    json(res, 200, {
      gaps: items,
      items,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
      stats: statsRows[0] ?? { pending: 0, approved: 0, rejected: 0 },
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/reddit/gaps/auto-filter') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const pendingGaps = await db.select().from(redditExtractedGaps).where(and(redditGapScope(site.id), eq(redditExtractedGaps.status, 'pending')));
    const rejectedIds: number[] = [];
    const matches: Array<{ id: number; keyword: string }> = [];
    for (const gap of pendingGaps) {
      const match = findOffBrandMatch(gap.painPointTitle, gap.painPointDescription, gap.vocabularyQuotes || [], gap.emotionalIntensity);
      if (!match) continue;
      rejectedIds.push(gap.id);
      matches.push({ id: gap.id, keyword: match });
    }
    if (rejectedIds.length > 0) {
      await db.update(redditExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(inArray(redditExtractedGaps.id, rejectedIds));
    }
    json(res, 200, { success: true, processed: pendingGaps.length, rejectedCount: rejectedIds.length, matches });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'gaps' && segments[4] && segments[5] === 'approve') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) { json(res, 400, { error: 'Invalid id' }); return true; }
    const [gap] = await db.select().from(redditExtractedGaps).where(and(eq(redditExtractedGaps.id, id), redditGapScope(site.id))).limit(1);
    if (!gap) { json(res, 404, { error: 'Gap not found' }); return true; }
    if (gap.status !== 'pending') { json(res, 400, { error: 'Gap already processed' }); return true; }
    const body = await readJsonBody(req);
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : '';
    const sourcePosts = await redditSourcePosts((gap.sourcePostIds || []).slice(0, 3));
    const gapDescription = [
      `Problem Context\n${gap.painPointDescription}`,
      sourcePosts.length > 0 ? `\n\nReddit Context\n- Sources: ${gap.frequency} posts analyzed\n${sourcePosts.map((post) => `- "${post.title}" [r/${post.subreddit}]`).join('\n')}` : '',
      gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
    ].filter(Boolean).join('');
    const [contentGap] = await db.insert(contentGaps).values({
      siteId: site.id,
      gapTitle: gap.painPointTitle,
      gapDescription,
      confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
      suggestedAngle: gap.suggestedArticleAngle,
      relatedQueries: gap.vocabularyQuotes,
      sourceModels: ['reddit-apify', 'claude-sonnet'],
      authorNotes: authorNotes || null,
      status: 'new',
    }).returning();
    await db.update(redditExtractedGaps).set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id }).where(eq(redditExtractedGaps.id, id));
    json(res, 200, { ok: true, contentGapId: contentGap.id });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'gaps' && segments[4] && segments[5] === 'reject') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) { json(res, 400, { error: 'Invalid id' }); return true; }
    await db.update(redditExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(redditExtractedGaps.id, id), redditGapScope(site.id)));
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}
