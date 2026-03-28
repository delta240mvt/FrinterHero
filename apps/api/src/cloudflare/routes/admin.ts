import { Hono } from 'hono';
import { count, eq } from 'drizzle-orm';
import { articles, contentGaps, knowledgeEntries } from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const adminRouter = new Hono<HonoEnv>();

adminRouter.get('/v1/admin/dashboard', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const [[published], [drafts], [gaps], [kb]] = await Promise.all([
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, siteId)).where(eq(articles.status, 'published')),
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, siteId)).where(eq(articles.status, 'draft')),
    db.select({ n: count() }).from(contentGaps).where(eq(contentGaps.siteId, siteId)).where(eq(contentGaps.status, 'new')),
    db.select({ n: count() }).from(knowledgeEntries).where(eq(knowledgeEntries.siteId, siteId)),
  ]);

  return c.json({ publishedArticles: published.n, draftArticles: drafts.n, newContentGaps: gaps.n, knowledgeEntries: kb.n });
});
