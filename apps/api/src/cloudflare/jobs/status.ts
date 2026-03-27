import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs, sites } from '../../../../../src/db/schema.ts';
import type { ApiEnv } from '../env.ts';
import { resolveTenantRequest } from '../tenant.ts';
import { serializeJobResult } from './results.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export async function handleJobStatus(request: Request, env: ApiEnv): Promise<Response | null> {
  if (request.method !== 'GET') {
    return null;
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'jobs' || segments.length !== 2) {
    return null;
  }

  const jobId = Number(segments[1]);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return json(400, { error: 'Invalid job id' });
  }

  const tenant = resolveTenantRequest(url, env);
  const db = getCloudflareDb() as any;
  const [site] = await db.select().from(sites).where(eq(sites.slug, tenant.siteSlug)).limit(1);

  if (!site) {
    return json(404, { error: `Site not found for slug: ${tenant.siteSlug}` });
  }

  const [job] = await db.select().from(appJobs).where(and(eq(appJobs.id, jobId), eq(appJobs.siteId, site.id))).limit(1);

  if (!job) {
    return json(404, { error: 'Job not found' });
  }

  return json(200, serializeJobResult(job));
}
