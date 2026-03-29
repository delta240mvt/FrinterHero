import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  contentGaps,
  ytComments,
  ytExtractedGaps,
  ytScrapeRuns,
  ytTargets,
} from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';
import { findOffBrandMatch } from '../../../../../src/utils/brandFilter.ts';

export const youtubeRouter = new Hono<HonoEnv>();

// ─── Scope helpers ────────────────────────────────────────────────────────────

function ytTargetScope(siteId: number) {
  return or(eq(ytTargets.siteId, siteId), isNull(ytTargets.siteId));
}

function ytRunScope(siteId: number) {
  return or(eq(ytScrapeRuns.siteId, siteId), isNull(ytScrapeRuns.siteId));
}

function ytGapScope(siteId: number) {
  return or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId));
}

function ytCommentScope(siteId: number) {
  return or(eq(ytComments.siteId, siteId), isNull(ytComments.siteId));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPositiveInt(val: string | null, def: number, opts?: { min?: number; max?: number }): number {
  const n = parseInt(val ?? '', 10);
  if (isNaN(n)) return def;
  if (opts?.min !== undefined && n < opts.min) return opts.min;
  if (opts?.max !== undefined && n > opts.max) return opts.max;
  return n;
}

function ytStatuses(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(s => ['pending', 'approved', 'rejected'].includes(s));
}

async function ytSourceComments(db: any, ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(ytComments).where(inArray(ytComments.id, ids));
}

// ─── Overview ─────────────────────────────────────────────────────────────────

// GET /v1/admin/youtube/overview
youtubeRouter.get('/v1/admin/youtube/overview', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const [gapStats, runStats, targetStats, commentStats] = await Promise.all([
    db.select({
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      approved: sql<number>`count(*) filter (where status = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
    }).from(ytExtractedGaps).where(ytGapScope(siteId)!),
    db.select({ total: sql<number>`count(*)::int` }).from(ytScrapeRuns).where(ytRunScope(siteId)!),
    db.select({
      active: sql<number>`count(*) filter (where is_active = true)::int`,
      total: sql<number>`count(*)::int`,
    }).from(ytTargets).where(ytTargetScope(siteId)!),
    db.select({ total: sql<number>`count(*)::int` }).from(ytComments).where(ytCommentScope(siteId)!),
  ]);

  return c.json({
    gaps: gapStats[0] ?? { pending: 0, approved: 0, rejected: 0 },
    runs: runStats[0] ?? { total: 0 },
    targets: targetStats[0] ?? { active: 0, total: 0 },
    comments: commentStats[0] ?? { total: 0 },
  });
});

// ─── Targets ──────────────────────────────────────────────────────────────────

// GET /v1/admin/youtube/targets
youtubeRouter.get('/v1/admin/youtube/targets', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const targets = await db
    .select()
    .from(ytTargets)
    .where(ytTargetScope(siteId)!)
    .orderBy(desc(ytTargets.priority), desc(ytTargets.createdAt));

  return c.json({ targets });
});

// POST /v1/admin/youtube/targets
youtubeRouter.post('/v1/admin/youtube/targets', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const urlValue = typeof body.url === 'string' ? body.url.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const type = body.type === 'channel' ? 'channel' : 'video';

  if (!urlValue || !label) return c.json({ error: 'url and label required' }, 400);

  let videoId = typeof body.videoId === 'string' && body.videoId.trim() ? body.videoId.trim() : null;
  let channelHandle = typeof body.channelHandle === 'string' && body.channelHandle.trim() ? body.channelHandle.trim() : null;

  try {
    const parsed = new URL(urlValue);
    if (!videoId && type === 'video') videoId = parsed.searchParams.get('v') ?? null;
    if (!channelHandle && type === 'channel') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'channel') channelHandle = parts[1] ?? null;
      else if (parts[0]?.startsWith('@')) channelHandle = parts[0].replace('@', '');
      else if (parts[0] === 'c' || parts[0] === 'user') channelHandle = parts[1] ?? null;
    }
  } catch {
    // ignore URL parse errors
  }

  const [target] = await db.insert(ytTargets).values({
    siteId,
    type,
    url: urlValue,
    label,
    videoId,
    channelHandle,
    maxVideosPerChannel: toPositiveInt(String(body.maxVideosPerChannel ?? '5'), 5, { min: 1, max: 50 }),
    priority: toPositiveInt(String(body.priority ?? '50'), 50, { min: 0, max: 100 }),
    maxComments: toPositiveInt(String(body.maxComments ?? '300'), 300, { min: 1, max: 5000 }),
    isActive: body.isActive !== false,
  }).returning();

  return c.json({ target }, 201);
});

// PUT /v1/admin/youtube/targets/:id
youtubeRouter.put('/v1/admin/youtube/targets/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const updates: Record<string, unknown> = {};
  if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
  if (typeof body.priority === 'number') updates.priority = Math.max(0, Math.min(100, body.priority));
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
  if (typeof body.maxComments === 'number') updates.maxComments = Math.max(1, Math.min(5000, body.maxComments));
  if (typeof body.maxVideosPerChannel === 'number') updates.maxVideosPerChannel = Math.max(1, Math.min(50, body.maxVideosPerChannel));

  const [target] = await db
    .update(ytTargets)
    .set(updates)
    .where(and(eq(ytTargets.id, id), ytTargetScope(siteId)!))
    .returning();

  if (!target) return c.json({ error: 'Not found' }, 404);
  return c.json({ target });
});

// DELETE /v1/admin/youtube/targets/:id
youtubeRouter.delete('/v1/admin/youtube/targets/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db.delete(ytTargets).where(and(eq(ytTargets.id, id), ytTargetScope(siteId)!));

  return c.body(null, 204);
});

// ─── Runs ─────────────────────────────────────────────────────────────────────

// GET /v1/admin/youtube/runs
youtubeRouter.get('/v1/admin/youtube/runs', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const page = toPositiveInt(c.req.query('page') ?? null, 1, { max: 1000 });
  const limit = toPositiveInt(c.req.query('limit') ?? null, 10, { min: 1, max: 50 });
  const offset = (page - 1) * limit;

  const [runs, totals] = await Promise.all([
    db.select().from(ytScrapeRuns).where(ytRunScope(siteId)!).orderBy(desc(ytScrapeRuns.runAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(ytScrapeRuns).where(ytRunScope(siteId)!),
  ]);

  return c.json({ runs, total: totals[0]?.total ?? 0, page, limit });
});

// GET /v1/admin/youtube/runs/:id
youtubeRouter.get('/v1/admin/youtube/runs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [run] = await db
    .select()
    .from(ytScrapeRuns)
    .where(and(eq(ytScrapeRuns.id, id), ytRunScope(siteId)!))
    .limit(1);

  if (!run) return c.json({ error: 'Run not found' }, 404);

  const gaps = await db
    .select()
    .from(ytExtractedGaps)
    .where(and(eq(ytExtractedGaps.scrapeRunId, id), ytGapScope(siteId)!))
    .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt));

  return c.json({ run, gaps });
});

// DELETE /v1/admin/youtube/runs/:id
youtubeRouter.delete('/v1/admin/youtube/runs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db.delete(ytScrapeRuns).where(and(eq(ytScrapeRuns.id, id), ytRunScope(siteId)!));

  return c.json({ success: true });
});

// ─── Gaps ─────────────────────────────────────────────────────────────────────

// GET /v1/admin/youtube/gaps
youtubeRouter.get('/v1/admin/youtube/gaps', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const page = toPositiveInt(c.req.query('page') ?? null, 1, { max: 1000 });
  const limit = toPositiveInt(c.req.query('limit') ?? null, 20, { min: 1, max: 100 });
  const offset = (page - 1) * limit;

  const statuses = ytStatuses(c.req.query('status') ?? null);
  const category = c.req.query('category')?.trim() ?? '';
  const runIdParam = c.req.query('runId') ?? null;
  const runId = Number(runIdParam ?? 0);

  // Build fresh condition arrays per query to avoid shared mutable SQL state
  function buildConditions() {
    const conds: any[] = [ytGapScope(siteId!)!];
    conds.push(inArray(ytExtractedGaps.status, statuses.length > 0 ? statuses : ['pending']));
    if (category) conds.push(eq(ytExtractedGaps.category, category));
    if (runId) conds.push(eq(ytExtractedGaps.scrapeRunId, runId));
    return conds.length === 1 ? conds[0] : and(...conds);
  }

  // Run sequentially to avoid any concurrent SQL-object state issues
  let items: typeof ytExtractedGaps.$inferSelect[] = [];
  let itemsError: string | null = null;
  try {
    items = await db.select().from(ytExtractedGaps)
      .where(buildConditions())
      .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (err: any) {
    itemsError = String(err?.message ?? err);
  }

  const [totalRows, statsRows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(ytExtractedGaps).where(buildConditions()),
    db.select({
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      approved: sql<number>`count(*) filter (where status = 'approved')::int`,
      rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
    }).from(ytExtractedGaps).where(ytGapScope(siteId)!),
  ]);

  return c.json({
    gaps: items,
    items,
    total: totalRows[0]?.total ?? 0,
    page,
    limit,
    stats: statsRows[0] ?? { pending: 0, approved: 0, rejected: 0 },
    ...(itemsError ? { _itemsError: itemsError } : {}),
  });
});

// IMPORTANT: Register auto-filter BEFORE :id routes to avoid param capture

// POST /v1/admin/youtube/gaps/auto-filter
youtubeRouter.post('/v1/admin/youtube/gaps/auto-filter', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const pendingGaps = await db
    .select()
    .from(ytExtractedGaps)
    .where(and(ytGapScope(siteId)!, eq(ytExtractedGaps.status, 'pending')));

  const rejectedIds: number[] = [];
  const matches: Array<{ id: number; keyword: string }> = [];

  for (const gap of pendingGaps) {
    const match = findOffBrandMatch(
      gap.painPointTitle,
      gap.painPointDescription,
      gap.vocabularyQuotes || [],
      gap.emotionalIntensity,
    );
    if (!match) continue;
    rejectedIds.push(gap.id);
    matches.push({ id: gap.id, keyword: match });
  }

  if (rejectedIds.length > 0) {
    await db
      .update(ytExtractedGaps)
      .set({ status: 'rejected', rejectedAt: new Date() })
      .where(and(inArray(ytExtractedGaps.id, rejectedIds), ytGapScope(siteId)!));
  }

  return c.json({ success: true, processed: pendingGaps.length, rejectedCount: rejectedIds.length, matches });
});

// POST /v1/admin/youtube/gaps/:id/approve
youtubeRouter.post('/v1/admin/youtube/gaps/:id/approve', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [gap] = await db
    .select()
    .from(ytExtractedGaps)
    .where(and(eq(ytExtractedGaps.id, id), ytGapScope(siteId)!))
    .limit(1);
  if (!gap) return c.json({ error: 'Gap not found' }, 404);
  if (!['pending', 'rejected'].includes(gap.status)) return c.json({ error: 'Gap already processed' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const authorNotes =
    typeof body.authorNotes === 'string'
      ? body.authorNotes
      : typeof body.author_notes === 'string'
        ? body.author_notes
        : '';

  const sourceComments = await ytSourceComments(db, (gap.sourceCommentIds || []).slice(0, 5));

  const gapDescription = [
    `Problem Context\n${gap.painPointDescription}`,
    gap.sourceVideoTitle
      ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed`
      : '',
    sourceComments.length > 0
      ? `\n\nRepresentative Voices\n${(sourceComments as Array<{ commentText?: string | null; voteCount?: number | null }>).map((comment) => `- "${String(comment.commentText ?? '').slice(0, 150)}" (${comment.voteCount} votes)`).join('\n')}`
      : '',
    gap.vocabularyQuotes.length > 0
      ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}`
      : '',
  ].filter(Boolean).join('');

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
      authorNotes: authorNotes || null,
      status: 'new',
    })
    .returning();

  await db
    .update(ytExtractedGaps)
    .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
    .where(and(eq(ytExtractedGaps.id, id), ytGapScope(siteId)!));

  return c.json({ ok: true, contentGapId: contentGap.id });
});

// POST /v1/admin/youtube/gaps/:id/reject
youtubeRouter.post('/v1/admin/youtube/gaps/:id/reject', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db
    .update(ytExtractedGaps)
    .set({ status: 'rejected', rejectedAt: new Date() })
    .where(and(eq(ytExtractedGaps.id, id), ytGapScope(siteId)!));

  return c.json({ ok: true });
});
