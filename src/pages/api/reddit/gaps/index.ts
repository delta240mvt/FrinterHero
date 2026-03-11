import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditExtractedGaps, redditPosts } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { count } from 'drizzle-orm';

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const url      = new URL(request.url);
  const status   = url.searchParams.get('status') || 'pending';
  const category = url.searchParams.get('category') || '';
  const runId    = url.searchParams.get('runId') ? parseInt(url.searchParams.get('runId')!, 10) : null;
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit    = 20;
  const offset   = (page - 1) * limit;

  const conditions: any[] = [eq(redditExtractedGaps.status, status)];
  if (category) conditions.push(eq(redditExtractedGaps.category, category));
  if (runId)    conditions.push(eq(redditExtractedGaps.scrapeRunId, runId));

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [gaps, totalRes] = await Promise.all([
    db.select().from(redditExtractedGaps)
      .where(whereClause)
      .orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt))
      .limit(limit).offset(offset),
    db.select({ c: count() }).from(redditExtractedGaps).where(whereClause),
  ]);

  // Fetch source posts for each gap (max 3 per gap)
  const gapsWithPosts = await Promise.all(gaps.map(async (gap) => {
    const postIds = (gap.sourcePostIds || []).slice(0, 3);
    let sourcePosts: any[] = [];
    if (postIds.length > 0) {
      sourcePosts = await db.select({
        id: redditPosts.id,
        title: redditPosts.title,
        subreddit: redditPosts.subreddit,
        upvotes: redditPosts.upvotes,
        url: redditPosts.url,
      }).from(redditPosts).where(inArray(redditPosts.id, postIds));
    }
    return { ...gap, sourcePosts };
  }));

  return new Response(JSON.stringify({ gaps: gapsWithPosts, total: totalRes[0].c, page, limit }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
