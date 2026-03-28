import { Hono } from 'hono';
import { and, count, eq } from 'drizzle-orm';
import { articles, contentGaps, knowledgeEntries } from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const adminRouter = new Hono<HonoEnv>();

adminRouter.get('/v1/admin/dashboard', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const [[published], [drafts], [gaps], [kb]] = await Promise.all([
    db.select({ n: count() }).from(articles).where(and(eq(articles.siteId, siteId), eq(articles.status, 'published'))),
    db.select({ n: count() }).from(articles).where(and(eq(articles.siteId, siteId), eq(articles.status, 'draft'))),
    db.select({ n: count() }).from(contentGaps).where(and(eq(contentGaps.siteId, siteId), eq(contentGaps.status, 'new'))),
    db.select({ n: count() }).from(knowledgeEntries).where(eq(knowledgeEntries.siteId, siteId)),
  ]);

  return c.json({ publishedArticles: published.n, draftArticles: drafts.n, newContentGaps: gaps.n, knowledgeEntries: kb.n });
});
