import type { RouteContext } from '../helpers.js';
import {
  json, toPositiveInt, serializeRecentRun, requireActiveSite,
  geoRunScope, articleScope,
  db, and, eq, desc, gte, lte, sql, geoRuns, geoQueries, articles,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/geo/runs') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const rows = await db.select().from(geoRuns).where(geoRunScope(site.id)).orderBy(desc(geoRuns.runAt)).limit(limit);
    json(res, 200, { runs: rows.map((run) => serializeRecentRun(run)) });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'geo' && segments[3] === 'runs' && segments[4]) {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const runId = Number(segments[4]);
    if (!runId) return json(res, 400, { error: 'Invalid run id' }), true;
    const [run] = await db.select().from(geoRuns).where(and(geoRunScope(site.id), eq(geoRuns.id, runId))).limit(1);
    if (!run) return json(res, 404, { error: 'Run not found' }), true;
    const runStart = new Date(run.runAt.getTime() - 5 * 60 * 1000);
    const runEnd = new Date(run.runAt.getTime() + 60 * 60 * 1000);
    const [queries, drafts] = await Promise.all([
      db.select().from(geoQueries).where(and(gte(geoQueries.createdAt, runStart), lte(geoQueries.createdAt, runEnd))),
      db.select().from(articles).where(and(articleScope(site.id), eq(articles.status, 'draft'), gte(articles.createdAt, runStart), lte(articles.createdAt, runEnd))),
    ]);
    json(res, 200, { run, queries, drafts });
    return true;
  }

  return false;
}
