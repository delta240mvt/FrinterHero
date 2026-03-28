import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { sites } from '../../../../../src/db/schema.ts';
import type { HonoEnv } from '../app.ts';

export const sitesRouter = new Hono<HonoEnv>();

sitesRouter.get('/v1/sites/:siteSlug/public-config', async (c) => {
  const slug = c.req.param('siteSlug');
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const [site] = await db.select({ slug: sites.slug, name: sites.displayName }).from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  return c.json({ slug: site.slug, name: site.name });
});
