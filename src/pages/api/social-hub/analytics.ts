export const prerender = false;
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shPublishLog, shPostMetrics, shContentBriefs, shGeneratedCopy } from '@/db/schema';
import { eq, desc, sql, count, sum, avg, gte, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Returns a Date `days` ago from now, or null if days is not a valid positive integer. */
function cutoffDate(days: number | null): Date | null {
  if (!days || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : null;
    const validDays = days && [7, 30, 90].includes(days) ? days : null;
    const cutoff = cutoffDate(validDays);

    // ── 1. Summary ───────────────────────────────────────────────────────────

    // Total published posts (optionally filtered by publishedAt)
    const publishedCondition = cutoff
      ? and(eq(shPublishLog.status, 'published'), gte(shPublishLog.publishedAt, cutoff))
      : eq(shPublishLog.status, 'published');

    const [totalPostsResult] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(shPublishLog)
      .where(publishedCondition);

    const totalPosts = totalPostsResult?.total ?? 0;

    // Aggregate metrics (optionally filtered by fetchedAt)
    const metricsCondition = cutoff
      ? gte(shPostMetrics.fetchedAt, cutoff)
      : undefined;

    const [metricsAgg] = await db
      .select({
        totalImpressions: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        avgEngagementRate: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)::float`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${shPostMetrics.comments}), 0)::int`,
        totalShares: sql<number>`coalesce(sum(${shPostMetrics.shares}), 0)::int`,
      })
      .from(shPostMetrics)
      .where(metricsCondition);

    const summary = {
      totalPosts,
      totalImpressions: metricsAgg?.totalImpressions ?? 0,
      avgEngagementRate: metricsAgg?.avgEngagementRate ?? 0,
      totalLikes: metricsAgg?.totalLikes ?? 0,
      totalComments: metricsAgg?.totalComments ?? 0,
      totalShares: metricsAgg?.totalShares ?? 0,
    };

    // ── 2. By Platform ────────────────────────────────────────────────────────

    // Join shPublishLog → shPostMetrics, group by platform
    // Apply time filter on shPublishLog.publishedAt (platform-level posts)
    const byPlatformRows = await db
      .select({
        platform: shPublishLog.platform,
        postsCount: sql<number>`count(distinct ${shPublishLog.id})::int`,
        totalViews: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        avgEngagement: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)::float`,
      })
      .from(shPublishLog)
      .leftJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id))
      .where(
        cutoff
          ? and(eq(shPublishLog.status, 'published'), gte(shPublishLog.publishedAt, cutoff))
          : eq(shPublishLog.status, 'published'),
      )
      .groupBy(shPublishLog.platform)
      .orderBy(desc(sql`coalesce(sum(${shPostMetrics.views}), 0)`));

    const byPlatform = byPlatformRows.map(r => ({
      platform: r.platform,
      postsCount: r.postsCount,
      totalViews: r.totalViews,
      totalLikes: r.totalLikes,
      avgEngagement: r.avgEngagement,
    }));

    // ── 3. Top Posts (top 10 by views) ───────────────────────────────────────

    // Join shPublishLog → shPostMetrics → shGeneratedCopy (via shContentBriefs)
    // We need hookLine from shGeneratedCopy. Each brief may have multiple copy rows;
    // we pick the one with the lowest variantIndex using a lateral/subquery approach.
    // For simplicity, we use a LEFT JOIN on the min variantIndex via a subquery alias.

    const topPostsBaseCondition = cutoff
      ? and(eq(shPublishLog.status, 'published'), gte(shPublishLog.publishedAt, cutoff))
      : eq(shPublishLog.status, 'published');

    const topPostsRows = await db
      .select({
        briefId: shPublishLog.briefId,
        platform: shPublishLog.platform,
        externalPostUrl: shPublishLog.externalPostUrl,
        publishedAt: shPublishLog.publishedAt,
        views: shPostMetrics.views,
        likes: shPostMetrics.likes,
        engagementRate: shPostMetrics.engagementRate,
        hookLine: shGeneratedCopy.hookLine,
      })
      .from(shPublishLog)
      .innerJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id))
      // Join to shGeneratedCopy: match on briefId and take only variantIndex = 0
      // If a brief has no copy at variantIndex=0 the row is still included (LEFT JOIN)
      .leftJoin(
        shGeneratedCopy,
        and(
          eq(shGeneratedCopy.briefId, shPublishLog.briefId),
          eq(shGeneratedCopy.variantIndex, 0),
        ),
      )
      .where(topPostsBaseCondition)
      .orderBy(desc(shPostMetrics.views))
      .limit(10);

    const topPosts = topPostsRows.map(r => ({
      briefId: r.briefId,
      platform: r.platform,
      hookLine: r.hookLine ?? '',
      externalPostUrl: r.externalPostUrl ?? '',
      views: r.views ?? 0,
      likes: r.likes ?? 0,
      engagementRate: r.engagementRate ?? 0,
      publishedAt: r.publishedAt?.toISOString() ?? '',
    }));

    // ── 4. Recent Activity (last 20 briefs) ──────────────────────────────────

    const recentBriefs = await db
      .select({
        id: shContentBriefs.id,
        sourceType: shContentBriefs.sourceType,
        sourceTitle: shContentBriefs.sourceTitle,
        status: shContentBriefs.status,
        createdAt: shContentBriefs.createdAt,
      })
      .from(shContentBriefs)
      .orderBy(desc(shContentBriefs.createdAt))
      .limit(20);

    const recentActivity = recentBriefs.map(b => ({
      briefId: b.id,
      sourceType: b.sourceType,
      sourceTitle: b.sourceTitle ?? '',
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    }));

    // ── 5. Briefs Status Summary ──────────────────────────────────────────────

    const statusCountRows = await db
      .select({
        status: shContentBriefs.status,
        cnt: sql<number>`count(*)::int`,
      })
      .from(shContentBriefs)
      .groupBy(shContentBriefs.status);

    const statusMap: Record<string, number> = {};
    for (const row of statusCountRows) {
      statusMap[row.status] = row.cnt;
    }

    const briefsStatusSummary = {
      draft: statusMap['draft'] ?? 0,
      generating: statusMap['generating'] ?? 0,
      copy_review: statusMap['copy_review'] ?? 0,
      rendering: statusMap['rendering'] ?? 0,
      render_review: statusMap['render_review'] ?? 0,
      published: statusMap['published'] ?? 0,
      done: statusMap['done'] ?? 0,
    };

    // ── Response ──────────────────────────────────────────────────────────────

    return new Response(
      JSON.stringify({
        summary,
        byPlatform,
        topPosts,
        recentActivity,
        briefsStatusSummary,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Analytics GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
