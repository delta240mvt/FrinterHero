import { eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs, sites } from '../../../../../src/db/schema.ts';
import { buildJobQueueMessage, type JobTopic } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import type { ApiEnv } from '../env.ts';
import { resolveTenantRequest } from '../tenant.ts';

type EnqueueTopic = Extract<JobTopic, 'geo' | 'reddit' | 'youtube'>;

const ENQUEUE_TOPICS = new Set<EnqueueTopic>(['geo', 'reddit', 'youtube']);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export async function handleJobEnqueue(request: Request, env: ApiEnv): Promise<Response | null> {
  if (request.method !== 'POST') {
    return null;
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const topic = segments[0] === 'jobs' ? (segments[1] as EnqueueTopic | undefined) : undefined;

  if (!topic || !ENQUEUE_TOPICS.has(topic)) {
    return null;
  }

  const tenant = resolveTenantRequest(url, env);
  const db = getCloudflareDb() as any;
  const [site] = await db.select().from(sites).where(eq(sites.slug, tenant.siteSlug)).limit(1);

  if (!site) {
    return json(404, { error: `Site not found for slug: ${tenant.siteSlug}` });
  }

  const payload = await readJsonBody(request);
  const [job] = await db.insert(appJobs).values({
    payload,
    progress: {},
    siteId: site.id,
    topic,
    type: topic,
  }).returning();

  if (!env.JOB_QUEUE.send) {
    throw new Error('JOB_QUEUE.send is not available');
  }

  await env.JOB_QUEUE.send(
    buildJobQueueMessage({
      jobId: String(job.id),
      payload,
      siteId: site.id,
      siteSlug: tenant.siteSlug,
      topic,
    }),
  );

  return json(202, {
    jobId: job.id,
    status: job.status,
    topic: job.topic,
  });
}
