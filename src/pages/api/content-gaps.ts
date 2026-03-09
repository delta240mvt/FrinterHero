import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { contentGaps, geoRuns, knowledgeEntries } from '@/db/schema';
import { eq, and, gte, lte, desc, asc, or, ilike, sql, inArray } from 'drizzle-orm';

export const GET: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') || 'new,in_progress';
  const confidenceMin = parseInt(url.searchParams.get('confidence_min') || '0', 10);
  const confidenceMax = parseInt(url.searchParams.get('confidence_max') || '100', 10);
  const sortBy = url.searchParams.get('sort_by') || 'confidence';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  try {
    const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
    const conditions: any[] = [];

    if (statuses.length > 0) {
      conditions.push(inArray(contentGaps.status, statuses));
    }
    if (!isNaN(confidenceMin) && confidenceMin > 0) {
      conditions.push(gte(contentGaps.confidenceScore, confidenceMin));
    }
    if (!isNaN(confidenceMax) && confidenceMax < 100) {
      conditions.push(lte(contentGaps.confidenceScore, confidenceMax));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = sortBy === 'recency' ? desc(contentGaps.createdAt) : desc(contentGaps.confidenceScore);

    const [gaps, countResult] = await Promise.all([
      db.select().from(contentGaps).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(contentGaps).where(whereClause),
    ]);

    // For each gap, fetch 2-3 most relevant KB entries as hints
    const gapsWithHints = await Promise.all(gaps.map(async (gap) => {
      let kbHints: any[] = [];
      try {
        const searchTerm = gap.gapTitle.split(' ').slice(0, 3).join(' ');
        kbHints = await db.select({
          id: knowledgeEntries.id,
          title: knowledgeEntries.title,
          importanceScore: knowledgeEntries.importanceScore,
          type: knowledgeEntries.type,
        })
          .from(knowledgeEntries)
          .where(
            or(
              ilike(knowledgeEntries.title, `%${searchTerm}%`),
              sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${searchTerm})`
            )
          )
          .orderBy(desc(knowledgeEntries.importanceScore))
          .limit(3);
      } catch {}
      return { ...gap, knowledge_base_hints: kbHints };
    }));

    // Fetch latest run stats
    const [recentRun] = await db.select().from(geoRuns).orderBy(desc(geoRuns.runAt)).limit(1);

    // Dashboard stats
    const [statsNew, statsAck, statsArchived] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(contentGaps).where(eq(contentGaps.status, 'new')),
      db.select({ count: sql<number>`count(*)` }).from(contentGaps).where(eq(contentGaps.status, 'acknowledged')),
      db.select({ count: sql<number>`count(*)` }).from(contentGaps).where(eq(contentGaps.status, 'archived')),
    ]);

    return new Response(JSON.stringify({
      gaps: gapsWithHints,
      pagination: { total: Number(countResult[0]?.count || 0), limit, offset },
      recent_run: recentRun || null,
      stats: {
        total_new: Number(statsNew[0]?.count || 0),
        total_acknowledged: Number(statsAck[0]?.count || 0),
        total_archived: Number(statsArchived[0]?.count || 0),
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ContentGaps API GET] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
