import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  shSettings,
  shSocialAccounts,
  shTemplates,
  shContentBriefs,
  shPublishLog,
  shPostMetrics,
  shGeneratedCopy,
  shMediaAssets,
  shQueue,
} from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const socialHubRouter = new Hono<HonoEnv>();

// ─── Settings helpers ──────────────────────────────────────────────────────────

async function getShSettings(db: any, siteId: number) {
  const rows = await db
    .select()
    .from(shSettings)
    .where(or(eq(shSettings.siteId, siteId), isNull(shSettings.siteId)))
    .limit(1);
  if (!rows.length) return {};
  return rows[0].config ?? {};
}

async function saveShSettings(db: any, config: unknown, siteId: number) {
  const rows = await db
    .select({ id: shSettings.id })
    .from(shSettings)
    .where(eq(shSettings.siteId, siteId))
    .limit(1);
  if (rows.length) {
    await db
      .update(shSettings)
      .set({ config, updatedAt: new Date() })
      .where(eq(shSettings.id, rows[0].id));
  } else {
    await db.insert(shSettings).values({ siteId, config });
  }
}

// ─── Scope helpers ─────────────────────────────────────────────────────────────

function shAccountScope(siteId: number) {
  return or(eq(shSocialAccounts.siteId, siteId), isNull(shSocialAccounts.siteId));
}

function shTemplateScope(siteId: number) {
  return or(eq(shTemplates.siteId, siteId), isNull(shTemplates.siteId));
}

function shPublishScope(siteId: number) {
  return or(eq(shPublishLog.siteId, siteId), isNull(shPublishLog.siteId));
}

function shBriefScope(siteId: number) {
  return or(eq(shContentBriefs.siteId, siteId), isNull(shContentBriefs.siteId));
}

function toInt(val: string | null | undefined, def: number): number {
  const n = parseInt(val ?? '', 10);
  return isNaN(n) ? def : n;
}

// ─── GET /v1/social-hub/settings ──────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const settings = await getShSettings(db, siteId);
  return c.json(settings);
});

// ─── PUT /v1/social-hub/settings ──────────────────────────────────────────────

socialHubRouter.put('/v1/social-hub/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  await saveShSettings(db, body, siteId);
  return c.json({ ok: true, config: body });
});

// ─── GET /v1/social-hub/accounts ──────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/accounts', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const accounts = await db
    .select()
    .from(shSocialAccounts)
    .where(shAccountScope(siteId)!)
    .orderBy(asc(shSocialAccounts.platform), desc(shSocialAccounts.createdAt));
  return c.json(accounts);
});

// ─── POST /v1/social-hub/accounts ─────────────────────────────────────────────

socialHubRouter.post('/v1/social-hub/accounts', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  if (!body.platform || !body.accountName) {
    return c.json({ error: 'platform and accountName are required' }, 400);
  }

  const [created] = await db
    .insert(shSocialAccounts)
    .values({
      siteId,
      platform: String(body.platform),
      accountName: String(body.accountName),
      accountHandle: body.accountHandle ? String(body.accountHandle) : null,
      authPayload: body.authPayload ?? null,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    })
    .returning();
  return c.json(created, 201);
});

// ─── PUT /v1/social-hub/accounts/:id ──────────────────────────────────────────

socialHubRouter.put('/v1/social-hub/accounts/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const patch: Record<string, unknown> = {};
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (body.accountName !== undefined) patch.accountName = String(body.accountName);
  if (body.accountHandle !== undefined) patch.accountHandle = body.accountHandle ? String(body.accountHandle) : null;
  if (!Object.keys(patch).length) return c.json({ error: 'No updatable fields provided' }, 400);

  const [updated] = await db
    .update(shSocialAccounts)
    .set(patch)
    .where(and(eq(shSocialAccounts.id, id), shAccountScope(siteId)!))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// ─── DELETE /v1/social-hub/accounts/:id ───────────────────────────────────────

socialHubRouter.delete('/v1/social-hub/accounts/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const deleted = await db
    .delete(shSocialAccounts)
    .where(and(eq(shSocialAccounts.id, id), shAccountScope(siteId)!))
    .returning({ id: shSocialAccounts.id });
  if (!deleted.length) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true, id });
});

// ─── GET /v1/social-hub/templates ─────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/templates', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const templates = await db
    .select()
    .from(shTemplates)
    .where(and(shTemplateScope(siteId)!, eq(shTemplates.isActive, true)))
    .orderBy(shTemplates.id);
  return c.json(templates);
});

// ─── POST /v1/social-hub/templates ────────────────────────────────────────────

socialHubRouter.post('/v1/social-hub/templates', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const requiredFields = ['name', 'slug', 'category', 'aspectRatio', 'jsxTemplate'];
  const missing = requiredFields.filter((f) => !body[f]);
  if (missing.length > 0) {
    return c.json({ error: `Missing required fields: ${missing.join(', ')}` }, 400);
  }

  try {
    const [created] = await db
      .insert(shTemplates)
      .values({
        siteId,
        name: String(body.name),
        slug: String(body.slug),
        category: String(body.category),
        aspectRatio: String(body.aspectRatio),
        jsxTemplate: String(body.jsxTemplate),
      })
      .returning();
    return c.json(created, 201);
  } catch (error: any) {
    if (error?.code === '23505' || String(error?.message).includes('unique')) {
      return c.json({ error: `Template slug "${body.slug}" already exists` }, 409);
    }
    throw error;
  }
});

// ─── PUT /v1/social-hub/templates/:id ─────────────────────────────────────────

socialHubRouter.put('/v1/social-hub/templates/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = String(body.name);
  if (body.slug !== undefined) updates.slug = String(body.slug);
  if (body.category !== undefined) updates.category = String(body.category);
  if (body.aspectRatio !== undefined) updates.aspectRatio = String(body.aspectRatio);
  if (body.jsxTemplate !== undefined) updates.jsxTemplate = String(body.jsxTemplate);
  if (body.previewUrl !== undefined) updates.previewUrl = body.previewUrl ? String(body.previewUrl) : null;
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  if (!Object.keys(updates).length) return c.json({ error: 'Request body is empty' }, 400);

  try {
    const [updated] = await db
      .update(shTemplates)
      .set(updates)
      .where(and(eq(shTemplates.id, id), shTemplateScope(siteId)!))
      .returning();
    if (!updated) return c.json({ error: 'Template not found' }, 404);
    return c.json(updated);
  } catch (error: any) {
    if (error?.code === '23505' || String(error?.message).includes('unique')) {
      return c.json({ error: `Template slug "${body.slug}" already exists` }, 409);
    }
    throw error;
  }
});

// ─── DELETE /v1/social-hub/templates/:id ──────────────────────────────────────

socialHubRouter.delete('/v1/social-hub/templates/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const deleted = await db
    .delete(shTemplates)
    .where(and(eq(shTemplates.id, id), shTemplateScope(siteId)!))
    .returning({ id: shTemplates.id });
  if (!deleted.length) return c.json({ error: 'Template not found' }, 404);
  return c.json({ ok: true, id });
});

// ─── GET /v1/social-hub/calendar ──────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/calendar', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const now = new Date();
  const year = Number.parseInt(c.req.query('year') ?? String(now.getFullYear()), 10);
  const month = Number.parseInt(c.req.query('month') ?? String(now.getMonth() + 1), 10);
  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return c.json({ error: 'Invalid year or month' }, 400);
  }

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const monthEndInclusive = new Date(monthEnd.getTime() - 1);

  const inMonth = and(
    gte(shPublishLog.scheduledFor, monthStart),
    lte(shPublishLog.scheduledFor, monthEndInclusive),
  );
  const publishedInMonth = and(
    gte(shPublishLog.publishedAt, monthStart),
    lte(shPublishLog.publishedAt, monthEndInclusive),
  );

  const selectFields = {
    logId: shPublishLog.id,
    briefId: shPublishLog.briefId,
    platform: shPublishLog.platform,
    status: shPublishLog.status,
    scheduledFor: shPublishLog.scheduledFor,
    publishedAt: shPublishLog.publishedAt,
    accountId: shPublishLog.accountId,
  };

  const [scheduledRows, publishedRows] = await Promise.all([
    db.select(selectFields).from(shPublishLog)
      .where(and(shPublishScope(siteId)!, inMonth)),
    db.select(selectFields).from(shPublishLog)
      .where(and(shPublishScope(siteId)!, publishedInMonth)),
  ]);

  const seen = new Set<number>();
  const posts = [...scheduledRows, ...publishedRows]
    .filter((row: any) => {
      if (seen.has(row.logId)) return false;
      seen.add(row.logId);
      return true;
    })
    .map((row: any) => {
      const anchor = row.scheduledFor ?? row.publishedAt;
      return {
        day: anchor ? (anchor as Date).getUTCDate() : null,
        logId: row.logId,
        briefId: row.briefId,
        platform: row.platform,
        status: row.status,
        scheduledFor: row.scheduledFor ? (row.scheduledFor as Date).toISOString() : null,
        publishedAt: row.publishedAt ? (row.publishedAt as Date).toISOString() : null,
      };
    });

  return c.json({ month: { year, month }, posts });
});

// ─── PUT /v1/social-hub/calendar ──────────────────────────────────────────────

socialHubRouter.put('/v1/social-hub/calendar', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const publishLogId = Number(body.publishLogId ?? 0);
  const scheduledFor = typeof body.scheduledFor === 'string' ? body.scheduledFor : '';
  if (!publishLogId || !scheduledFor) {
    return c.json({ error: 'Missing required fields: publishLogId, scheduledFor' }, 400);
  }

  const newDate = new Date(scheduledFor);
  if (Number.isNaN(newDate.getTime())) {
    return c.json({ error: 'Invalid scheduledFor date' }, 400);
  }

  const [updated] = await db
    .update(shPublishLog)
    .set({ scheduledFor: newDate })
    .where(and(eq(shPublishLog.id, publishLogId), shPublishScope(siteId)!))
    .returning();
  if (!updated) return c.json({ error: 'Publish log not found' }, 404);
  return c.json({ ok: true, publishLog: updated });
});

// ─── POST /v1/social-hub/repurpose ────────────────────────────────────────────
// Heavy lifting (loadSource, matchKbEntries, renderSocialImage) runs in Workers/Workflows.
// This route validates inputs and returns a queued acknowledgement.

socialHubRouter.post('/v1/social-hub/repurpose', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
  const sourceId = Number(body.sourceId ?? 0);
  const targetAccountIds = Array.isArray(body.targetAccountIds)
    ? (body.targetAccountIds as unknown[]).map((id) => Number(id)).filter(Boolean)
    : [];

  if (!sourceType || !sourceId) {
    return c.json({ error: 'Missing required fields: sourceType, sourceId' }, 400);
  }
  if (targetAccountIds.length === 0) {
    return c.json({ error: 'targetAccountIds must be a non-empty array' }, 400);
  }

  // Validate accounts exist for this site
  const accounts = await db
    .select({ id: shSocialAccounts.id, platform: shSocialAccounts.platform })
    .from(shSocialAccounts)
    .where(and(inArray(shSocialAccounts.id, targetAccountIds), shAccountScope(siteId)!));

  if (!accounts.length) {
    return c.json({ error: 'No valid accounts found for provided targetAccountIds' }, 400);
  }

  // Stub: queue for Worker processing
  return c.json({ ok: true, message: 'queued', sourceType, sourceId, targetAccountIds }, 202);
});

// ─── Briefs ───────────────────────────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/briefs', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const limit = Math.min(toInt(c.req.query('limit'), 20), 100);
  const offset = Math.max(toInt(c.req.query('offset'), 0), 0);
  const statusFilter = c.req.query('status');

  const conditions: any[] = [shBriefScope(siteId)!];
  if (statusFilter) conditions.push(eq(shContentBriefs.status, statusFilter));
  const whereClause = and(...conditions);

  const [briefs, totals, statusCounts] = await Promise.all([
    db.select().from(shContentBriefs).where(whereClause).orderBy(desc(shContentBriefs.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(shContentBriefs).where(whereClause),
    db.select({
      status: shContentBriefs.status,
      count: sql<number>`count(*)::int`,
    }).from(shContentBriefs).where(shBriefScope(siteId)!).groupBy(shContentBriefs.status),
  ]);

  const statusSummary: Record<string, number> = {};
  for (const row of statusCounts) statusSummary[row.status] = row.count;

  return c.json({ results: briefs, briefs, total: totals[0]?.total ?? 0, limit, offset, statusSummary });
});

socialHubRouter.post('/v1/social-hub/briefs', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const { sourceType, sourceId, sourceTitle, outputFormat, targetPlatforms, targetAccountIds } = body as any;

  if (!sourceType || !sourceId || !outputFormat) {
    return c.json({ error: 'Missing required: sourceType, sourceId, outputFormat' }, 400);
  }

  const [brief] = await db.insert(shContentBriefs).values({
    siteId,
    sourceType: String(sourceType),
    sourceId: Number(sourceId),
    sourceTitle: sourceTitle ? String(sourceTitle) : null,
    outputFormat: String(outputFormat),
    targetPlatforms: Array.isArray(targetPlatforms) ? targetPlatforms : [],
    targetAccountIds: Array.isArray(targetAccountIds) ? targetAccountIds : [],
  }).returning();

  return c.json({ brief }, 201);
});

socialHubRouter.get('/v1/social-hub/briefs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const briefId = Number(c.req.param('id'));
  if (isNaN(briefId)) return c.json({ error: 'Invalid id' }, 400);

  const [brief] = await db.select().from(shContentBriefs)
    .where(and(eq(shContentBriefs.id, briefId), shBriefScope(siteId)!))
    .limit(1);
  if (!brief) return c.json({ error: 'Brief not found' }, 404);

  const [generatedCopy, mediaAssets, publishLogs, accounts] = await Promise.all([
    db.select().from(shGeneratedCopy)
      .where(eq(shGeneratedCopy.briefId, briefId))
      .orderBy(asc(shGeneratedCopy.variantIndex)),
    db.select().from(shMediaAssets)
      .where(eq(shMediaAssets.briefId, briefId))
      .orderBy(desc(shMediaAssets.createdAt)),
    db.select().from(shPublishLog)
      .where(eq(shPublishLog.briefId, briefId))
      .orderBy(desc(shPublishLog.createdAt)),
    db.select().from(shSocialAccounts)
      .where(or(eq(shSocialAccounts.siteId, siteId), isNull(shSocialAccounts.siteId))!),
  ]);

  const targetAccountIds: number[] = Array.isArray(brief.targetAccountIds) ? brief.targetAccountIds as number[] : [];
  const targetAccounts = accounts.filter(a => targetAccountIds.includes(a.id));

  return c.json({ brief, generatedCopy, mediaAssets, publishLogs, accounts, targetAccounts });
});

socialHubRouter.put('/v1/social-hub/briefs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const briefId = Number(c.req.param('id'));
  if (isNaN(briefId)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const allowed = ['sourceTitle', 'sourceSnapshot', 'suggestionPrompt', 'outputFormat', 'targetPlatforms', 'targetAccountIds', 'status', 'viralEngineEnabled', 'viralEngineMode'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = (body as any)[key];
  }
  if (Object.keys(updates).length === 0) return c.json({ error: 'No valid fields to update' }, 400);
  updates.updatedAt = new Date();

  const [updated] = await db.update(shContentBriefs)
    .set(updates as any)
    .where(and(eq(shContentBriefs.id, briefId), shBriefScope(siteId)!))
    .returning();
  if (!updated) return c.json({ error: 'Brief not found' }, 404);
  return c.json({ brief: updated });
});

socialHubRouter.delete('/v1/social-hub/briefs/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const briefId = Number(c.req.param('id'));
  if (isNaN(briefId)) return c.json({ error: 'Invalid id' }, 400);

  const [deleted] = await db.delete(shContentBriefs)
    .where(and(eq(shContentBriefs.id, briefId), shBriefScope(siteId)!))
    .returning({ id: shContentBriefs.id });
  if (!deleted) return c.json({ error: 'Brief not found' }, 404);
  return c.json({ ok: true });
});

// ─── GET /v1/social-hub/analytics ─────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/analytics', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const days = Math.max(1, toInt(c.req.query('days'), 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Summary aggregates: join shPublishLog with shPostMetrics
  const [summaryRows, byPlatformRows, topPostRows, recentBriefs, briefStatusRows] = await Promise.all([
    // Summary
    db
      .select({
        totalPosts: sql<number>`count(distinct ${shPublishLog.id})::int`,
        totalImpressions: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        avgEngagementRate: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${shPostMetrics.comments}), 0)::int`,
        totalShares: sql<number>`coalesce(sum(${shPostMetrics.shares}), 0)::int`,
      })
      .from(shPublishLog)
      .leftJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id))
      .where(
        and(
          shPublishScope(siteId)!,
          eq(shPublishLog.status, 'published'),
          gte(shPublishLog.publishedAt, since),
        ),
      ),

    // By platform
    db
      .select({
        platform: shPublishLog.platform,
        postsCount: sql<number>`count(distinct ${shPublishLog.id})::int`,
        totalViews: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        avgEngagement: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)`,
      })
      .from(shPublishLog)
      .leftJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id))
      .where(
        and(
          shPublishScope(siteId)!,
          eq(shPublishLog.status, 'published'),
          gte(shPublishLog.publishedAt, since),
        ),
      )
      .groupBy(shPublishLog.platform),

    // Top posts (publish log + metrics) — top 10 by views
    db
      .select({
        briefId: shPublishLog.briefId,
        platform: shPublishLog.platform,
        externalPostUrl: shPublishLog.externalPostUrl,
        publishedAt: shPublishLog.publishedAt,
        views: sql<number>`coalesce(${shPostMetrics.views}, 0)::int`,
        likes: sql<number>`coalesce(${shPostMetrics.likes}, 0)::int`,
        engagementRate: sql<number>`coalesce(${shPostMetrics.engagementRate}, 0)`,
      })
      .from(shPublishLog)
      .leftJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id))
      .where(and(shPublishScope(siteId)!, eq(shPublishLog.status, 'published')))
      .orderBy(desc(sql`coalesce(${shPostMetrics.views}, 0)`))
      .limit(10),

    // Recent activity — last 20 briefs
    db
      .select({
        briefId: shContentBriefs.id,
        sourceType: shContentBriefs.sourceType,
        sourceTitle: shContentBriefs.sourceTitle,
        status: shContentBriefs.status,
        createdAt: shContentBriefs.createdAt,
      })
      .from(shContentBriefs)
      .where(shBriefScope(siteId)!)
      .orderBy(desc(shContentBriefs.createdAt))
      .limit(20),

    // Brief status counts
    db
      .select({
        status: shContentBriefs.status,
        count: sql<number>`count(*)::int`,
      })
      .from(shContentBriefs)
      .where(shBriefScope(siteId)!)
      .groupBy(shContentBriefs.status),
  ]);

  // Enrich topPosts with hookLine from shGeneratedCopy
  const topPostBriefIds = topPostRows.map((r: any) => r.briefId).filter(Boolean);
  let copyByBriefId: Record<number, string> = {};
  if (topPostBriefIds.length > 0) {
    const copyRows = await db
      .select({ briefId: shGeneratedCopy.briefId, hookLine: shGeneratedCopy.hookLine })
      .from(shGeneratedCopy)
      .where(
        and(
          inArray(shGeneratedCopy.briefId, topPostBriefIds),
          eq(shGeneratedCopy.status, 'approved'),
        ),
      );
    for (const row of copyRows as any[]) {
      if (!copyByBriefId[row.briefId]) copyByBriefId[row.briefId] = row.hookLine;
    }
  }

  const topPosts = topPostRows.map((r: any) => ({
    briefId: r.briefId,
    platform: r.platform,
    hookLine: copyByBriefId[r.briefId] ?? '',
    externalPostUrl: r.externalPostUrl ?? '',
    views: r.views,
    likes: r.likes,
    engagementRate: r.engagementRate,
    publishedAt: r.publishedAt ? (r.publishedAt as Date).toISOString() : '',
  }));

  const statusKeys = ['draft', 'generating', 'copy_review', 'rendering', 'render_review', 'published', 'done'] as const;
  const briefsStatusSummary: Record<string, number> = Object.fromEntries(statusKeys.map((k) => [k, 0]));
  for (const row of briefStatusRows as any[]) {
    if (row.status in briefsStatusSummary) briefsStatusSummary[row.status] = row.count;
  }

  const summary = summaryRows[0] ?? {
    totalPosts: 0,
    totalImpressions: 0,
    avgEngagementRate: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
  };

  const recentActivity = (recentBriefs as any[]).map((r) => ({
    briefId: r.briefId,
    sourceType: r.sourceType,
    sourceTitle: r.sourceTitle ?? '',
    status: r.status,
    createdAt: (r.createdAt as Date).toISOString(),
  }));

  return c.json({
    summary: {
      totalPosts: summary.totalPosts,
      totalImpressions: summary.totalImpressions,
      avgEngagementRate: summary.avgEngagementRate,
      totalLikes: summary.totalLikes,
      totalComments: summary.totalComments,
      totalShares: summary.totalShares,
    },
    byPlatform: (byPlatformRows as any[]).map((r) => ({
      platform: r.platform,
      postsCount: r.postsCount,
      totalViews: r.totalViews,
      totalLikes: r.totalLikes,
      avgEngagement: r.avgEngagement,
    })),
    topPosts,
    recentActivity,
    briefsStatusSummary,
  });
});

// ─── GET /v1/social-hub/sources ───────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/sources', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const typeFilter = c.req.query('type');

  // Currently sources = content briefs (type='brief'). Extend here as more source types are added.
  const conditions: any[] = [shBriefScope(siteId)!];
  // typeFilter support: if a non-'brief' type is requested, return empty (future-proofing).
  if (typeFilter && typeFilter !== 'brief') {
    return c.json({ sources: [] });
  }

  const briefs = await db
    .select({
      id: shContentBriefs.id,
      sourceTitle: shContentBriefs.sourceTitle,
      status: shContentBriefs.status,
      createdAt: shContentBriefs.createdAt,
    })
    .from(shContentBriefs)
    .where(and(...conditions))
    .orderBy(desc(shContentBriefs.createdAt))
    .limit(50);

  const sources = (briefs as any[]).map((b) => ({
    id: b.id,
    type: 'brief',
    title: b.sourceTitle ?? `Brief #${b.id}`,
    status: b.status,
    createdAt: (b.createdAt as Date).toISOString(),
  }));

  return c.json({ sources });
});

// ─── GET /v1/social-hub/queue ──────────────────────────────────────────────────

socialHubRouter.get('/v1/social-hub/queue', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const entries = await db
    .select({
      id: shQueue.id,
      briefId: shQueue.briefId,
      priority: shQueue.priority,
      status: shQueue.status,
      processedAt: shQueue.processedAt,
      errorMessage: shQueue.errorMessage,
      createdAt: shQueue.createdAt,
      briefSourceTitle: shContentBriefs.sourceTitle,
      briefStatus: shContentBriefs.status,
    })
    .from(shQueue)
    .leftJoin(shContentBriefs, eq(shContentBriefs.id, shQueue.briefId))
    .where(or(eq(shQueue.siteId, siteId), isNull(shQueue.siteId))!)
    .orderBy(desc(shQueue.priority), asc(shQueue.createdAt));

  const queue = (entries as any[]).map((e) => ({
    id: e.id,
    briefId: e.briefId,
    priority: e.priority,
    status: e.status,
    processedAt: e.processedAt ? (e.processedAt as Date).toISOString() : null,
    errorMessage: e.errorMessage ?? null,
    createdAt: (e.createdAt as Date).toISOString(),
    brief: {
      sourceTitle: e.briefSourceTitle ?? `Brief #${e.briefId}`,
      status: e.briefStatus ?? '',
    },
  }));

  return c.json({ queue });
});

// ─── POST /v1/social-hub/queue ─────────────────────────────────────────────────

socialHubRouter.post('/v1/social-hub/queue', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const briefId = Number(body.briefId ?? 0);
  if (!briefId) return c.json({ error: 'briefId is required' }, 400);

  // Verify brief belongs to this site
  const [brief] = await db
    .select({ id: shContentBriefs.id })
    .from(shContentBriefs)
    .where(and(eq(shContentBriefs.id, briefId), shBriefScope(siteId)!))
    .limit(1);
  if (!brief) return c.json({ error: 'Brief not found' }, 404);

  const priority = body.priority !== undefined ? Number(body.priority) : 50;

  const [entry] = await db
    .insert(shQueue)
    .values({ siteId, briefId, priority: isNaN(priority) ? 50 : priority })
    .returning();

  return c.json({ entry }, 201);
});

// ─── PUT /v1/social-hub/queue ──────────────────────────────────────────────────

socialHubRouter.put('/v1/social-hub/queue', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const id = Number(body.id ?? 0);
  if (!id) return c.json({ error: 'id is required' }, 400);

  const updates: Record<string, unknown> = {};
  if (body.priority !== undefined) updates.priority = Number(body.priority);
  if (body.status !== undefined) updates.status = String(body.status);
  if (!Object.keys(updates).length) return c.json({ error: 'No updatable fields provided' }, 400);

  const [entry] = await db
    .update(shQueue)
    .set(updates)
    .where(and(eq(shQueue.id, id), or(eq(shQueue.siteId, siteId), isNull(shQueue.siteId))!))
    .returning();
  if (!entry) return c.json({ error: 'Queue entry not found' }, 404);

  return c.json({ entry });
});

// ─── DELETE /v1/social-hub/queue ──────────────────────────────────────────────

socialHubRouter.delete('/v1/social-hub/queue', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = toInt(c.req.query('id'), 0);
  if (!id) return c.json({ error: 'id query param is required' }, 400);

  const deleted = await db
    .delete(shQueue)
    .where(and(eq(shQueue.id, id), or(eq(shQueue.siteId, siteId), isNull(shQueue.siteId))!))
    .returning({ id: shQueue.id });
  if (!deleted.length) return c.json({ error: 'Queue entry not found' }, 404);

  return c.json({ ok: true });
});

// ─── POST /v1/social-hub/seed-templates ───────────────────────────────────────

const DEFAULT_TEMPLATES = [
  {
    name: 'Quote Card',
    slug: 'quote-card',
    category: 'quote',
    aspectRatio: '1:1',
    jsxTemplate:
      '<div style="display:flex;alignItems:center;justifyContent:center;background:#1e293b;width:1080px;height:1080px;padding:80px"><p style="fontFamily:sans-serif;fontSize:48px;color:#fff;textAlign:center">{quote}</p></div>',
  },
  {
    name: 'Tip Card',
    slug: 'tip-card',
    category: 'tip',
    aspectRatio: '1:1',
    jsxTemplate:
      '<div style="display:flex;flexDirection:column;background:#1e293b;width:1080px;height:1080px;padding:80px"><h2 style="fontFamily:sans-serif;fontSize:36px;color:#4a8d83">{title}</h2><p style="fontFamily:sans-serif;fontSize:28px;color:#e2e8f0">{body}</p></div>',
  },
  {
    name: 'Announcement',
    slug: 'announcement',
    category: 'announcement',
    aspectRatio: '16:9',
    jsxTemplate:
      '<div style="display:flex;alignItems:center;justifyContent:center;background:#1e293b;width:1920px;height:1080px"><h1 style="fontFamily:sans-serif;fontSize:72px;color:#fff">{title}</h1></div>',
  },
] as const;

socialHubRouter.post('/v1/social-hub/seed-templates', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  // Find which slugs already exist for this site
  const slugs = DEFAULT_TEMPLATES.map((t) => t.slug);
  const existing = await db
    .select({ slug: shTemplates.slug })
    .from(shTemplates)
    .where(and(eq(shTemplates.siteId, siteId), inArray(shTemplates.slug, slugs)));

  const existingSlugs = new Set((existing as any[]).map((r) => r.slug));
  const toInsert = DEFAULT_TEMPLATES.filter((t) => !existingSlugs.has(t.slug));

  if (toInsert.length > 0) {
    await db.insert(shTemplates).values(
      toInsert.map((t) => ({ ...t, siteId })),
    );
  }

  return c.json({ seeded: toInsert.length });
});
