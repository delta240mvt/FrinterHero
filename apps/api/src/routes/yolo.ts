import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody,
  requireActiveSite, enqueueDraftJob, ytGapScope, gapScope, articleScope,
  ytSourceComments,
  db, and, desc, eq, gte, inArray, isNotNull, or, isNull, sql,
  ytExtractedGaps, contentGaps, appJobs, articles, articleGenerations, yoloSettings, redditExtractedGaps,
} from '../helpers.js';

type YoloSettingsRow = typeof yoloSettings.$inferSelect;

const DEFAULT_SETTINGS: Omit<YoloSettingsRow, 'id' | 'siteId' | 'createdAt' | 'updatedAt'> = {
  ytPainPointsEnabled: false,
  ytPainPointsLimit: 10,
  ytPainPointsMinIntensity: 5,
  gapsEnabled: false,
  gapsLimit: 5,
  gapsModel: 'anthropic/claude-sonnet-4-6',
  autoPublishEnabled: false,
  autoPublishLimit: 10,
};

async function getOrCreateSettings(siteId: number): Promise<YoloSettingsRow> {
  const [existing] = await db.select().from(yoloSettings).where(eq(yoloSettings.siteId, siteId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(yoloSettings).values({ siteId, ...DEFAULT_SETTINGS }).returning();
  return created;
}

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, pathname } = ctx;

  if (!pathname.startsWith('/v1/admin/yolo')) return false;

  const context = await requireActiveSite(req, res);
  if (!context) return true;
  const { site } = context;

  // GET /v1/admin/yolo/settings
  if (method === 'GET' && pathname === '/v1/admin/yolo/settings') {
    const settings = await getOrCreateSettings(site.id);
    json(res, 200, { settings });
    return true;
  }

  // PUT /v1/admin/yolo/settings
  if (method === 'PUT' && pathname === '/v1/admin/yolo/settings') {
    const body = await readJsonBody(req);
    const updates: Partial<typeof yoloSettings.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.ytPainPointsEnabled === 'boolean') updates.ytPainPointsEnabled = body.ytPainPointsEnabled;
    if (typeof body.ytPainPointsLimit === 'number') updates.ytPainPointsLimit = Math.max(1, Math.min(100, body.ytPainPointsLimit));
    if (typeof body.ytPainPointsMinIntensity === 'number') updates.ytPainPointsMinIntensity = Math.max(1, Math.min(10, body.ytPainPointsMinIntensity));
    if (typeof body.gapsEnabled === 'boolean') updates.gapsEnabled = body.gapsEnabled;
    if (typeof body.gapsLimit === 'number') updates.gapsLimit = Math.max(1, Math.min(50, body.gapsLimit));
    if (typeof body.gapsModel === 'string' && body.gapsModel.trim()) updates.gapsModel = body.gapsModel.trim();
    if (typeof body.autoPublishEnabled === 'boolean') updates.autoPublishEnabled = body.autoPublishEnabled;
    if (typeof body.autoPublishLimit === 'number') updates.autoPublishLimit = Math.max(1, Math.min(50, body.autoPublishLimit));

    const existing = await getOrCreateSettings(site.id);
    const [updated] = await db.update(yoloSettings).set(updates).where(eq(yoloSettings.id, existing.id)).returning();
    json(res, 200, { settings: updated });
    return true;
  }

  // GET /v1/admin/yolo/preview — pipeline counts
  if (method === 'GET' && pathname === '/v1/admin/yolo/preview') {
    const settings = await getOrCreateSettings(site.id);
    const [ytPending, gapsNew, draftsReady, gapsInProgress] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` })
        .from(ytExtractedGaps)
        .where(and(ytGapScope(site.id), eq(ytExtractedGaps.status, 'pending'), gte(ytExtractedGaps.emotionalIntensity, settings.ytPainPointsMinIntensity))),
      db.select({ total: sql<number>`count(*)::int` })
        .from(contentGaps)
        .where(and(gapScope(site.id), eq(contentGaps.status, 'new'))),
      db.select({ total: sql<number>`count(*)::int` })
        .from(articles)
        .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId))),
      db.select({ total: sql<number>`count(*)::int` })
        .from(contentGaps)
        .where(and(gapScope(site.id), eq(contentGaps.status, 'in_progress'))),
    ]);
    json(res, 200, {
      ytPainPointsPending: ytPending[0]?.total ?? 0,
      gapsNew: gapsNew[0]?.total ?? 0,
      draftsReady: draftsReady[0]?.total ?? 0,
      gapsInProgress: gapsInProgress[0]?.total ?? 0,
      settings,
    });
    return true;
  }

  // POST /v1/admin/yolo/run/pain-points — bulk approve top-N YT pain points → content gaps (automation)
  if (method === 'POST' && pathname === '/v1/admin/yolo/run/pain-points') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(100, body.limit)) : settings.ytPainPointsLimit;
    const minIntensity = typeof body.minIntensity === 'number' ? body.minIntensity : settings.ytPainPointsMinIntensity;

    const pending = await db.select()
      .from(ytExtractedGaps)
      .where(and(ytGapScope(site.id), eq(ytExtractedGaps.status, 'pending'), gte(ytExtractedGaps.emotionalIntensity, minIntensity)))
      .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
      .limit(limit);

    let created = 0;
    const createdGapIds: number[] = [];

    for (const gap of pending) {
      const sourceComments = await ytSourceComments((gap.sourceCommentIds || []).slice(0, 5));
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        gap.sourceVideoTitle ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed` : '',
        sourceComments.length > 0 ? `\n\nRepresentative Voices\n${sourceComments.map((c) => `- "${String(c.commentText ?? '').slice(0, 150)}" (${c.voteCount} votes)`).join('\n')}` : '',
        gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
      ].filter(Boolean).join('');

      const [contentGap] = await db.insert(contentGaps).values({
        siteId: site.id,
        gapTitle: gap.painPointTitle,
        gapDescription,
        confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
        suggestedAngle: gap.suggestedArticleAngle,
        relatedQueries: gap.vocabularyQuotes,
        sourceModels: ['youtube-apify', 'claude-sonnet'],
        status: 'new',
      }).returning();

      await db.update(ytExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(ytExtractedGaps.id, gap.id), ytGapScope(site.id)));

      created++;
      createdGapIds.push(contentGap.id);
    }

    json(res, 200, { processed: pending.length, created, createdGapIds });
    return true;
  }

  // POST /v1/admin/yolo/run/gaps — bulk acknowledge top-N gaps → enqueue draft jobs (automation)
  if (method === 'POST' && pathname === '/v1/admin/yolo/run/gaps') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(50, body.limit)) : settings.gapsLimit;
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : settings.gapsModel;

    const newGaps = await db.select()
      .from(contentGaps)
      .where(and(gapScope(site.id), eq(contentGaps.status, 'new')))
      .orderBy(desc(contentGaps.confidenceScore), desc(contentGaps.createdAt))
      .limit(limit);

    let enqueued = 0;
    let skipped = 0;
    const jobIds: number[] = [];

    for (const gap of newGaps) {
      const [existing] = await db.select({ id: appJobs.id })
        .from(appJobs)
        .where(and(
          eq(appJobs.siteId, site.id),
          eq(appJobs.topic, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
        )).limit(1);

      if (existing) { skipped++; continue; }

      const job = await enqueueDraftJob(site.id, gap.id, model, gap.authorNotes ?? '');
      await db.update(contentGaps)
        .set({ status: 'in_progress', acknowledgedAt: new Date() })
        .where(and(eq(contentGaps.id, gap.id), gapScope(site.id)));

      enqueued++;
      jobIds.push(job.id);
    }

    json(res, 200, { processed: newGaps.length, enqueued, skipped, jobIds });
    return true;
  }

  // POST /v1/admin/yolo/run/publish — auto-publish completed draft articles (automation)
  if (method === 'POST' && pathname === '/v1/admin/yolo/run/publish') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(50, body.limit)) : settings.autoPublishLimit;

    const drafts = await db.select()
      .from(articles)
      .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId)))
      .orderBy(desc(articles.createdAt))
      .limit(limit);

    const publishedIds: number[] = [];
    const now = new Date();

    for (const article of drafts) {
      const [updated] = await db.update(articles)
        .set({ status: 'published', publishedAt: now, updatedAt: now })
        .where(and(eq(articles.id, article.id), articleScope(site.id)))
        .returning();

      if (article.sourceGapId) {
        await db.update(contentGaps)
          .set({ status: 'acknowledged', acknowledgedAt: now })
          .where(and(eq(contentGaps.id, article.sourceGapId), eq(contentGaps.siteId, site.id)));
      }

      const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent })
        .from(articleGenerations).where(eq(articleGenerations.articleId, article.id)).limit(1);

      if (generation) {
        await db.update(articleGenerations)
          .set({ publicationTimestamp: now, finalContent: updated.content, contentChanged: generation.originalContent !== updated.content })
          .where(eq(articleGenerations.id, generation.id));
      }

      publishedIds.push(article.id);
    }

    json(res, 200, { published: publishedIds.length, publishedIds, slugs: drafts.filter((d) => publishedIds.includes(d.id)).map((d) => d.slug) });
    return true;
  }

  // GET /v1/admin/yolo/pain-points — list pending pain points (YT + Reddit)
  if (method === 'GET' && pathname === '/v1/admin/yolo/pain-points') {
    const url = new URL(req.url ?? '/', `http://localhost`);
    const source = url.searchParams.get('source') ?? 'all';
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100')));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0'));
    const minIntensity = Math.max(1, Math.min(10, parseInt(url.searchParams.get('minIntensity') ?? '1')));

    const ytScope = or(eq(ytExtractedGaps.siteId, site.id), isNull(ytExtractedGaps.siteId));
    const rdScope = or(eq(redditExtractedGaps.siteId, site.id), isNull(redditExtractedGaps.siteId));

    const [ytItems, rdItems] = await Promise.all([
      source !== 'reddit'
        ? db.select().from(ytExtractedGaps)
            .where(and(ytScope, eq(ytExtractedGaps.status, 'pending'), gte(ytExtractedGaps.emotionalIntensity, minIntensity)))
            .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
            .limit(source === 'youtube' ? limit : 500)
        : Promise.resolve([]),
      source !== 'youtube'
        ? db.select().from(redditExtractedGaps)
            .where(and(rdScope, eq(redditExtractedGaps.status, 'pending'), gte(redditExtractedGaps.emotionalIntensity, minIntensity)))
            .orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt))
            .limit(source === 'reddit' ? limit : 500)
        : Promise.resolve([]),
    ]);

    const combined = [
      ...ytItems.map((p) => ({ ...p, source: 'youtube' as const })),
      ...rdItems.map((p) => ({ ...p, source: 'reddit' as const })),
    ]
      .sort((a, b) => b.emotionalIntensity - a.emotionalIntensity || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(offset, offset + limit);

    json(res, 200, { items: combined, total: ytItems.length + rdItems.length, limit, offset });
    return true;
  }

  // POST /v1/admin/yolo/approve/pain-points — approve specific pain points with authorNotes
  if (method === 'POST' && pathname === '/v1/admin/yolo/approve/pain-points') {
    const body = await readJsonBody(req);

    // Accept new {ytItems:[{id,authorNotes}]} OR old backward-compat {ytIds:[]}
    const ytItems: { id: number; authorNotes: string }[] = Array.isArray(body.ytItems)
      ? body.ytItems.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
      : Array.isArray(body.ytIds)
      ? body.ytIds.map((id: any) => ({ id: Number(id), authorNotes: '' }))
      : [];

    const rdItems: { id: number; authorNotes: string }[] = Array.isArray(body.rdItems)
      ? body.rdItems.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
      : Array.isArray(body.rdIds)
      ? body.rdIds.map((id: any) => ({ id: Number(id), authorNotes: '' }))
      : [];

    if (ytItems.length === 0 && rdItems.length === 0) {
      json(res, 400, { error: 'Provide ytItems or rdItems arrays' });
      return true;
    }

    const ytScope = or(eq(ytExtractedGaps.siteId, site.id), isNull(ytExtractedGaps.siteId));
    const rdScope = or(eq(redditExtractedGaps.siteId, site.id), isNull(redditExtractedGaps.siteId));

    let created = 0;
    const createdGapIds: number[] = [];

    if (ytItems.length > 0) {
      const ids = ytItems.map((x) => x.id).filter(Boolean);
      const pending = await db.select().from(ytExtractedGaps)
        .where(and(ytScope, eq(ytExtractedGaps.status, 'pending'), inArray(ytExtractedGaps.id, ids)));

      for (const gap of pending) {
        const item = ytItems.find((x) => x.id === gap.id)!;
        const sourceComments = await ytSourceComments((gap.sourceCommentIds || []).slice(0, 5));
        const gapDescription = [
          `Problem Context\n${gap.painPointDescription}`,
          gap.sourceVideoTitle ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed` : '',
          sourceComments.length > 0 ? `\n\nRepresentative Voices\n${sourceComments.map((c) => `- "${String(c.commentText ?? '').slice(0, 150)}" (${c.voteCount} votes)`).join('\n')}` : '',
          gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
        ].filter(Boolean).join('');

        const [contentGap] = await db.insert(contentGaps).values({
          siteId: site.id,
          gapTitle: gap.painPointTitle,
          gapDescription,
          confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
          suggestedAngle: gap.suggestedArticleAngle,
          relatedQueries: gap.vocabularyQuotes,
          sourceModels: ['youtube-apify', 'claude-sonnet'],
          authorNotes: item.authorNotes || null,
          status: 'new',
        }).returning();

        await db.update(ytExtractedGaps)
          .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
          .where(and(eq(ytExtractedGaps.id, gap.id), ytScope));

        created++;
        createdGapIds.push(contentGap.id);
      }
    }

    if (rdItems.length > 0) {
      const ids = rdItems.map((x) => x.id).filter(Boolean);
      const pending = await db.select().from(redditExtractedGaps)
        .where(and(rdScope, eq(redditExtractedGaps.status, 'pending'), inArray(redditExtractedGaps.id, ids)));

      for (const gap of pending) {
        const item = rdItems.find((x) => x.id === gap.id)!;
        const gapDescription = [
          `Problem Context\n${gap.painPointDescription}`,
          `\n\nFrequency: ${gap.frequency} mentions analyzed`,
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
          authorNotes: item.authorNotes || null,
          status: 'new',
        }).returning();

        await db.update(redditExtractedGaps)
          .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
          .where(and(eq(redditExtractedGaps.id, gap.id), rdScope));

        created++;
        createdGapIds.push(contentGap.id);
      }
    }

    json(res, 200, { processed: ytItems.length + rdItems.length, created, createdGapIds });
    return true;
  }

  // POST /v1/admin/yolo/acknowledge/gaps — acknowledge specific gaps with per-item authorNotes
  if (method === 'POST' && pathname === '/v1/admin/yolo/acknowledge/gaps') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : settings.gapsModel;

    // Accept new {items:[{id,authorNotes}]} OR old backward-compat {ids:[]}
    const items: { id: number; authorNotes: string }[] = Array.isArray(body.items)
      ? body.items.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
      : Array.isArray(body.ids)
      ? body.ids.map((id: any) => ({ id: Number(id), authorNotes: '' }))
      : [];

    if (items.length === 0) { json(res, 400, { error: 'Provide items array' }); return true; }

    const ids = items.map((x) => x.id).filter(Boolean);
    const targetGaps = await db.select().from(contentGaps)
      .where(and(gapScope(site.id), inArray(contentGaps.id, ids), eq(contentGaps.status, 'new')));

    let enqueued = 0;
    let skipped = 0;
    const jobIds: number[] = [];

    for (const gap of targetGaps) {
      const itemNotes = items.find((x) => x.id === gap.id)?.authorNotes ?? '';
      // Per-request notes override; fall back to gap's stored authorNotes from pain-point approval
      const finalNotes = itemNotes.trim() || gap.authorNotes || '';

      const [existing] = await db.select({ id: appJobs.id }).from(appJobs)
        .where(and(
          eq(appJobs.siteId, site.id),
          eq(appJobs.topic, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
        )).limit(1);

      if (existing) { skipped++; continue; }

      const job = await enqueueDraftJob(site.id, gap.id, model, finalNotes);
      await db.update(contentGaps)
        .set({ status: 'in_progress', acknowledgedAt: new Date() })
        .where(and(eq(contentGaps.id, gap.id), gapScope(site.id)));

      enqueued++;
      jobIds.push(job.id);
    }

    json(res, 200, { processed: ids.length, enqueued, skipped, jobIds });
    return true;
  }

  // GET /v1/admin/yolo/drafts — list draft articles sourced from content gaps
  if (method === 'GET' && pathname === '/v1/admin/yolo/drafts') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0'));

    const items = await db.select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      description: articles.description,
      readingTime: articles.readingTime,
      tags: articles.tags,
      sourceGapId: articles.sourceGapId,
      generatedByModel: articles.generatedByModel,
      createdAt: articles.createdAt,
    })
      .from(articles)
      .where(and(articleScope(site.id), eq(articles.status, 'draft')))
      .orderBy(desc(articles.createdAt))
      .limit(limit)
      .offset(offset);

    const gapIds = [...new Set(items.map((a) => a.sourceGapId).filter(Boolean))] as number[];
    const gapTitles: Record<number, string> = {};
    if (gapIds.length > 0) {
      const gapRows = await db.select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle })
        .from(contentGaps).where(inArray(contentGaps.id, gapIds));
      for (const g of gapRows) gapTitles[g.id] = g.gapTitle;
    }

    const enriched = items.map((a) => ({
      ...a,
      gapTitle: a.sourceGapId ? (gapTitles[a.sourceGapId] ?? null) : null,
    }));

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(articleScope(site.id), eq(articles.status, 'draft')));

    json(res, 200, { items: enriched, total });
    return true;
  }

  // POST /v1/admin/yolo/publish/selected — publish specific article IDs
  if (method === 'POST' && pathname === '/v1/admin/yolo/publish/selected') {
    const body = await readJsonBody(req);
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
    if (ids.length === 0) { json(res, 400, { error: 'Provide ids array' }); return true; }

    const drafts = await db.select().from(articles)
      .where(and(articleScope(site.id), eq(articles.status, 'draft'), inArray(articles.id, ids)));

    const publishedIds: number[] = [];
    const now = new Date();

    for (const article of drafts) {
      const [updated] = await db.update(articles)
        .set({ status: 'published', publishedAt: now, updatedAt: now })
        .where(and(eq(articles.id, article.id), articleScope(site.id)))
        .returning();

      if (article.sourceGapId) {
        await db.update(contentGaps)
          .set({ status: 'acknowledged', acknowledgedAt: now })
          .where(and(eq(contentGaps.id, article.sourceGapId), gapScope(site.id)));
      }

      const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent })
        .from(articleGenerations).where(eq(articleGenerations.articleId, article.id)).limit(1);

      if (generation) {
        await db.update(articleGenerations)
          .set({ publicationTimestamp: now, finalContent: updated.content, contentChanged: generation.originalContent !== updated.content })
          .where(eq(articleGenerations.id, generation.id));
      }

      publishedIds.push(article.id);
    }

    json(res, 200, { published: publishedIds.length, publishedIds });
    return true;
  }

  return false;
}
