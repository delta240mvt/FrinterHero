import { Hono } from 'hono';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { appJobs, sites } from '../../../../../src/db/schema.ts';
import { buildJobQueueMessage, type JobTopic } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import { resolveTenantRequest } from '../tenant.ts';
import type { HonoEnv } from '../app.ts';

const VALID_TOPICS = new Set<JobTopic>(['geo', 'reddit', 'youtube', 'bc-scrape', 'bc-parse', 'bc-selector', 'bc-cluster', 'bc-generate', 'sh-copy', 'sh-video', 'sh-publish']);

export const jobsRouter = new Hono<HonoEnv>();

jobsRouter.post('/v1/jobs/:topic', async (c, next) => {
  const topicParam = c.req.param('topic');
  if (!VALID_TOPICS.has(topicParam as JobTopic)) return c.json({ error: 'Unknown job topic' }, 404);
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
  if (!job) return c.json({ error: 'Failed to create job' }, 500);

  try {
    await c.env.JOB_QUEUE.send!(buildJobQueueMessage({ jobId: String(job.id), payload, siteId: site.id, siteSlug: tenant.siteSlug, topic }));
  } catch {
    await db.delete(appJobs).where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, site.id)));
    return c.json({ error: 'Failed to enqueue job' }, 502);
  }

  return c.json({ jobId: job.id, status: job.status, topic: job.topic }, 202);
});

jobsRouter.get('/v1/jobs/active', requireAuthMiddleware, async (c) => {
  const topic = c.req.query('topic');
  const db = c.get('db');
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const conditions = [
    eq(appJobs.siteId, siteId),
    inArray(appJobs.status, ['pending', 'running']),
  ];
  if (topic) conditions.push(eq(appJobs.topic, topic));

  const jobs = await db.select().from(appJobs).where(and(...conditions)).orderBy(desc(appJobs.createdAt)).limit(20);
  return c.json({ jobs });
});

jobsRouter.delete('/v1/jobs/active', requireAuthMiddleware, async (c) => {
  const topic = c.req.query('topic');
  const db = c.get('db');
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const conditions = [
    eq(appJobs.siteId, siteId),
    inArray(appJobs.status, ['pending', 'running']),
  ];
  if (topic) conditions.push(eq(appJobs.topic, topic));

  const cancelled = await db
    .update(appJobs)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: appJobs.id });

  return c.json({ success: true, cancelled: cancelled.length });
});

jobsRouter.get('/v1/jobs/latest', requireAuthMiddleware, async (c) => {
  const topic = c.req.query('topic');
  const db = c.get('db');
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const conditions = [eq(appJobs.siteId, siteId)];
  if (topic) conditions.push(eq(appJobs.topic, topic));

  const [job] = await db
    .select()
    .from(appJobs)
    .where(and(...conditions))
    .orderBy(desc(appJobs.createdAt))
    .limit(1);

  if (!job) return c.json({ job: null });

  const finishedStatuses = ['done', 'error', 'cancelled'];
  return c.json({
    job: {
      id: job.id,
      topic: job.topic,
      status: job.status,
      startedAt: job.createdAt,
      finishedAt: finishedStatuses.includes(job.status) ? job.updatedAt : null,
      result: job.result ?? null,
      createdAt: job.createdAt,
    },
  });
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
