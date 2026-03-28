import { Hono } from 'hono';
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  contentGaps,
  redditExtractedGaps,
  redditPosts,
  redditScrapeRuns,
  redditTargets,
} from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';
import { findOffBrandMatch } from '../../../../../src/utils/brandFilter.ts';

export const redditRouter = new Hono<HonoEnv>();

// ─── Scope helpers ───────────────────────────────────────────────────────────

function redditTargetScope(siteId: number) {
  return or(eq(redditTargets.siteId, siteId), isNull(redditTargets.siteId));
}

function redditRunScope(siteId: number) {
  return or(eq(redditScrapeRuns.siteId, siteId), isNull(redditScrapeRuns.siteId));
}

function redditGapScope(siteId: number) {
  return or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function redditStatuses(value: string | null) {
  const allowed = ['pending', 'approved', 'rejected'];
  const parsed = (value ?? 'pending').split(',').map(s => s.trim()).filter(Boolean);
  return parsed.filter(s => allowed.includes(s));
}

async function redditSourcePosts(db: any, postIds: number[]) {
  if (postIds.length === 0) return [];
  return db
    .select({
      id: redditPosts.id,
      title: redditPosts.title,
      subreddit: redditPosts.subreddit,
      upvotes: redditPosts.upvotes,
      url: redditPosts.url,
    })
    .from(redditPosts)
    .where(inArray(redditPosts.id, postIds));
}

async function hydrateRedditGaps(db: any, rows: any[]) {
  return Promise.all(
    rows.map(async gap => ({
      ...gap,
      sourcePosts: await redditSourcePosts(db, (gap.sourcePostIds || []).slice(0, 3)),
    })),
  );
}

// ─── Targets ─────────────────────────────────────────────────────────────────

// GET /v1/admin/reddit/targets
redditRouter.get('/v1/admin/reddit/targets', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const targets = await db.select().from(redditTargets).where(redditTargetScope(siteId)!).orderBy(desc(redditTargets.priority));
  return c.json({ targets });
});

// POST /v1/admin/reddit/targets
redditRouter.post('/v1/admin/reddit/targets', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const type = typeof body.type === 'string' ? body.type : null;
  const value = typeof body.value === 'string' ? body.value.trim() : null;
  const label = typeof body.label === 'string' ? body.label.trim() : null;
  const priority = typeof body.priority === 'number' ? Math.max(0, Math.min(100, body.priority)) : 50;
  const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;

  if (!type || !['subreddit', 'keyword_search'].includes(type)) {
    return c.json({ error: 'type must be subreddit or keyword_search' }, 400);
  }
  if (!value) return c.json({ error: 'value is required' }, 400);
  if (!label) return c.json({ error: 'label is required' }, 400);

  const [target] = await db
    .insert(redditTargets)
    .values({ siteId, type, value, label, priority, isActive })
    .returning();

  return c.json({ target }, 201);
});

// PUT /v1/admin/reddit/targets/:id
redditRouter.put('/v1/admin/reddit/targets/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (typeof body.priority === 'number') patch.priority = Math.max(0, Math.min(100, body.priority));
  if (typeof body.label === 'string') patch.label = body.label.trim();
  if (typeof body.value === 'string') patch.value = body.value.trim();

  if (Object.keys(patch).length === 0) return c.json({ error: 'No fields to update' }, 400);

  const [target] = await db
    .update(redditTargets)
    .set(patch)
    .where(and(eq(redditTargets.id, id), redditTargetScope(siteId)!))
    .returning();

  if (!target) return c.json({ error: 'Target not found' }, 404);
  return c.json({ target });
});

// DELETE /v1/admin/reddit/targets/:id
redditRouter.delete('/v1/admin/reddit/targets/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db
    .delete(redditTargets)
    .where(and(eq(redditTargets.id, id), redditTargetScope(siteId)!));

  return c.body(null, 204);
});

// ─── Runs ─────────────────────────────────────────────────────────────────────

// GET /v1/admin/reddit/runs
redditRouter.get('/v1/admin/reddit/runs', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '') || 20, 1), 100);
  const page = Math.max(parseInt(c.req.query('page') ?? '') || 1, 1);
  const offset = (page - 1) * limit;

  const [runs, countRows] = await Promise.all([
    db.select().from(redditScrapeRuns).where(redditRunScope(siteId)!).orderBy(desc(redditScrapeRuns.runAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(redditScrapeRuns).where(redditRunScope(siteId)!),
  ]);

  const total = countRows[0]?.total ?? 0;
  return c.json({ runs, total, page, limit });
});

// GET /v1/admin/reddit/runs/:id
redditRouter.get('/v1/admin/reddit/runs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [run] = await db
    .select()
    .from(redditScrapeRuns)
    .where(and(eq(redditScrapeRuns.id, id), redditRunScope(siteId)!))
    .limit(1);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  const rawGaps = await db
    .select()
    .from(redditExtractedGaps)
    .where(and(eq(redditExtractedGaps.scrapeRunId, id), redditGapScope(siteId)!))
    .orderBy(desc(redditExtractedGaps.emotionalIntensity));

  const gaps = await hydrateRedditGaps(db, rawGaps);
  return c.json({ run, gaps });
});

// DELETE /v1/admin/reddit/runs/:id
redditRouter.delete('/v1/admin/reddit/runs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db
    .delete(redditScrapeRuns)
    .where(and(eq(redditScrapeRuns.id, id), redditRunScope(siteId)!));

  return c.json({ success: true });
});

// ─── Gaps ─────────────────────────────────────────────────────────────────────

// GET /v1/admin/reddit/gaps
redditRouter.get('/v1/admin/reddit/gaps', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '') || 20, 1), 100);
  const page = Math.max(parseInt(c.req.query('page') ?? '') || 1, 1);
  const offset = (page - 1) * limit;

  const statusParam = c.req.query('status') ?? null;
  const categoryParam = c.req.query('category') ?? null;
  const runIdParam = c.req.query('runId') ?? null;

  const statuses = redditStatuses(statusParam);
  const conditions: any[] = [redditGapScope(siteId)!];
  if (statuses.length > 0) conditions.push(inArray(redditExtractedGaps.status, statuses));
  if (categoryParam) conditions.push(eq(redditExtractedGaps.category, categoryParam));
  if (runIdParam) {
    const runId = Number(runIdParam);
    if (runId) conditions.push(eq(redditExtractedGaps.scrapeRunId, runId));
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [rawGaps, countRows, statsRows] = await Promise.all([
    db.select().from(redditExtractedGaps).where(whereClause).orderBy(desc(redditExtractedGaps.emotionalIntensity)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(redditExtractedGaps).where(whereClause),
    db.select({
      totalPending: sql<number>`count(*) filter (where ${redditExtractedGaps.status} = 'pending')::int`,
      totalApproved: sql<number>`count(*) filter (where ${redditExtractedGaps.status} = 'approved')::int`,
      totalRejected: sql<number>`count(*) filter (where ${redditExtractedGaps.status} = 'rejected')::int`,
    }).from(redditExtractedGaps).where(redditGapScope(siteId)!),
  ]);

  const gaps = await hydrateRedditGaps(db, rawGaps);
  const total = countRows[0]?.total ?? 0;
  const stats = statsRows[0] ?? null;

  return c.json({ gaps, items: gaps, total, page, limit, stats });
});

// IMPORTANT: Register auto-filter BEFORE :id routes to avoid param capture

// POST /v1/admin/reddit/gaps/auto-filter
redditRouter.post('/v1/admin/reddit/gaps/auto-filter', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const pendingGaps = await db
    .select()
    .from(redditExtractedGaps)
    .where(and(redditGapScope(siteId)!, eq(redditExtractedGaps.status, 'pending')));

  const matches: Array<{ id: number; title: string; match: string }> = [];
  const toReject: number[] = [];

  for (const gap of pendingGaps) {
    const match = findOffBrandMatch(
      gap.painPointTitle,
      gap.painPointDescription,
      gap.vocabularyQuotes ?? [],
      gap.emotionalIntensity,
    );
    if (match) {
      matches.push({ id: gap.id, title: gap.painPointTitle, match });
      toReject.push(gap.id);
    }
  }

  let rejectedCount = 0;
  if (toReject.length > 0) {
    await db
      .update(redditExtractedGaps)
      .set({ status: 'rejected', rejectedAt: new Date() })
      .where(inArray(redditExtractedGaps.id, toReject));
    rejectedCount = toReject.length;
  }

  return c.json({ success: true, processed: pendingGaps.length, rejectedCount, matches });
});

// POST /v1/admin/reddit/gaps/:id/approve
redditRouter.post('/v1/admin/reddit/gaps/:id/approve', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [gap] = await db
    .select()
    .from(redditExtractedGaps)
    .where(and(eq(redditExtractedGaps.id, id), redditGapScope(siteId)!))
    .limit(1);
  if (!gap) return c.json({ error: 'Gap not found' }, 404);

  // Create a contentGap from the reddit gap
  const [contentGap] = await db
    .insert(contentGaps)
    .values({
      siteId,
      gapTitle: gap.painPointTitle,
      gapDescription: gap.painPointDescription,
      status: 'new',
      suggestedAngle: gap.suggestedArticleAngle ?? null,
    })
    .returning();

  // Update reddit gap status to approved and link contentGap
  const [updatedGap] = await db
    .update(redditExtractedGaps)
    .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
    .where(eq(redditExtractedGaps.id, id))
    .returning();

  return c.json({ gap: updatedGap, contentGap });
});

// POST /v1/admin/reddit/gaps/:id/reject
redditRouter.post('/v1/admin/reddit/gaps/:id/reject', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [gap] = await db
    .select()
    .from(redditExtractedGaps)
    .where(and(eq(redditExtractedGaps.id, id), redditGapScope(siteId)!))
    .limit(1);
  if (!gap) return c.json({ error: 'Gap not found' }, 404);

  const [updatedGap] = await db
    .update(redditExtractedGaps)
    .set({ status: 'rejected', rejectedAt: new Date() })
    .where(eq(redditExtractedGaps.id, id))
    .returning();

  return c.json({ gap: updatedGap });
});
