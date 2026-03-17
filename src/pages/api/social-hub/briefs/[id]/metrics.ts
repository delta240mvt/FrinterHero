export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shPublishLog, shPostMetrics, shSocialAccounts } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Minimum gap before we re-fetch metrics for a log entry (1 hour) */
const METRICS_TTL_MS = 60 * 60 * 1000;

interface UploadPostMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  engagement_rate?: number;
  [key: string]: unknown;
}

async function fetchUploadPostMetrics(externalPostId: string): Promise<UploadPostMetrics> {
  const apiKey = process.env.UPLOADPOST_API_KEY;
  if (!apiKey) {
    throw new Error('[sh-metrics] UPLOADPOST_API_KEY environment variable is not set');
  }

  const res = await fetch(`https://api.upload-post.com/api/status/${externalPostId}`, {
    method: 'GET',
    headers: {
      Authorization: `Apikey ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[sh-metrics] Upload-Post status API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<UploadPostMetrics>;
}

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    // 1. Load all publish log records for this brief, joined with account info
    const logsRaw = await db
      .select({
        log: shPublishLog,
        account: shSocialAccounts,
      })
      .from(shPublishLog)
      .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(eq(shPublishLog.briefId, briefId));

    if (!logsRaw.length) {
      return new Response(
        JSON.stringify({ metrics: [] }),
        { headers: JSON_HEADERS },
      );
    }

    const logIds = logsRaw.map((r) => r.log.id);

    // 2. Load existing metrics for all logs
    const existingMetrics = await db
      .select()
      .from(shPostMetrics)
      .where(inArray(shPostMetrics.publishLogId, logIds));

    // Map: publishLogId → most-recent metric record
    const latestMetricByLogId = new Map<number, typeof shPostMetrics.$inferSelect>();
    for (const m of existingMetrics) {
      const current = latestMetricByLogId.get(m.publishLogId);
      if (!current || m.fetchedAt > current.fetchedAt) {
        latestMetricByLogId.set(m.publishLogId, m);
      }
    }

    const now = Date.now();
    const updatedMetrics: typeof shPostMetrics.$inferSelect[] = [];

    // 3. For each log with an externalPostId, decide whether to fetch/refresh
    for (const { log } of logsRaw) {
      if (!log.externalPostId) {
        // No external ID yet — nothing to fetch
        const existing = latestMetricByLogId.get(log.id);
        if (existing) updatedMetrics.push(existing);
        continue;
      }

      const existing = latestMetricByLogId.get(log.id);
      const ageMs = existing ? now - existing.fetchedAt.getTime() : Infinity;

      if (existing && ageMs < METRICS_TTL_MS) {
        // Still fresh — reuse cached record
        updatedMetrics.push(existing);
        continue;
      }

      // Fetch fresh metrics from Upload-Post
      let raw: UploadPostMetrics;
      try {
        raw = await fetchUploadPostMetrics(log.externalPostId);
      } catch (err) {
        console.error(`[sh-metrics] Failed to fetch metrics for post ${log.externalPostId}:`, err);
        if (existing) updatedMetrics.push(existing);
        continue;
      }

      const metricsPayload = {
        publishLogId: log.id,
        views: raw.views ?? 0,
        likes: raw.likes ?? 0,
        comments: raw.comments ?? 0,
        shares: raw.shares ?? 0,
        saves: raw.saves ?? 0,
        engagementRate: raw.engagement_rate ?? null,
        fetchedAt: new Date(),
      };

      if (existing) {
        // 4a. Update existing record
        const [updated] = await db
          .update(shPostMetrics)
          .set(metricsPayload)
          .where(eq(shPostMetrics.id, existing.id))
          .returning();
        updatedMetrics.push(updated);
      } else {
        // 4b. Insert new record
        const [inserted] = await db
          .insert(shPostMetrics)
          .values(metricsPayload)
          .returning();
        updatedMetrics.push(inserted);
      }
    }

    // 5. Return all metrics joined with their publish log and account data
    const metricsByLogId = new Map<number, typeof shPostMetrics.$inferSelect>();
    for (const m of updatedMetrics) {
      metricsByLogId.set(m.publishLogId, m);
    }

    const result = logsRaw.map(({ log, account }) => ({
      ...log,
      account: account ?? null,
      metrics: metricsByLogId.get(log.id) ?? null,
    }));

    return new Response(
      JSON.stringify({ metrics: result }),
      { headers: JSON_HEADERS },
    );
  } catch (err: any) {
    console.error('[SocialHub Metrics GET]', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
