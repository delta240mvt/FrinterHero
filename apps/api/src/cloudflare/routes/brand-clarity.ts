import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  bcSettings,
  bcProjects,
  bcTargetChannels,
  bcTargetVideos,
  bcExtractedPainPoints,
  bcLandingPageVariants,
  bcIterations,
  bcIterationSelections,
  bcPainClusters,
  appJobs,
} from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const brandClarityRouter = new Hono<HonoEnv>();

// ─── Inline helpers ───────────────────────────────────────────────────────────

const BC_SETTINGS_DEFAULTS = {
  provider: 'openrouter',
  lpModel: 'claude-sonnet-4-6',
  scraperModel: 'claude-haiku-4-5-20251001',
  clusterModel: 'claude-sonnet-4-6',
  generatorModel: 'claude-sonnet-4-6',
  extendedThinkingEnabled: false,
  lpThinkingBudget: 10000,
  scraperThinkingBudget: 5000,
  clusterThinkingBudget: 16000,
  generatorThinkingBudget: 16000,
  lpMaxTokens: 6144,
  scraperMaxTokens: 4096,
  clusterMaxTokens: 3072,
  generatorMaxTokens: 8192,
};

async function getBcSettings(db: any, siteId: number) {
  const rows = await db
    .select()
    .from(bcSettings)
    .where(or(eq(bcSettings.siteId, siteId), isNull(bcSettings.siteId)))
    .limit(1);
  if (!rows.length) return BC_SETTINGS_DEFAULTS;
  return { ...BC_SETTINGS_DEFAULTS, ...(rows[0].config as object) };
}

async function saveBcSettings(db: any, config: unknown, siteId: number) {
  const rows = await db
    .select({ id: bcSettings.id })
    .from(bcSettings)
    .where(eq(bcSettings.siteId, siteId))
    .limit(1);
  if (rows.length) {
    await db
      .update(bcSettings)
      .set({ config, updatedAt: new Date() })
      .where(eq(bcSettings.id, rows[0].id));
  } else {
    await db.insert(bcSettings).values({ siteId, config });
  }
}

async function enqueueAppJob(db: any, siteId: number, type: string, topic: string, payload: object) {
  const [job] = await db.insert(appJobs).values({ siteId, type, topic, payload }).returning();
  return job;
}

async function resolveBcProjectContext(db: any, siteId: number, projectId: number) {
  if (!projectId) return null;
  const [project] = await db
    .select()
    .from(bcProjects)
    .where(
      and(
        eq(bcProjects.id, projectId),
        or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId)),
      ),
    )
    .limit(1);
  return project ?? null;
}

function bcProjectScope(siteId: number) {
  return or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId));
}

function bcChannelScope(siteId: number) {
  return or(eq(bcTargetChannels.siteId, siteId), isNull(bcTargetChannels.siteId));
}

function bcVideoScope(siteId: number) {
  return or(eq(bcTargetVideos.siteId, siteId), isNull(bcTargetVideos.siteId));
}

// ─── Settings ────────────────────────────────────────────────────────────────

// GET /v1/admin/bc/settings
brandClarityRouter.get('/v1/admin/bc/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const settings = await getBcSettings(db, siteId);
  return c.json(settings);
});

// PUT /v1/admin/bc/settings
brandClarityRouter.put('/v1/admin/bc/settings', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const config = {
    provider: (body.provider === 'anthropic' ? 'anthropic' : 'openrouter') as 'anthropic' | 'openrouter',
    lpModel: String(body.lpModel || BC_SETTINGS_DEFAULTS.lpModel),
    scraperModel: String(body.scraperModel || BC_SETTINGS_DEFAULTS.scraperModel),
    clusterModel: String(body.clusterModel || BC_SETTINGS_DEFAULTS.clusterModel),
    generatorModel: String(body.generatorModel || BC_SETTINGS_DEFAULTS.generatorModel),
    extendedThinkingEnabled: Boolean(body.extendedThinkingEnabled),
    lpThinkingBudget: Math.max(1024, Number(body.lpThinkingBudget || BC_SETTINGS_DEFAULTS.lpThinkingBudget)),
    scraperThinkingBudget: Math.max(1024, Number(body.scraperThinkingBudget || BC_SETTINGS_DEFAULTS.scraperThinkingBudget)),
    clusterThinkingBudget: Math.max(1024, Number(body.clusterThinkingBudget || BC_SETTINGS_DEFAULTS.clusterThinkingBudget)),
    generatorThinkingBudget: Math.max(1024, Number(body.generatorThinkingBudget || BC_SETTINGS_DEFAULTS.generatorThinkingBudget)),
    lpMaxTokens: Math.max(512, Number(body.lpMaxTokens || BC_SETTINGS_DEFAULTS.lpMaxTokens)),
    scraperMaxTokens: Math.max(512, Number(body.scraperMaxTokens || BC_SETTINGS_DEFAULTS.scraperMaxTokens)),
    clusterMaxTokens: Math.max(512, Number(body.clusterMaxTokens || BC_SETTINGS_DEFAULTS.clusterMaxTokens)),
    generatorMaxTokens: Math.max(512, Number(body.generatorMaxTokens || BC_SETTINGS_DEFAULTS.generatorMaxTokens)),
  };
  await saveBcSettings(db, config, siteId);
  return c.json({ ok: true, config });
});

// ─── Projects ────────────────────────────────────────────────────────────────

// GET /v1/admin/bc/projects
brandClarityRouter.get('/v1/admin/bc/projects', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projects = await db
    .select()
    .from(bcProjects)
    .where(bcProjectScope(siteId)!)
    .orderBy(desc(bcProjects.createdAt));
  return c.json(projects);
});

// POST /v1/admin/bc/projects
brandClarityRouter.post('/v1/admin/bc/projects', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const founderDescription = typeof body.founderDescription === 'string' ? body.founderDescription.trim() : '';
  const lpRawInput = typeof body.lpRawInput === 'string' ? body.lpRawInput.trim() : '';
  if (!name || !founderDescription || !lpRawInput) {
    return c.json({ error: 'name, founderDescription, lpRawInput required' }, 400);
  }

  const [project] = await db
    .insert(bcProjects)
    .values({
      siteId,
      name: name.substring(0, 255),
      founderDescription,
      founderVision: typeof body.founderVision === 'string' ? body.founderVision : null,
      lpRawInput,
      projectDocumentation: typeof body.projectDocumentation === 'string' ? body.projectDocumentation.trim() : null,
      status: 'parsing',
    })
    .returning();

  const job = await enqueueAppJob(db, siteId, 'bc-parse', 'bc-parse', {
    siteId,
    projectId: project.id,
  });
  return c.json({ project: { ...project, status: 'parsing' }, parsingStarted: true, jobId: job.id }, 201);
});

// GET /v1/admin/bc/projects/:id
brandClarityRouter.get('/v1/admin/bc/projects/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const [project] = await db
    .select()
    .from(bcProjects)
    .where(and(eq(bcProjects.id, id), bcProjectScope(siteId)!))
    .limit(1);
  if (!project) return c.json({ error: 'Not found' }, 404);
  return c.json(project);
});

// PUT /v1/admin/bc/projects/:id
brandClarityRouter.put('/v1/admin/bc/projects/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = String(body.name).trim().substring(0, 255);
  if (body.founderDescription !== undefined) updates.founderDescription = body.founderDescription;
  if (body.founderVision !== undefined) updates.founderVision = body.founderVision;
  if (body.lpRawInput !== undefined) updates.lpRawInput = body.lpRawInput;
  if (body.status !== undefined) updates.status = body.status;
  if (body.nicheKeywords !== undefined) {
    updates.nicheKeywords = Array.isArray(body.nicheKeywords)
      ? (body.nicheKeywords as unknown[]).map((item) => String(item).trim()).filter(Boolean)
      : [];
  }

  const [updated] = await db
    .update(bcProjects)
    .set(updates)
    .where(and(eq(bcProjects.id, id), bcProjectScope(siteId)!))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// DELETE /v1/admin/bc/projects/:id
brandClarityRouter.delete('/v1/admin/bc/projects/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  await db
    .delete(bcProjects)
    .where(and(eq(bcProjects.id, id), bcProjectScope(siteId)!));
  return c.json({ deleted: true });
});

// ─── Documentation ───────────────────────────────────────────────────────────

// PUT /v1/admin/bc/projects/:id/documentation
brandClarityRouter.put('/v1/admin/bc/projects/:id/documentation', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, id);
  if (!project) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const projectDocumentation = typeof body.projectDocumentation === 'string' ? body.projectDocumentation.trim() : '';
  if (!projectDocumentation) return c.json({ error: 'projectDocumentation required' }, 400);

  const [updated] = await db
    .update(bcProjects)
    .set({ projectDocumentation, status: 'parsing', updatedAt: new Date() })
    .where(and(eq(bcProjects.id, id), bcProjectScope(siteId)!))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);

  const [existingJob] = await db
    .select({ id: appJobs.id })
    .from(appJobs)
    .where(
      and(
        eq(appJobs.siteId, siteId),
        eq(appJobs.topic, 'bc-parse'),
        inArray(appJobs.status, ['pending', 'running']),
        sql`${appJobs.payload}->>'projectId' = ${String(id)}`,
      ),
    )
    .limit(1);

  const jobId = existingJob?.id ?? (
    await enqueueAppJob(db, siteId, 'bc-parse', 'bc-parse', { siteId, projectId: id })
  ).id;

  return c.json({ updated: true, parsingStarted: true, jobId });
});

// ─── Channels ────────────────────────────────────────────────────────────────

// GET /v1/admin/bc/projects/:id/channels
brandClarityRouter.get('/v1/admin/bc/projects/:id/channels', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  if (!projectId) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const channels = await db
    .select()
    .from(bcTargetChannels)
    .where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(siteId)!))
    .orderBy(asc(bcTargetChannels.sortOrder));
  return c.json(channels);
});

// POST /v1/admin/bc/projects/:id/channels
brandClarityRouter.post('/v1/admin/bc/projects/:id/channels', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  if (!projectId) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
  const channelName = typeof body.channelName === 'string' ? body.channelName.trim() : '';
  const channelUrl = typeof body.channelUrl === 'string' ? body.channelUrl.trim() : '';
  if (!channelId || !channelName || !channelUrl) {
    return c.json({ error: 'channelId, channelName, channelUrl required' }, 400);
  }

  const existing = await db
    .select({ sortOrder: bcTargetChannels.sortOrder })
    .from(bcTargetChannels)
    .where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(siteId)!));
  const nextOrder = existing.length ? Math.max(...existing.map((row: any) => row.sortOrder)) + 1 : 0;

  const [channel] = await db
    .insert(bcTargetChannels)
    .values({
      siteId,
      projectId,
      channelId,
      channelName: channelName.substring(0, 255),
      channelUrl,
      channelHandle: typeof body.channelHandle === 'string' ? body.channelHandle.trim() : null,
      subscriberCount: body.subscriberCount ? Number(body.subscriberCount) : null,
      description: typeof body.description === 'string' ? body.description.trim() : null,
      discoveryMethod: 'manual',
      isConfirmed: true,
      sortOrder: nextOrder,
    })
    .returning();
  return c.json(channel, 201);
});

// PUT /v1/admin/bc/projects/:id/channels/:channelId
brandClarityRouter.put('/v1/admin/bc/projects/:id/channels/:channelId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  const channelRowId = Number(c.req.param('channelId'));
  if (!projectId || !channelRowId) return c.json({ error: 'Invalid params' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const updates: Record<string, unknown> = {};
  if (body.isConfirmed !== undefined) updates.isConfirmed = Boolean(body.isConfirmed);
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
  if (body.channelName !== undefined) updates.channelName = String(body.channelName).substring(0, 255);

  const [updated] = await db
    .update(bcTargetChannels)
    .set(updates)
    .where(
      and(
        eq(bcTargetChannels.id, channelRowId),
        eq(bcTargetChannels.projectId, projectId),
        bcChannelScope(siteId)!,
      ),
    )
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// DELETE /v1/admin/bc/projects/:id/channels/:channelId
brandClarityRouter.delete('/v1/admin/bc/projects/:id/channels/:channelId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  const channelRowId = Number(c.req.param('channelId'));
  if (!projectId || !channelRowId) return c.json({ error: 'Invalid params' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  await db
    .delete(bcTargetChannels)
    .where(
      and(
        eq(bcTargetChannels.id, channelRowId),
        eq(bcTargetChannels.projectId, projectId),
        bcChannelScope(siteId)!,
      ),
    );
  return c.json({ deleted: true });
});

// POST /v1/admin/bc/projects/:id/channels/confirm-all
// NOTE: must be registered BEFORE /:channelId routes to avoid param capture
brandClarityRouter.post('/v1/admin/bc/projects/:id/channels/confirm-all', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  if (!projectId) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  await db
    .update(bcTargetChannels)
    .set({ isConfirmed: true })
    .where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(siteId)!));

  await db
    .update(bcProjects)
    .set({ status: 'videos_pending', updatedAt: new Date() })
    .where(and(eq(bcProjects.id, projectId), bcProjectScope(siteId)!));

  const confirmed = await db
    .select({ id: bcTargetChannels.id })
    .from(bcTargetChannels)
    .where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(siteId)!));

  return c.json({ confirmed: confirmed.length });
});

// ─── Videos ──────────────────────────────────────────────────────────────────

// GET /v1/admin/bc/projects/:id/videos
brandClarityRouter.get('/v1/admin/bc/projects/:id/videos', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  if (!projectId) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const videos = await db
    .select({
      id: bcTargetVideos.id,
      videoId: bcTargetVideos.videoId,
      videoUrl: bcTargetVideos.videoUrl,
      title: bcTargetVideos.title,
      description: bcTargetVideos.description,
      viewCount: bcTargetVideos.viewCount,
      commentCount: bcTargetVideos.commentCount,
      relevanceScore: bcTargetVideos.relevanceScore,
      publishedAt: bcTargetVideos.publishedAt,
      channelName: bcTargetChannels.channelName,
      channelUrl: bcTargetChannels.channelUrl,
      isSelected: bcTargetVideos.isSelected,
    })
    .from(bcTargetVideos)
    .innerJoin(bcTargetChannels, eq(bcTargetVideos.channelId, bcTargetChannels.id))
    .where(
      and(
        eq(bcTargetVideos.projectId, projectId),
        bcVideoScope(siteId)!,
        bcChannelScope(siteId)!,
      ),
    );
  return c.json(videos);
});

// PUT /v1/admin/bc/projects/:id/videos/:videoId
brandClarityRouter.put('/v1/admin/bc/projects/:id/videos/:videoId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  const videoRowId = Number(c.req.param('videoId'));
  if (!projectId || !videoRowId) return c.json({ error: 'Invalid params' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  if (body.isSelected === undefined) return c.json({ error: 'isSelected required' }, 400);

  const [updated] = await db
    .update(bcTargetVideos)
    .set({ isSelected: Boolean(body.isSelected) })
    .where(
      and(
        eq(bcTargetVideos.id, videoRowId),
        eq(bcTargetVideos.projectId, projectId),
        bcVideoScope(siteId)!,
      ),
    )
    .returning({ id: bcTargetVideos.id, isSelected: bcTargetVideos.isSelected });
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// POST /v1/admin/bc/projects/:id/videos/add-manual
// NOTE: must be registered BEFORE /:videoId to avoid param capture
brandClarityRouter.post('/v1/admin/bc/projects/:id/videos/add-manual', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const projectId = Number(c.req.param('id'));
  if (!projectId) return c.json({ error: 'Invalid id' }, 400);

  const project = await resolveBcProjectContext(db, siteId, projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const urlValue = typeof body.url === 'string' ? body.url.trim() : '';
  if (!urlValue) return c.json({ error: 'URL required' }, 400);

  let videoId: string | null = null;
  try {
    const parsed = new URL(urlValue);
    if (parsed.hostname === 'youtu.be') videoId = parsed.pathname.slice(1).split('?')[0] || null;
    if (!videoId) videoId = parsed.searchParams.get('v');
    if (!videoId) {
      const shorts = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shorts) videoId = shorts[1];
    }
    if (!videoId) {
      const embed = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
      if (embed) videoId = embed[1];
    }
  } catch {}
  if (!videoId) return c.json({ error: 'Could not parse YouTube video ID from URL' }, 400);

  const ytApiKey = c.env?.YOUTUBE_API_KEY ?? '';
  if (!ytApiKey) return c.json({ error: 'YOUTUBE_API_KEY not configured' }, 500);

  const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  ytUrl.searchParams.set('part', 'snippet,statistics');
  ytUrl.searchParams.set('id', videoId);
  ytUrl.searchParams.set('key', ytApiKey);

  const ytRes = await fetch(ytUrl.toString());
  if (!ytRes.ok) {
    const err = await ytRes.json().catch((): Record<string, unknown> => ({})) as any;
    return c.json({ error: err?.error?.message ?? `YouTube API ${ytRes.status}` }, 502);
  }
  const ytData = await ytRes.json() as any;
  const item = ytData?.items?.[0];
  if (!item) return c.json({ error: 'Video not found on YouTube' }, 404);

  const snippet = item.snippet;
  const stats = item.statistics;
  const ytChannelId = snippet.channelId;
  const ytChannelTitle = snippet.channelTitle;

  const [existingVideo] = await db
    .select({ id: bcTargetVideos.id })
    .from(bcTargetVideos)
    .where(
      and(
        eq(bcTargetVideos.projectId, projectId),
        eq(bcTargetVideos.videoId, videoId),
        bcVideoScope(siteId)!,
      ),
    );
  if (existingVideo) return c.json({ error: 'Video already added to this project' }, 409);

  let [channel] = await db
    .select()
    .from(bcTargetChannels)
    .where(
      and(
        eq(bcTargetChannels.projectId, projectId),
        eq(bcTargetChannels.channelId, ytChannelId),
        bcChannelScope(siteId)!,
      ),
    );
  if (!channel) {
    [channel] = await db
      .insert(bcTargetChannels)
      .values({
        siteId,
        projectId,
        channelId: ytChannelId,
        channelName: ytChannelTitle,
        channelUrl: `https://www.youtube.com/channel/${ytChannelId}`,
        isConfirmed: true,
      })
      .returning();
  }

  const [inserted] = await db
    .insert(bcTargetVideos)
    .values({
      siteId,
      projectId,
      channelId: channel.id,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: (snippet.title || videoId).substring(0, 500),
      description: snippet.description ? String(snippet.description).substring(0, 500) : null,
      viewCount: parseInt(stats?.viewCount || '0', 10) || null,
      commentCount: parseInt(stats?.commentCount || '0', 10) || null,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
      relevanceScore: 0.5,
      isSelected: true,
    })
    .returning({ id: bcTargetVideos.id, videoId: bcTargetVideos.videoId, title: bcTargetVideos.title });

  return c.json({
    id: inserted.id,
    videoId: inserted.videoId,
    title: inserted.title,
    channelName: ytChannelTitle,
    channelId: channel.id,
    viewCount: parseInt(stats?.viewCount || '0', 10) || 0,
    commentCount: parseInt(stats?.commentCount || '0', 10) || 0,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
  });
});

// ─── Pain Points ──────────────────────────────────────────────────────────────

brandClarityRouter.get('/v1/admin/bc/projects/:id/pain-points', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const statusFilter = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

  const scope = or(eq(bcExtractedPainPoints.siteId, siteId), isNull(bcExtractedPainPoints.siteId))!;
  const conditions: any[] = [eq(bcExtractedPainPoints.projectId, projectId), scope];
  if (statusFilter) conditions.push(eq(bcExtractedPainPoints.status, statusFilter));
  const whereClause = and(...conditions);

  const [painPoints, totals] = await Promise.all([
    db.select().from(bcExtractedPainPoints).where(whereClause)
      .orderBy(desc(bcExtractedPainPoints.emotionalIntensity), desc(bcExtractedPainPoints.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(bcExtractedPainPoints).where(whereClause),
  ]);

  return c.json({ painPoints, total: totals[0]?.total ?? 0, limit, offset });
});

brandClarityRouter.put('/v1/admin/bc/projects/:id/pain-points/:ppId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  const ppId = Number(c.req.param('ppId'));
  if (isNaN(projectId) || isNaN(ppId)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const allowed = ['status', 'emotionalIntensity', 'category', 'customerLanguage', 'desiredOutcome', 'painPointTitle', 'painPointDescription', 'vocabularyQuotes'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) updates[key] = (body as any)[key];
  if (!Object.keys(updates).length) return c.json({ error: 'No valid fields to update' }, 400);

  const [updated] = await db.update(bcExtractedPainPoints)
    .set(updates as any)
    .where(and(eq(bcExtractedPainPoints.id, ppId), eq(bcExtractedPainPoints.projectId, projectId)))
    .returning({ id: bcExtractedPainPoints.id, status: bcExtractedPainPoints.status });
  if (!updated) return c.json({ error: 'Pain point not found' }, 404);
  return c.json({ ok: true, painPoint: updated });
});

brandClarityRouter.delete('/v1/admin/bc/projects/:id/pain-points/:ppId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const ppId = Number(c.req.param('ppId'));
  if (isNaN(ppId)) return c.json({ error: 'Invalid id' }, 400);

  const [deleted] = await db.delete(bcExtractedPainPoints)
    .where(eq(bcExtractedPainPoints.id, ppId))
    .returning({ id: bcExtractedPainPoints.id });
  if (!deleted) return c.json({ error: 'Pain point not found' }, 404);
  return c.json({ ok: true });
});

// ─── LP Variants ──────────────────────────────────────────────────────────────

brandClarityRouter.get('/v1/admin/bc/projects/:id/variants', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const iterationId = c.req.query('iterationId') ? Number(c.req.query('iterationId')) : null;
  const conditions: any[] = [eq(bcLandingPageVariants.projectId, projectId)];
  if (iterationId && !isNaN(iterationId)) conditions.push(eq(bcLandingPageVariants.iterationId, iterationId));

  const variants = await db.select().from(bcLandingPageVariants)
    .where(and(...conditions))
    .orderBy(desc(bcLandingPageVariants.createdAt));
  return c.json({ variants });
});

brandClarityRouter.get('/v1/admin/bc/projects/:id/variants/:variantId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const variantId = Number(c.req.param('variantId'));
  if (isNaN(variantId)) return c.json({ error: 'Invalid id' }, 400);

  const [variant] = await db.select().from(bcLandingPageVariants)
    .where(eq(bcLandingPageVariants.id, variantId));
  if (!variant) return c.json({ error: 'Variant not found' }, 404);
  return c.json(variant);
});

brandClarityRouter.put('/v1/admin/bc/projects/:id/variants/:variantId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const variantId = Number(c.req.param('variantId'));
  if (isNaN(variantId)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const allowed = ['isSelected', 'variantLabel', 'htmlContent', 'improvementSuggestions'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) updates[key] = (body as any)[key];
  if (!Object.keys(updates).length) return c.json({ error: 'No valid fields to update' }, 400);

  const [updated] = await db.update(bcLandingPageVariants)
    .set(updates as any)
    .where(eq(bcLandingPageVariants.id, variantId))
    .returning({ id: bcLandingPageVariants.id, isSelected: bcLandingPageVariants.isSelected });
  if (!updated) return c.json({ error: 'Variant not found' }, 404);
  return c.json({ ok: true, variant: updated });
});

// ─── Iterations ───────────────────────────────────────────────────────────────

brandClarityRouter.get('/v1/admin/bc/projects/:id/iterations', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const iterations = await db.select().from(bcIterations)
    .where(eq(bcIterations.projectId, projectId))
    .orderBy(desc(bcIterations.createdAt));
  return c.json({ iterations });
});

brandClarityRouter.post('/v1/admin/bc/projects/:id/iterations', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const body = await c.req.json<{ name: string; intention?: string }>().catch(() => ({ name: '' }));
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);

  const [iteration] = await db.insert(bcIterations).values({
    siteId,
    projectId,
    name: body.name.trim(),
    intention: body.intention ?? null,
  }).returning();
  return c.json({ iteration }, 201);
});

brandClarityRouter.get('/v1/admin/bc/projects/:id/iterations/:itId/detail', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  const itId = Number(c.req.param('itId'));
  if (isNaN(projectId) || isNaN(itId)) return c.json({ error: 'Invalid id' }, 400);

  const bcScope = or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId))!;
  const [[project], [iteration], selections, clusters, [approvedRow]] = await Promise.all([
    db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcScope)).limit(1),
    db.select().from(bcIterations).where(eq(bcIterations.id, itId)).limit(1),
    db.select({
      rank: bcIterationSelections.rank,
      selectionReason: bcIterationSelections.selectionReason,
      pp: {
        painPointTitle: bcExtractedPainPoints.painPointTitle,
        emotionalIntensity: bcExtractedPainPoints.emotionalIntensity,
        category: bcExtractedPainPoints.category,
        customerLanguage: bcExtractedPainPoints.customerLanguage,
      },
    })
      .from(bcIterationSelections)
      .innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id))
      .where(eq(bcIterationSelections.iterationId, itId))
      .orderBy(asc(bcIterationSelections.rank)),
    db.select().from(bcPainClusters)
      .where(and(eq(bcPainClusters.projectId, projectId), eq(bcPainClusters.iterationId, itId)))
      .orderBy(desc(bcPainClusters.aggregateIntensity)),
    db.select({ total: sql<number>`count(*)::int` })
      .from(bcExtractedPainPoints)
      .where(and(eq(bcExtractedPainPoints.projectId, projectId), eq(bcExtractedPainPoints.status, 'approved'))),
  ]);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (!iteration) return c.json({ error: 'Iteration not found' }, 404);
  return c.json({ project, iteration, selections, clusters, approvedCount: approvedRow?.total ?? 0 });
});

brandClarityRouter.put('/v1/admin/bc/projects/:id/iterations/:itId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const itId = Number(c.req.param('itId'));
  if (isNaN(itId)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const allowed = ['name', 'intention', 'status'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) updates[key] = (body as any)[key];
  if (!Object.keys(updates).length) return c.json({ error: 'No valid fields to update' }, 400);

  const [updated] = await db.update(bcIterations).set(updates as any)
    .where(eq(bcIterations.id, itId))
    .returning();
  if (!updated) return c.json({ error: 'Iteration not found' }, 404);
  return c.json({ iteration: updated });
});

brandClarityRouter.delete('/v1/admin/bc/projects/:id/iterations/:itId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const itId = Number(c.req.param('itId'));
  if (isNaN(itId)) return c.json({ error: 'Invalid id' }, 400);

  await db.delete(bcIterations).where(eq(bcIterations.id, itId));
  return c.json({ ok: true });
});

// ─── Scrape Data (composite) ──────────────────────────────────────────────────

brandClarityRouter.get('/v1/admin/bc/projects/:id/scrape-data', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const bcScope = or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId))!;
  const [projectRows] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcScope)).limit(1);
  if (!projectRows) return c.json({ error: 'Project not found' }, 404);

  const [painPoints, clusters, selectedVideos, iterations] = await Promise.all([
    db.select().from(bcExtractedPainPoints)
      .where(and(eq(bcExtractedPainPoints.projectId, projectId), or(eq(bcExtractedPainPoints.siteId, siteId), isNull(bcExtractedPainPoints.siteId))!))
      .orderBy(desc(bcExtractedPainPoints.emotionalIntensity), desc(bcExtractedPainPoints.createdAt)),
    db.select().from(bcPainClusters)
      .where(and(eq(bcPainClusters.projectId, projectId), or(eq(bcPainClusters.siteId, siteId), isNull(bcPainClusters.siteId))!))
      .orderBy(desc(bcPainClusters.aggregateIntensity)),
    db.select().from(bcTargetVideos)
      .where(and(eq(bcTargetVideos.projectId, projectId), or(eq(bcTargetVideos.siteId, siteId), isNull(bcTargetVideos.siteId))!))
      .orderBy(asc(bcTargetVideos.createdAt)),
    db.select().from(bcIterations)
      .where(eq(bcIterations.projectId, projectId))
      .orderBy(desc(bcIterations.createdAt)),
  ]);

  return c.json({ project: projectRows, painPoints, clusters, selectedVideos, iterations });
});

// ─── Variants List (alias) ────────────────────────────────────────────────────

brandClarityRouter.get('/v1/admin/bc/projects/:id/variants-list', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const projectId = Number(c.req.param('id'));
  if (isNaN(projectId)) return c.json({ error: 'Invalid project id' }, 400);

  const iterationId = c.req.query('iterationId') ? Number(c.req.query('iterationId')) : null;
  const conditions: any[] = [eq(bcLandingPageVariants.projectId, projectId)];
  if (iterationId && !isNaN(iterationId)) conditions.push(eq(bcLandingPageVariants.iterationId, iterationId));

  const variants = await db.select().from(bcLandingPageVariants)
    .where(and(...conditions))
    .orderBy(desc(bcLandingPageVariants.createdAt));
  return c.json({ variants });
});
