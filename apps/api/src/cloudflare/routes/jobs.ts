import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { appJobs, sites } from '../../../../../src/db/schema.ts';
import { buildJobQueueMessage, type JobTopic } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import { resolveTenantRequest } from '../tenant.ts';
import type { HonoEnv } from '../app.ts';

const VALID_TOPICS = new Set<JobTopic>(['geo', 'reddit', 'youtube', 'bc-scrape', 'bc-parse', 'bc-selector', 'bc-cluster', 'bc-generate', 'sh-copy', 'sh-video', 'sh-publish']);

export const jobsRouter = new Hono<HonoEnv>();

jobsRouter.post('/v1/jobs/:topic', async (c, next) => {
  const topic = c.req.param('topic') as JobTopic;
  if (!VALID_TOPICS.has(topic)) return c.json({ error: 'Unknown job topic' }, 404);
  await next();
}, requireAuthMiddleware, async (c) => {
  const topic = c.req.param('topic') as JobTopic;

  const url = new URL(c.req.url);
  const tenant = resolveTenantRequest(url, c.env);
  const db = c.get('db');
  const [site] = await db.select().from(sites).where(eq(sites.slug, tenant.siteSlug)).limit(1);
  if (!site) return c.json({ error: `Site not found: ${tenant.siteSlug}` }, 404);

  const payload = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const [job] = await db.insert(appJobs).values({ payload, progress: {}, siteId: site.id, topic, type: topic }).returning();

  try {
    await c.env.JOB_QUEUE.send(buildJobQueueMessage({ jobId: String(job.id), payload, siteId: site.id, siteSlug: tenant.siteSlug, topic }));
  } catch {
    await db.delete(appJobs).where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, site.id)));
    return c.json({ error: 'Failed to enqueue job' }, 502);
  }

  return c.json({ jobId: job.id, status: job.status, topic: job.topic }, 202);
});

jobsRouter.get('/v1/jobs/:id', requireAuthMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.get('db');
  const [job] = await db.select().from(appJobs).where(eq(appJobs.id, id)).limit(1);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ id: job.id, topic: job.topic, status: job.status, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt });
});

jobsRouter.get('/v1/jobs/:id/results', requireAuthMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.get('db');
  const [job] = await db.select().from(appJobs).where(eq(appJobs.id, id)).limit(1);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ id: job.id, topic: job.topic, status: job.status, result: job.result ?? null });
});
