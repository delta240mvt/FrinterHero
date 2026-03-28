import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  appJobs,
  articleGenerations,
  articles,
  contentGaps,
  redditExtractedGaps,
  ytComments,
  ytExtractedGaps,
  yoloSettings,
} from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const yoloRouter = new Hono<HonoEnv>();

// ─── Types ────────────────────────────────────────────────────────────────────

type YoloSettingsRow = typeof yoloSettings.$inferSelect;

const DEFAULT_SETTINGS: Omit<YoloSettingsRow, 'id' | 'siteId' | 'createdAt' | 'updatedAt'> = {
  ytPainPointsEnabled: false,
  ytPainPointsLimit: 10,
  ytPainPointsMinIntensity: 5,
  gapsEnabled: false,
  gapsLimit: 5,
  gapsModel: 'claude-sonnet-4-6',
  autoPublishEnabled: false,
  autoPublishLimit: 10,
};

// ─── Scope helpers ────────────────────────────────────────────────────────────

function ytGapScope(siteId: number) {
  return or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId));
}

function redditGapScope(siteId: number) {
  return or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId));
}

function gapScope(siteId: number) {
  return or(eq(contentGaps.siteId, siteId), isNull(contentGaps.siteId));
}

function articleScope(siteId: number) {
  return or(eq(articles.siteId, siteId), isNull(articles.siteId));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateSettings(db: any, siteId: number): Promise<YoloSettingsRow> {
  const [existing] = await db
    .select()
    .from(yoloSettings)
    .where(eq(yoloSettings.siteId, siteId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(yoloSettings)
    .values({ siteId, ...DEFAULT_SETTINGS })
    .returning();
  return created;
}

async function ytSourceComments(db: any, commentIds: number[]) {
  if (commentIds.length === 0) return [];
  return db
    .select({
      id: ytComments.id,
      commentText: ytComments.commentText,
      author: ytComments.author,
      voteCount: ytComments.voteCount,
      videoTitle: ytComments.videoTitle,
    })
    .from(ytComments)
    .where(inArray(ytComments.id, commentIds));
}

async function enqueueDraftJob(
  db: any,
  siteId: number,
  gapId: number,
  model: string,
  authorNotes: string,
) {
  const [job] = await db
    .insert(appJobs)
    .values({ siteId, type: 'draft', topic: 'draft', payload: { gapId, model, authorNotes } })
    .returning();
  return job;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /v1/admin/yolo/settings
yoloRouter.get('/v1/admin/yolo/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const settings = await getOrCreateSettings(db, siteId);
  return c.json({ settings });
});

// PUT /v1/admin/yolo/settings
yoloRouter.put('/v1/admin/yolo/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const updates: Partial<typeof yoloSettings.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.ytPainPointsEnabled === 'boolean') updates.ytPainPointsEnabled = body.ytPainPointsEnabled;
  if (typeof body.ytPainPointsLimit === 'number') updates.ytPainPointsLimit = Math.max(1, Math.min(100, body.ytPainPointsLimit));
  if (typeof body.ytPainPointsMinIntensity === 'number') updates.ytPainPointsMinIntensity = Math.max(1, Math.min(10, body.ytPainPointsMinIntensity));
  if (typeof body.gapsEnabled === 'boolean') updates.gapsEnabled = body.gapsEnabled;
  if (typeof body.gapsLimit === 'number') updates.gapsLimit = Math.max(1, Math.min(50, body.gapsLimit));
  if (typeof body.gapsModel === 'string' && body.gapsModel.trim()) updates.gapsModel = body.gapsModel.trim();
  if (typeof body.autoPublishEnabled === 'boolean') updates.autoPublishEnabled = body.autoPublishEnabled;
  if (typeof body.autoPublishLimit === 'number') updates.autoPublishLimit = Math.max(1, Math.min(50, body.autoPublishLimit));

  const existing = await getOrCreateSettings(db, siteId);
  const [updated] = await db
    .update(yoloSettings)
    .set(updates)
    .where(eq(yoloSettings.id, existing.id))
    .returning();
  return c.json({ settings: updated });
});

// GET /v1/admin/yolo/preview — pipeline counts
yoloRouter.get('/v1/admin/yolo/preview', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const settings = await getOrCreateSettings(db, siteId);
  const [ytPending, rdPending, gapsNew, draftsReady, gapsInProgress] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(ytExtractedGaps)
      .where(and(ytGapScope(siteId), eq(ytExtractedGaps.status, 'pending'))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(redditExtractedGaps)
      .where(and(redditGapScope(siteId), eq(redditExtractedGaps.status, 'pending'))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contentGaps)
      .where(and(gapScope(siteId), eq(contentGaps.status, 'new'))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(articleScope(siteId), eq(articles.status, 'draft'))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contentGaps)
      .where(and(gapScope(siteId), eq(contentGaps.status, 'in_progress'))),
  ]);

  return c.json({
    ytPainPointsPending: (ytPending[0]?.total ?? 0) + (rdPending[0]?.total ?? 0),
    gapsNew: gapsNew[0]?.total ?? 0,
    draftsReady: draftsReady[0]?.total ?? 0,
    gapsInProgress: gapsInProgress[0]?.total ?? 0,
    settings,
  });
});

// POST /v1/admin/yolo/run/pain-points — bulk approve top-N pain points (YT + Reddit) → content gaps
yoloRouter.post('/v1/admin/yolo/run/pain-points', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const settings = await getOrCreateSettings(db, siteId);
  const limit =
    typeof body.limit === 'number'
      ? Math.max(1, Math.min(100, body.limit))
      : settings.ytPainPointsLimit;
  const minIntensity =
    typeof body.minIntensity === 'number'
      ? body.minIntensity
      : settings.ytPainPointsMinIntensity;

  const rdScope = or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId));

  const [ytItems, rdItems] = await Promise.all([
    db
      .select()
      .from(ytExtractedGaps)
      .where(
        and(
          ytGapScope(siteId),
          eq(ytExtractedGaps.status, 'pending'),
          gte(ytExtractedGaps.emotionalIntensity, minIntensity),
        ),
      )
      .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
      .limit(limit),
    db
      .select()
      .from(redditExtractedGaps)
      .where(
        and(
          rdScope,
          eq(redditExtractedGaps.status, 'pending'),
          gte(redditExtractedGaps.emotionalIntensity, minIntensity),
        ),
      )
      .orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt))
      .limit(limit),
  ]);

  const merged: Array<{ source: 'yt' | 'rd'; item: (typeof ytItems)[0] | (typeof rdItems)[0] }> = [
    ...ytItems.map((item) => ({ source: 'yt' as const, item })),
    ...rdItems.map((item) => ({ source: 'rd' as const, item })),
  ]
    .sort((a, b) => b.item.emotionalIntensity - a.item.emotionalIntensity)
    .slice(0, limit);

  let created = 0;
  const createdGapIds: number[] = [];

  for (const { source, item } of merged) {
    if (source === 'yt') {
      const gap = item as (typeof ytItems)[0];
      const sourceComments = await ytSourceComments(db, (gap.sourceCommentIds || []).slice(0, 5));
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        gap.sourceVideoTitle
          ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed`
          : '',
        sourceComments.length > 0
          ? `\n\nRepresentative Voices\n${sourceComments
              .map(
                (co: any) =>
                  `- "${String(co.commentText ?? '').slice(0, 150)}" (${co.voteCount} votes)`,
              )
              .join('\n')}`
          : '',
        gap.vocabularyQuotes.length > 0
          ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const [contentGap] = await db
        .insert(contentGaps)
        .values({
          siteId,
          gapTitle: gap.painPointTitle,
          gapDescription,
          confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
          suggestedAngle: gap.suggestedArticleAngle,
          relatedQueries: gap.vocabularyQuotes,
          sourceModels: ['youtube-apify', 'claude-sonnet'],
          status: 'new',
        })
        .returning();

      await db
        .update(ytExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(ytExtractedGaps.id, gap.id), ytGapScope(siteId)));

      created++;
      createdGapIds.push(contentGap.id);
    } else {
      const gap = item as (typeof rdItems)[0];
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        `\n\nFrequency: ${gap.frequency} mentions analyzed`,
        gap.vocabularyQuotes.length > 0
          ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const [contentGap] = await db
        .insert(contentGaps)
        .values({
          siteId,
          gapTitle: gap.painPointTitle,
          gapDescription,
          confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
          suggestedAngle: gap.suggestedArticleAngle,
          relatedQueries: gap.vocabularyQuotes,
          sourceModels: ['reddit-apify', 'claude-sonnet'],
          status: 'new',
        })
        .returning();

      await db
        .update(redditExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(redditExtractedGaps.id, gap.id), rdScope));

      created++;
      createdGapIds.push(contentGap.id);
    }
  }

  return c.json({ processed: merged.length, created, createdGapIds });
});

// POST /v1/admin/yolo/run/gaps — bulk acknowledge top-N gaps → enqueue draft jobs
yoloRouter.post('/v1/admin/yolo/run/gaps', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const settings = await getOrCreateSettings(db, siteId);
  const limit =
    typeof body.limit === 'number'
      ? Math.max(1, Math.min(50, body.limit))
      : settings.gapsLimit;
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : settings.gapsModel;

  const newGaps = await db
    .select()
    .from(contentGaps)
    .where(and(gapScope(siteId), eq(contentGaps.status, 'new')))
    .orderBy(desc(contentGaps.confidenceScore), desc(contentGaps.createdAt))
    .limit(limit);

  let enqueued = 0;
  let skipped = 0;
  const jobIds: number[] = [];

  for (const gap of newGaps) {
    const [existing] = await db
      .select({ id: appJobs.id })
      .from(appJobs)
      .where(
        and(
          eq(appJobs.siteId, siteId),
          eq(appJobs.topic, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const job = await enqueueDraftJob(db, siteId, gap.id, model, gap.authorNotes ?? '');
    await db
      .update(contentGaps)
      .set({ status: 'in_progress', acknowledgedAt: new Date() })
      .where(and(eq(contentGaps.id, gap.id), gapScope(siteId)));

    enqueued++;
    jobIds.push(job.id);
  }

  return c.json({ processed: newGaps.length, enqueued, skipped, jobIds });
});

// POST /v1/admin/yolo/run/publish — auto-publish completed draft articles
yoloRouter.post('/v1/admin/yolo/run/publish', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const settings = await getOrCreateSettings(db, siteId);
  const limit =
    typeof body.limit === 'number'
      ? Math.max(1, Math.min(50, body.limit))
      : settings.autoPublishLimit;

  const drafts = await db
    .select()
    .from(articles)
    .where(and(articleScope(siteId), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId)))
    .orderBy(desc(articles.createdAt))
    .limit(limit);

  const publishedIds: number[] = [];
  const now = new Date();

  for (const article of drafts) {
    const [updated] = await db
      .update(articles)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(and(eq(articles.id, article.id), articleScope(siteId)))
      .returning();

    if (article.sourceGapId) {
      await db
        .update(contentGaps)
        .set({ status: 'acknowledged', acknowledgedAt: now })
        .where(and(eq(contentGaps.id, article.sourceGapId), eq(contentGaps.siteId, siteId)));
    }

    const [generation] = await db
      .select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent })
      .from(articleGenerations)
      .where(eq(articleGenerations.articleId, article.id))
      .limit(1);

    if (generation) {
      await db
        .update(articleGenerations)
        .set({
          publicationTimestamp: now,
          finalContent: updated.content,
          contentChanged: generation.originalContent !== updated.content,
        })
        .where(eq(articleGenerations.id, generation.id));
    }

    publishedIds.push(article.id);
  }

  return c.json({
    published: publishedIds.length,
    publishedIds,
    slugs: drafts
      .filter((d) => publishedIds.includes(d.id))
      .map((d) => d.slug),
  });
});

// GET /v1/admin/yolo/pain-points — list pending pain points (YT + Reddit)
yoloRouter.get('/v1/admin/yolo/pain-points', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const source = c.req.query('source') ?? 'all';
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') ?? '') || 100));
  const offset = Math.max(0, parseInt(c.req.query('offset') ?? '') || 0);
  const minIntensity = Math.max(1, Math.min(10, parseInt(c.req.query('minIntensity') ?? '') || 1));

  const ytScope = or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId));
  const rdScope = or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId));

  const [ytItems, rdItems] = await Promise.all([
    source !== 'reddit'
      ? db
          .select()
          .from(ytExtractedGaps)
          .where(
            and(
              ytScope,
              eq(ytExtractedGaps.status, 'pending'),
              gte(ytExtractedGaps.emotionalIntensity, minIntensity),
            ),
          )
          .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
          .limit(source === 'youtube' ? limit : 500)
      : Promise.resolve([]),
    source !== 'youtube'
      ? db
          .select()
          .from(redditExtractedGaps)
          .where(
            and(
              rdScope,
              eq(redditExtractedGaps.status, 'pending'),
              gte(redditExtractedGaps.emotionalIntensity, minIntensity),
            ),
          )
          .orderBy(
            desc(redditExtractedGaps.emotionalIntensity),
            desc(redditExtractedGaps.createdAt),
          )
          .limit(source === 'reddit' ? limit : 500)
      : Promise.resolve([]),
  ]);

  const combined = [
    ...(ytItems as any[]).map((p) => ({ ...p, source: 'youtube' as const })),
    ...(rdItems as any[]).map((p) => ({ ...p, source: 'reddit' as const })),
  ]
    .sort(
      (a, b) =>
        b.emotionalIntensity - a.emotionalIntensity ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(offset, offset + limit);

  return c.json({
    items: combined,
    total: (ytItems as any[]).length + (rdItems as any[]).length,
    limit,
    offset,
  });
});

// POST /v1/admin/yolo/approve/pain-points — approve specific pain points with authorNotes
yoloRouter.post('/v1/admin/yolo/approve/pain-points', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  const ytItems: { id: number; authorNotes: string }[] = Array.isArray(body.ytItems)
    ? (body.ytItems as any[]).map((x) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.ytIds)
    ? (body.ytIds as any[]).map((id) => ({ id: Number(id), authorNotes: '' }))
    : [];

  const rdItems: { id: number; authorNotes: string }[] = Array.isArray(body.rdItems)
    ? (body.rdItems as any[]).map((x) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.rdIds)
    ? (body.rdIds as any[]).map((id) => ({ id: Number(id), authorNotes: '' }))
    : [];

  if (ytItems.length === 0 && rdItems.length === 0) {
    return c.json({ error: 'Provide ytItems or rdItems arrays' }, 400);
  }

  const ytScope = or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId));
  const rdScope = or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId));

  let created = 0;
  const createdGapIds: number[] = [];

  if (ytItems.length > 0) {
    const ids = ytItems.map((x) => x.id).filter(Boolean);
    const pending = await db
      .select()
      .from(ytExtractedGaps)
      .where(and(ytScope, eq(ytExtractedGaps.status, 'pending'), inArray(ytExtractedGaps.id, ids)));

    for (const gap of pending) {
      const item = ytItems.find((x) => x.id === gap.id)!;
      const sourceComments = await ytSourceComments(db, (gap.sourceCommentIds || []).slice(0, 5));
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        gap.sourceVideoTitle
          ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed`
          : '',
        sourceComments.length > 0
          ? `\n\nRepresentative Voices\n${sourceComments
              .map(
                (co: any) =>
                  `- "${String(co.commentText ?? '').slice(0, 150)}" (${co.voteCount} votes)`,
              )
              .join('\n')}`
          : '',
        gap.vocabularyQuotes.length > 0
          ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const [contentGap] = await db
        .insert(contentGaps)
        .values({
          siteId,
          gapTitle: gap.painPointTitle,
          gapDescription,
          confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
          suggestedAngle: gap.suggestedArticleAngle,
          relatedQueries: gap.vocabularyQuotes,
          sourceModels: ['youtube-apify', 'claude-sonnet'],
          authorNotes: item.authorNotes || null,
          status: 'new',
        })
        .returning();

      await db
        .update(ytExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(ytExtractedGaps.id, gap.id), ytScope));

      created++;
      createdGapIds.push(contentGap.id);
    }
  }

  if (rdItems.length > 0) {
    const ids = rdItems.map((x) => x.id).filter(Boolean);
    const pending = await db
      .select()
      .from(redditExtractedGaps)
      .where(
        and(rdScope, eq(redditExtractedGaps.status, 'pending'), inArray(redditExtractedGaps.id, ids)),
      );

    for (const gap of pending) {
      const item = rdItems.find((x) => x.id === gap.id)!;
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        `\n\nFrequency: ${gap.frequency} mentions analyzed`,
        gap.vocabularyQuotes.length > 0
          ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('');

      const [contentGap] = await db
        .insert(contentGaps)
        .values({
          siteId,
          gapTitle: gap.painPointTitle,
          gapDescription,
          confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
          suggestedAngle: gap.suggestedArticleAngle,
          relatedQueries: gap.vocabularyQuotes,
          sourceModels: ['reddit-apify', 'claude-sonnet'],
          authorNotes: item.authorNotes || null,
          status: 'new',
        })
        .returning();

      await db
        .update(redditExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(redditExtractedGaps.id, gap.id), rdScope));

      created++;
      createdGapIds.push(contentGap.id);
    }
  }

  return c.json({ processed: ytItems.length + rdItems.length, created, createdGapIds });
});

// POST /v1/admin/yolo/acknowledge/gaps — acknowledge specific gaps with per-item authorNotes
yoloRouter.post('/v1/admin/yolo/acknowledge/gaps', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const settings = await getOrCreateSettings(db, siteId);
  const model =
    typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : settings.gapsModel;

  const items: { id: number; authorNotes: string }[] = Array.isArray(body.items)
    ? (body.items as any[]).map((x) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.ids)
    ? (body.ids as any[]).map((id) => ({ id: Number(id), authorNotes: '' }))
    : [];

  if (items.length === 0) return c.json({ error: 'Provide items array' }, 400);

  const ids = items.map((x) => x.id).filter(Boolean);
  const targetGaps = await db
    .select()
    .from(contentGaps)
    .where(and(gapScope(siteId), inArray(contentGaps.id, ids), eq(contentGaps.status, 'new')));

  let enqueued = 0;
  let skipped = 0;
  const jobIds: number[] = [];

  for (const gap of targetGaps) {
    const itemNotes = items.find((x) => x.id === gap.id)?.authorNotes ?? '';
    const finalNotes = itemNotes.trim() || gap.authorNotes || '';

    const [existing] = await db
      .select({ id: appJobs.id })
      .from(appJobs)
      .where(
        and(
          eq(appJobs.siteId, siteId),
          eq(appJobs.topic, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
        ),
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const job = await enqueueDraftJob(db, siteId, gap.id, model, finalNotes);
    await db
      .update(contentGaps)
      .set({ status: 'in_progress', acknowledgedAt: new Date() })
      .where(and(eq(contentGaps.id, gap.id), gapScope(siteId)));

    enqueued++;
    jobIds.push(job.id);
  }

  return c.json({ processed: ids.length, enqueued, skipped, jobIds });
});

// GET /v1/admin/yolo/draft-status — poll specific job IDs
yoloRouter.get('/v1/admin/yolo/draft-status', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const idsParam = c.req.query('ids') ?? '';
  const ids = idsParam.split(',').map(Number).filter(Boolean);
  if (!ids.length) return c.json({ error: 'ids required' }, 400);

  const jobs = await db
    .select({
      id: appJobs.id,
      status: appJobs.status,
      result: appJobs.result,
      progress: appJobs.progress,
      error: appJobs.error,
    })
    .from(appJobs)
    .where(and(eq(appJobs.siteId, siteId), inArray(appJobs.id, ids)));

  return c.json({ jobs });
});

// GET /v1/admin/yolo/drafts — list draft articles sourced from content gaps
yoloRouter.get('/v1/admin/yolo/drafts', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '') || 50));
  const offset = Math.max(0, parseInt(c.req.query('offset') ?? '') || 0);

  const items = await db
    .select({
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
    .where(and(articleScope(siteId), eq(articles.status, 'draft')))
    .orderBy(desc(articles.createdAt))
    .limit(limit)
    .offset(offset);

  const gapIds = [...new Set(items.map((a) => a.sourceGapId).filter(Boolean))] as number[];
  const gapTitles: Record<number, string> = {};
  if (gapIds.length > 0) {
    const gapRows = await db
      .select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle })
      .from(contentGaps)
      .where(inArray(contentGaps.id, gapIds));
    for (const g of gapRows) gapTitles[g.id] = g.gapTitle;
  }

  const enriched = items.map((a) => ({
    ...a,
    gapTitle: a.sourceGapId ? (gapTitles[a.sourceGapId] ?? null) : null,
  }));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(articles)
    .where(and(articleScope(siteId), eq(articles.status, 'draft')));

  return c.json({ items: enriched, total });
});

// POST /v1/admin/yolo/publish/selected — publish specific article IDs
yoloRouter.post('/v1/admin/yolo/publish/selected', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const ids: number[] = Array.isArray(body.ids)
    ? (body.ids as any[]).map(Number).filter(Boolean)
    : [];
  if (ids.length === 0) return c.json({ error: 'Provide ids array' }, 400);

  const now = new Date();
  const publishedIds: number[] = [];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const result = await db
        .update(articles)
        .set({ status: 'published', publishedAt: now, updatedAt: now })
        .where(and(eq(articles.id, id), eq(articles.status, 'draft'), articleScope(siteId)))
        .returning({ id: articles.id, sourceGapId: articles.sourceGapId });

      if (result.length > 0) {
        publishedIds.push(id);
        const sourceGapId = result[0].sourceGapId;
        if (sourceGapId) {
          await db
            .update(contentGaps)
            .set({ status: 'acknowledged', acknowledgedAt: now })
            .where(eq(contentGaps.id, sourceGapId));
        }
      } else {
        errors.push(`Article ${id} not found or not a draft`);
      }
    } catch (e: any) {
      errors.push(`Article ${id}: ${e.message}`);
    }
  }

  return c.json({ published: publishedIds.length, publishedIds, errors });
});
