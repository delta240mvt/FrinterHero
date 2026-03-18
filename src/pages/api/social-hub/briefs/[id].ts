export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import {
  shContentBriefs,
  shGeneratedCopy,
  shMediaAssets,
  shPublishLog,
  shPostMetrics,
  shSocialAccounts,
} from '@/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    // Fetch brief
    const [brief] = await db
      .select()
      .from(shContentBriefs)
      .where(eq(shContentBriefs.id, id))
      .limit(1);

    if (!brief) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404, headers: JSON_HEADERS });
    }

    // Fetch all generated copy variants ordered by variantIndex
    const generatedCopy = await db
      .select()
      .from(shGeneratedCopy)
      .where(eq(shGeneratedCopy.briefId, id))
      .orderBy(shGeneratedCopy.variantIndex);

    // Fetch all media assets
    const mediaAssets = await db
      .select()
      .from(shMediaAssets)
      .where(eq(shMediaAssets.briefId, id))
      .orderBy(shMediaAssets.createdAt);

    // Fetch all publish logs joined with account info
    const publishLogsRaw = await db
      .select({
        log: shPublishLog,
        account: shSocialAccounts,
      })
      .from(shPublishLog)
      .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(eq(shPublishLog.briefId, id))
      .orderBy(desc(shPublishLog.createdAt));

    // Fetch metrics for each publish log
    const publishLogIds = publishLogsRaw.map(r => r.log.id);

    let metricsByLogId: Record<number, typeof shPostMetrics.$inferSelect[]> = {};
    if (publishLogIds.length > 0) {
      const allMetrics = await db
        .select()
        .from(shPostMetrics)
        .where(inArray(shPostMetrics.publishLogId, publishLogIds))
        .orderBy(desc(shPostMetrics.fetchedAt));

      for (const metric of allMetrics) {
        if (!metricsByLogId[metric.publishLogId]) {
          metricsByLogId[metric.publishLogId] = [];
        }
        metricsByLogId[metric.publishLogId].push(metric);
      }
    }

    // Assemble publish logs with their metrics and account data
    const publishLogs = publishLogsRaw.map(({ log, account }) => ({
      ...log,
      account: account ?? null,
      metrics: metricsByLogId[log.id] ?? [],
    }));

    return new Response(
      JSON.stringify({
        brief,
        generatedCopy,
        mediaAssets,
        publishLogs,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Brief GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    // Verify brief exists first
    const [existing] = await db
      .select({ id: shContentBriefs.id })
      .from(shContentBriefs)
      .where(eq(shContentBriefs.id, id))
      .limit(1);

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404, headers: JSON_HEADERS });
    }

    // Cascade delete: metrics → publish_log → media_assets → generated_copy → brief
    const publishLogRows = await db
      .select({ id: shPublishLog.id })
      .from(shPublishLog)
      .where(eq(shPublishLog.briefId, id));

    if (publishLogRows.length > 0) {
      await db
        .delete(shPostMetrics)
        .where(inArray(shPostMetrics.publishLogId, publishLogRows.map(r => r.id)));
    }

    await db.delete(shPublishLog).where(eq(shPublishLog.briefId, id));
    await db.delete(shMediaAssets).where(eq(shMediaAssets.briefId, id));
    await db.delete(shGeneratedCopy).where(eq(shGeneratedCopy.briefId, id));
    await db.delete(shContentBriefs).where(eq(shContentBriefs.id, id));

    return new Response(JSON.stringify({ ok: true, id }), { headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Brief DELETE]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

