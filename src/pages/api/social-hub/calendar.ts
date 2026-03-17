export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shPublishLog, shContentBriefs, shSocialAccounts } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const now = new Date();
    const year  = parseInt(url.searchParams.get('year')  || String(now.getFullYear()),  10);
    const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'Invalid year or month' }), { status: 400, headers: JSON_HEADERS });
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const monthEnd   = new Date(Date.UTC(year, month,     1, 0, 0, 0, 0)); // exclusive (start of next month)

    // Fetch publish logs where scheduledFor OR publishedAt falls within the month
    const rows = await db
      .select({
        logId:         shPublishLog.id,
        briefId:       shPublishLog.briefId,
        platform:      shPublishLog.platform,
        status:        shPublishLog.status,
        scheduledFor:  shPublishLog.scheduledFor,
        publishedAt:   shPublishLog.publishedAt,
        accountHandle: shSocialAccounts.accountHandle,
        sourceTitle:   shContentBriefs.sourceTitle,
        outputFormat:  shContentBriefs.outputFormat,
      })
      .from(shPublishLog)
      .leftJoin(shContentBriefs,   eq(shPublishLog.briefId,   shContentBriefs.id))
      .leftJoin(shSocialAccounts,  eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(
        // scheduledFor in range OR publishedAt in range
        // Drizzle doesn't have OR at top level without `or()`, so we fetch both windows
        // and deduplicate by log id in JS — simplest approach without raw SQL.
        // We use gte/lte on scheduledFor here; publishedAt rows are fetched below.
        and(
          gte(shPublishLog.scheduledFor, monthStart),
          lte(shPublishLog.scheduledFor, new Date(monthEnd.getTime() - 1)),
        ),
      );

    // Second query: publishedAt in range (covers posts with no scheduledFor or different date)
    const rowsPublished = await db
      .select({
        logId:         shPublishLog.id,
        briefId:       shPublishLog.briefId,
        platform:      shPublishLog.platform,
        status:        shPublishLog.status,
        scheduledFor:  shPublishLog.scheduledFor,
        publishedAt:   shPublishLog.publishedAt,
        accountHandle: shSocialAccounts.accountHandle,
        sourceTitle:   shContentBriefs.sourceTitle,
        outputFormat:  shContentBriefs.outputFormat,
      })
      .from(shPublishLog)
      .leftJoin(shContentBriefs,  eq(shPublishLog.briefId,   shContentBriefs.id))
      .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(
        and(
          gte(shPublishLog.publishedAt, monthStart),
          lte(shPublishLog.publishedAt, new Date(monthEnd.getTime() - 1)),
        ),
      );

    // Merge + deduplicate by logId
    const seen = new Set<number>();
    const merged = [...rows, ...rowsPublished].filter(r => {
      if (seen.has(r.logId)) return false;
      seen.add(r.logId);
      return true;
    });

    const posts = merged.map(r => {
      const anchor = r.scheduledFor ?? r.publishedAt;
      return {
        day:           anchor ? anchor.getUTCDate() : null,
        logId:         r.logId,
        briefId:       r.briefId,
        platform:      r.platform,
        accountHandle: r.accountHandle ?? null,
        sourceTitle:   r.sourceTitle   ?? null,
        outputFormat:  r.outputFormat  ?? null,
        status:        r.status,
        scheduledFor:  r.scheduledFor  ? r.scheduledFor.toISOString()  : null,
        publishedAt:   r.publishedAt   ? r.publishedAt.toISOString()   : null,
      };
    });

    return new Response(
      JSON.stringify({ month: { year, month }, posts }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Calendar GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { publishLogId, scheduledFor } = body ?? {};

  if (!publishLogId || !scheduledFor) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: publishLogId, scheduledFor' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const id = parseInt(String(publishLogId), 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid publishLogId' }), { status: 400, headers: JSON_HEADERS });
  }

  const newDate = new Date(scheduledFor);
  if (isNaN(newDate.getTime())) {
    return new Response(JSON.stringify({ error: 'Invalid scheduledFor date' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const updated = await db
      .update(shPublishLog)
      .set({ scheduledFor: newDate })
      .where(eq(shPublishLog.id, id))
      .returning();

    if (updated.length === 0) {
      return new Response(JSON.stringify({ error: 'Publish log not found' }), { status: 404, headers: JSON_HEADERS });
    }

    return new Response(
      JSON.stringify({ ok: true, publishLog: updated[0] }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Calendar PUT]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
