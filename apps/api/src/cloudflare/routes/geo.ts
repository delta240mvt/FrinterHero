import { Hono } from 'hono';
import { and, desc, eq, gte, lte, or, isNull } from 'drizzle-orm';
import { geoRuns, geoQueries, articles } from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

function geoRunScope(siteId: number) {
  return or(eq(geoRuns.siteId, siteId), isNull(geoRuns.siteId));
}

function articleScope(siteId: number) {
  return or(eq(articles.siteId, siteId), isNull(articles.siteId));
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

export const geoRouter = new Hono<HonoEnv>();

geoRouter.get('/v1/admin/geo/runs', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '') || 20, 1), 100);
  const rows = await db.select().from(geoRuns).where(geoRunScope(siteId)!).orderBy(desc(geoRuns.runAt)).limit(limit);
  return c.json({ runs: rows.map(serializeRecentRun) });
});

geoRouter.get('/v1/admin/geo/runs/:runId', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const runId = Number(c.req.param('runId'));
  if (!runId) return c.json({ error: 'Invalid run id' }, 400);
  const [run] = await db.select().from(geoRuns).where(and(geoRunScope(siteId)!, eq(geoRuns.id, runId))).limit(1);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  const runStart = new Date(run.runAt.getTime() - 5 * 60 * 1000);
  const runEnd = new Date(run.runAt.getTime() + 60 * 60 * 1000);
  const [queries, drafts] = await Promise.all([
    db.select().from(geoQueries).where(and(eq(geoQueries.siteId, siteId), gte(geoQueries.createdAt, runStart), lte(geoQueries.createdAt, runEnd))),
    db.select().from(articles).where(and(articleScope(siteId)!, eq(articles.status, 'draft'), gte(articles.createdAt, runStart), lte(articles.createdAt, runEnd))),
  ]);
  return c.json({ run, queries, drafts });
});
