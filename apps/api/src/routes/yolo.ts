import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, toPositiveInt,
  requireActiveSite, enqueueDraftJob, ytGapScope, gapScope, articleScope,
  ytSourceComments,
  db, and, desc, eq, gte, inArray, isNotNull, sql,
  ytExtractedGaps, contentGaps, appJobs, articles, articleGenerations, yoloSettings,
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
  const { req, res, method, pathname, segments } = ctx;

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

  // GET /v1/admin/yolo/preview — preview counts for each stage
  if (method === 'GET' && pathname === '/v1/admin/yolo/preview') {
    const settings = await getOrCreateSettings(site.id);
    const [ytPending, gapsNew, draftsReady] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` })
        .from(ytExtractedGaps)
        .where(and(
          ytGapScope(site.id),
          eq(ytExtractedGaps.status, 'pending'),
          gte(ytExtractedGaps.emotionalIntensity, settings.ytPainPointsMinIntensity),
        )),
      db.select({ total: sql<number>`count(*)::int` })
        .from(contentGaps)
        .where(and(gapScope(site.id), eq(contentGaps.status, 'new'))),
      db.select({ total: sql<number>`count(*)::int` })
        .from(articles)
        .where(and(
          articleScope(site.id),
          eq(articles.status, 'draft'),
          isNotNull(articles.sourceGapId),
        )),
    ]);
    json(res, 200, {
      ytPainPointsPending: ytPending[0]?.total ?? 0,
      gapsNew: gapsNew[0]?.total ?? 0,
      draftsReady: draftsReady[0]?.total ?? 0,
      settings,
    });
    return true;
  }

  // POST /v1/admin/yolo/run/pain-points — bulk approve YT pain points → content gaps
  if (method === 'POST' && pathname === '/v1/admin/yolo/run/pain-points') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(100, body.limit)) : settings.ytPainPointsLimit;
    const minIntensity = typeof body.minIntensity === 'number' ? body.minIntensity : settings.ytPainPointsMinIntensity;

    const pending = await db.select()
      .from(ytExtractedGaps)
      .where(and(
        ytGapScope(site.id),
        eq(ytExtractedGaps.status, 'pending'),
        gte(ytExtractedGaps.emotionalIntensity, minIntensity),
      ))
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

  // POST /v1/admin/yolo/run/gaps — bulk acknowledge content gaps → enqueue draft jobs
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
      // Check if there's already an active draft job for this gap
      const [existing] = await db.select({ id: appJobs.id })
        .from(appJobs)
        .where(and(
          eq(appJobs.siteId, site.id),
          eq(appJobs.topic, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
        ))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const job = await enqueueDraftJob(site.id, gap.id, model, '');
      await db.update(contentGaps)
        .set({ status: 'in_progress', acknowledgedAt: new Date() })
        .where(and(eq(contentGaps.id, gap.id), gapScope(site.id)));

      enqueued++;
      jobIds.push(job.id);
    }

    json(res, 200, { processed: newGaps.length, enqueued, skipped, jobIds });
    return true;
  }

  // POST /v1/admin/yolo/run/publish — auto-publish completed draft articles
  if (method === 'POST' && pathname === '/v1/admin/yolo/run/publish') {
    const body = await readJsonBody(req);
    const settings = await getOrCreateSettings(site.id);
    const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(50, body.limit)) : settings.autoPublishLimit;

    const drafts = await db.select()
      .from(articles)
      .where(and(
        articleScope(site.id),
        eq(articles.status, 'draft'),
        isNotNull(articles.sourceGapId),
      ))
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
        .from(articleGenerations)
        .where(eq(articleGenerations.articleId, article.id))
        .limit(1);

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

  return false;
}
