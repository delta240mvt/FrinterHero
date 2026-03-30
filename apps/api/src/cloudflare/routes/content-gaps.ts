import { Hono } from 'hono';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { appJobs, contentGaps, geoRuns, knowledgeEntries, sites } from '../../../../../src/db/schema.ts';
import { buildJobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import type { CloudflareSiteSlug } from '../../../../../src/lib/cloudflare/bindings.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

const ACK_ACTIONS = ['generate_draft', 'snooze', 'archive'] as const;
type AckAction = (typeof ACK_ACTIONS)[number];

function gapScope(siteId: number) {
  return or(eq(contentGaps.siteId, siteId), isNull(contentGaps.siteId));
}

function geoRunScope(siteId: number) {
  return or(eq(geoRuns.siteId, siteId), isNull(geoRuns.siteId));
}

function kbScope(siteId: number) {
  return or(eq(knowledgeEntries.siteId, siteId), isNull(knowledgeEntries.siteId));
}

function serializeRecentRun(run: typeof geoRuns.$inferSelect | null) {
  if (!run) return null;
  return {
    id: run.id,
    runAt: run.runAt,
    gapsFound: run.gapsFound,
    gapsDeduped: run.gapsDeduped,
    queriesCount: run.queriesCount,
    draftsGenerated: run.draftsGenerated,
  };
}

async function enqueueDraftJob(
  db: any,
  siteId: number,
  gapId: number,
  model: string | null,
  authorNotes: string | null,
  queue?: { send?: (...args: any[]) => Promise<void> | void },
) {
  const [job] = await db
    .insert(appJobs)
    .values({
      siteId,
      type: 'draft',
      topic: 'draft',
      payload: { gapId, model, authorNotes },
    })
    .returning();

  if (job && queue?.send) {
    try {
      const [siteRow] = await db.select({ slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
      const siteSlug = (siteRow?.slug ?? 'frinter') as CloudflareSiteSlug;
      await queue.send(buildJobQueueMessage({
        jobId: String(job.id),
        payload: { gapId, model, authorNotes },
        siteId,
        siteSlug,
        topic: 'draft',
      }));
    } catch (e) {
      console.error('[content-gaps] Failed to send draft job to queue:', e);
    }
  }

  return job;
}

export const contentGapsRouter = new Hono<HonoEnv>();

// GET /v1/admin/content-gaps — paginated list with filters + KB hints + stats
contentGapsRouter.get('/v1/admin/content-gaps', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const statusParam = c.req.query('status')?.trim() ?? '';
  const confidenceMinParam = c.req.query('confidenceMin') ?? c.req.query('confidence_min') ?? '';
  const confidenceMaxParam = c.req.query('confidenceMax') ?? c.req.query('confidence_max') ?? '';
  const sortBy = c.req.query('sort_by') ?? 'confidence';
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '') || 20, 1), 100);
  const offset = Math.max(Math.min(parseInt(c.req.query('offset') ?? '') || 0, 5000), 0);
  const hasProposalParam = c.req.query('hasProposal') ?? c.req.query('has_proposal') ?? '';

  const confidenceMin = confidenceMinParam ? Math.max(0, Math.min(100, parseInt(confidenceMinParam))) : null;
  const confidenceMax = confidenceMaxParam ? Math.max(0, Math.min(100, parseInt(confidenceMaxParam))) : null;
  const statuses = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  const conditions: any[] = [gapScope(siteId)!];
  if (statuses.length > 0) conditions.push(inArray(contentGaps.status, statuses));
  if (confidenceMin !== null) conditions.push(gte(contentGaps.confidenceScore, confidenceMin));
  if (confidenceMax !== null) conditions.push(lte(contentGaps.confidenceScore, confidenceMax));
  if (hasProposalParam === 'true') conditions.push(isNotNull(contentGaps.suggestedAngle));

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
  const orderBy = sortBy === 'recency' ? desc(contentGaps.createdAt) : desc(contentGaps.confidenceScore);

  const [gaps, countRows, recentRunRows, statsRows] = await Promise.all([
    db.select().from(contentGaps).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(contentGaps).where(whereClause),
    db.select().from(geoRuns).where(geoRunScope(siteId)!).orderBy(desc(geoRuns.runAt)).limit(1),
    db.select({
      totalAll: sql<number>`count(*)::int`,
      totalNew: sql<number>`count(*) filter (where ${contentGaps.status} = 'new')::int`,
      totalInProgress: sql<number>`count(*) filter (where ${contentGaps.status} = 'in_progress')::int`,
      totalAcknowledged: sql<number>`count(*) filter (where ${contentGaps.status} = 'acknowledged')::int`,
      totalArchived: sql<number>`count(*) filter (where ${contentGaps.status} = 'archived')::int`,
    }).from(contentGaps).where(gapScope(siteId)!),
  ]);

  const total = countRows[0]?.total ?? 0;
  const recentRun = recentRunRows[0] ?? null;
  const statsRaw = statsRows[0];
  const stats = statsRaw
    ? {
        total_all: statsRaw.totalAll,
        totalAll: statsRaw.totalAll,
        total_new: statsRaw.totalNew,
        totalNew: statsRaw.totalNew,
        total_in_progress: statsRaw.totalInProgress,
        totalInProgress: statsRaw.totalInProgress,
        total_acknowledged: statsRaw.totalAcknowledged,
        totalAcknowledged: statsRaw.totalAcknowledged,
        total_archived: statsRaw.totalArchived,
        totalArchived: statsRaw.totalArchived,
      }
    : null;

  // KB hints: first 3 words of gapTitle via ilike + tsvector
  const gapsWithHints = await Promise.all(
    gaps.map(async (gap) => {
      const firstThreeWords = gap.gapTitle.trim().split(/\s+/).slice(0, 3).join(' ');
      const kbHints = await db
        .select({ id: knowledgeEntries.id, title: knowledgeEntries.title, type: knowledgeEntries.type, importanceScore: knowledgeEntries.importanceScore })
        .from(knowledgeEntries)
        .where(and(
          kbScope(siteId)!,
          or(
            ilike(knowledgeEntries.title, `%${firstThreeWords}%`),
            sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${firstThreeWords})`,
          )!,
        ))
        .limit(5);
      return { ...gap, kbHints };
    }),
  );

  const serializedRun = serializeRecentRun(recentRun);

  return c.json({
    items: gapsWithHints,
    gaps: gapsWithHints,
    pagination: { total, limit, offset },
    stats,
    recentRun: serializedRun,
    recent_run: serializedRun,
    kbHintsIncluded: true,
  });
});

// GET /v1/admin/content-gaps/:id
contentGapsRouter.get('/v1/admin/content-gaps/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const gapId = Number(c.req.param('id'));
  if (!gapId) return c.json({ error: 'Invalid id' }, 400);
  const [gap] = await db.select().from(contentGaps).where(and(gapScope(siteId)!, eq(contentGaps.id, gapId))).limit(1);
  if (!gap) return c.json({ error: 'Content gap not found' }, 404);
  return c.json(gap);
});

// POST /v1/admin/content-gaps/:id/acknowledge
contentGapsRouter.post('/v1/admin/content-gaps/:id/acknowledge', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const gapId = Number(c.req.param('id'));
  if (!gapId) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const action = typeof body.action === 'string' ? body.action : '';
  const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : (typeof body.author_notes === 'string' ? body.author_notes : null);
  const model = typeof body.model === 'string' ? body.model : null;

  if (!ACK_ACTIONS.includes(action as AckAction)) {
    return c.json({ error: `action must be one of: ${ACK_ACTIONS.join(', ')}` }, 400);
  }

  const [gap] = await db.select().from(contentGaps).where(and(gapScope(siteId)!, eq(contentGaps.id, gapId))).limit(1);
  if (!gap) return c.json({ error: 'Content gap not found' }, 404);

  if (gap.status === 'archived') {
    return c.json({ error: 'Gap is already archived' }, 409);
  }

  if (gap.status === 'acknowledged' && action !== 'generate_draft') {
    return c.json({ error: 'Gap is already acknowledged' }, 409);
  }

  let jobId: number | null = null;
  let draftGenerationStarted = false;

  if (action === 'generate_draft') {
    // Check for existing pending/running draft job
    const existingJobs = await db
      .select({ id: appJobs.id })
      .from(appJobs)
      .where(
        and(
          eq(appJobs.siteId, siteId),
          eq(appJobs.type, 'draft'),
          inArray(appJobs.status, ['pending', 'running']),
          sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`,
        ),
      )
      .limit(1);

    if (existingJobs.length > 0) {
      return c.json({ error: 'Draft generation already in progress for this gap' }, 409);
    }

    const job = await enqueueDraftJob(db, siteId, gapId, model, authorNotes, c.env.JOB_QUEUE);
    if (job) {
      jobId = job.id;
      draftGenerationStarted = true;
    }
  }

  const newStatus = action === 'generate_draft' ? 'in_progress' : 'archived';
  const [updatedGap] = await db
    .update(contentGaps)
    .set({ status: newStatus, acknowledgedAt: new Date(), authorNotes: authorNotes ?? gap.authorNotes })
    .where(and(eq(contentGaps.id, gapId), gapScope(siteId)!))
    .returning();

  return c.json({
    gapId,
    gap_id: gapId,
    status: updatedGap?.status ?? newStatus,
    authorNotes: updatedGap?.authorNotes ?? null,
    author_notes: updatedGap?.authorNotes ?? null,
    acknowledgedAt: updatedGap?.acknowledgedAt ?? null,
    acknowledged_at: updatedGap?.acknowledgedAt ?? null,
    jobId,
    draftGenerationStarted,
    draft_generation_started: draftGenerationStarted,
    draft_id: null,
  });
});

// POST /v1/admin/content-gaps/:id/archive
contentGapsRouter.post('/v1/admin/content-gaps/:id/archive', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const gapId = Number(c.req.param('id'));
  if (!gapId) return c.json({ error: 'Invalid id' }, 400);

  const [gap] = await db.select().from(contentGaps).where(and(gapScope(siteId)!, eq(contentGaps.id, gapId))).limit(1);
  if (!gap) return c.json({ error: 'Content gap not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const reason = typeof body.reason === 'string' ? body.reason : null;

  const archivedAt = new Date();
  const [updatedGap] = await db
    .update(contentGaps)
    .set({ status: 'archived', acknowledgedAt: archivedAt })
    .where(and(eq(contentGaps.id, gapId), gapScope(siteId)!))
    .returning();

  return c.json({
    gapId,
    gap_id: gapId,
    status: 'archived',
    archivedAt: updatedGap?.acknowledgedAt ?? archivedAt,
    archived_at: updatedGap?.acknowledgedAt ?? archivedAt,
    reason,
  });
});

// POST /v1/admin/content-gaps/:id/reset-draft
// Cancels stuck pending/running draft jobs for this gap and resets gap status to 'new'
contentGapsRouter.post('/v1/admin/content-gaps/:id/reset-draft', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const gapId = Number(c.req.param('id'));
  if (!gapId) return c.json({ error: 'Invalid id' }, 400);

  // Cancel all stuck draft jobs for this gap
  const cancelled = await db
    .update(appJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(appJobs.siteId, siteId),
        eq(appJobs.type, 'draft'),
        inArray(appJobs.status, ['pending', 'running']),
        sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`,
      ),
    )
    .returning({ id: appJobs.id });

  // Reset gap status to 'new' so it can be re-triggered
  const [updatedGap] = await db
    .update(contentGaps)
    .set({ status: 'new' })
    .where(and(eq(contentGaps.id, gapId), gapScope(siteId)!))
    .returning({ id: contentGaps.id, status: contentGaps.status });

  if (!updatedGap) return c.json({ error: 'Content gap not found' }, 404);

  return c.json({ ok: true, gapId, cancelledJobs: cancelled.length, status: updatedGap.status });
});
