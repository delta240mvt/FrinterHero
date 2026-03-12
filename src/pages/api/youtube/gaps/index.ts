import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytExtractedGaps, ytComments } from '@/db/schema';
import { eq, desc, and, inArray, count } from 'drizzle-orm';

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

  const conditions: any[] = [eq(ytExtractedGaps.status, status)];
  if (category) conditions.push(eq(ytExtractedGaps.category, category));
  if (runId)    conditions.push(eq(ytExtractedGaps.scrapeRunId, runId));

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [gaps, totalRes] = await Promise.all([
    db.select().from(ytExtractedGaps)
      .where(whereClause)
      .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt))
      .limit(limit).offset(offset),
    db.select({ c: count() }).from(ytExtractedGaps).where(whereClause),
  ]);

  // Fetch source comments for each gap (max 3)
  const gapsWithComments = await Promise.all(gaps.map(async (gap) => {
    const commentIds = (gap.sourceCommentIds || []).slice(0, 3);
    let sourceComments: any[] = [];
    if (commentIds.length > 0) {
      sourceComments = await db.select({
        id: ytComments.id,
        commentText: ytComments.commentText,
        author: ytComments.author,
        voteCount: ytComments.voteCount,
        videoTitle: ytComments.videoTitle,
      }).from(ytComments).where(inArray(ytComments.id, commentIds));
    }
    return { ...gap, sourceComments };
  }));

  return new Response(JSON.stringify({ gaps: gapsWithComments, total: totalRes[0].c, page, limit }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
