import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  shSettings,
  shSocialAccounts,
  shTemplates,
  shContentBriefs,
  shPublishLog,
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
