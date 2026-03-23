import type { RouteContext } from '../helpers.js';
import {
  json, requireActiveSite,
  articleScope, gapScope, kbScope,
  db, and, sql, desc, articles, contentGaps, knowledgeEntries,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/dashboard') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [articleStats, gapStats, kbStats] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int`, published: sql<number>`count(*) filter (where status = 'published')::int`, draft: sql<number>`count(*) filter (where status = 'draft')::int` }).from(articles).where(articleScope(site.id)),
      db.select({ total: sql<number>`count(*)::int`, open: sql<number>`count(*) filter (where status in ('new', 'acknowledged', 'in_progress'))::int` }).from(contentGaps).where(gapScope(site.id)),
      db.select({ total: sql<number>`count(*)::int` }).from(knowledgeEntries).where(kbScope(site.id)),
    ]);
    json(res, 200, { site: { slug: site.slug, displayName: site.displayName }, articles: articleStats[0], contentGaps: gapStats[0], knowledgeBase: kbStats[0] });
    return true;
  }

  return false;
}
