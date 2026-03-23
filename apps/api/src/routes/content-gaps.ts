import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, toPositiveInt, toNonNegativeInt, firstQueryValue, serializeRecentRun,
  requireActiveSite, enqueueDraftJob, gapScope, geoRunScope, kbScope, articleScope, ACK_ACTIONS,
  db, and, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql,
  contentGaps, geoRuns, knowledgeEntries, appJobs,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/content-gaps') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const statusParam = firstQueryValue(url, 'status') ?? '';
    const confidenceMin = toNonNegativeInt(firstQueryValue(url, 'confidenceMin', 'confidence_min'), 0, 100);
    const confidenceMax = toPositiveInt(firstQueryValue(url, 'confidenceMax', 'confidence_max'), 100, { min: 0, max: 100 });
    const sortBy = firstQueryValue(url, 'sortBy', 'sort_by') ?? 'confidence';
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 5000);
    const hasProposal = firstQueryValue(url, 'hasProposal', 'has_proposal') === 'true';
    const statuses = statusParam.split(',').map((value) => value.trim()).filter(Boolean);
    const conditions: any[] = [gapScope(site.id)];
    if (statuses.length > 0) conditions.push(inArray(contentGaps.status, statuses));
    if (confidenceMin > 0) conditions.push(gte(contentGaps.confidenceScore, confidenceMin));
    if (confidenceMax < 100) conditions.push(lte(contentGaps.confidenceScore, confidenceMax));
    if (hasProposal) conditions.push(isNotNull(contentGaps.suggestedAngle));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const orderBy = sortBy === 'recency' ? desc(contentGaps.createdAt) : desc(contentGaps.confidenceScore);
    const [gaps, countResult, recentRunResult, statsRows] = await Promise.all([
      db.select().from(contentGaps).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(contentGaps).where(whereClause),
      db.select().from(geoRuns).where(geoRunScope(site.id)).orderBy(desc(geoRuns.runAt)).limit(1),
      db.select({ totalAll: sql<number>`count(*)::int`, totalNew: sql<number>`count(*) filter (where status = 'new')::int`, totalInProgress: sql<number>`count(*) filter (where status = 'in_progress')::int`, totalAcknowledged: sql<number>`count(*) filter (where status = 'acknowledged')::int`, totalArchived: sql<number>`count(*) filter (where status = 'archived')::int`, totalProposals: sql<number>`count(*) filter (where suggested_angle is not null)::int` }).from(contentGaps).where(gapScope(site.id)),
    ]);
    const items = await Promise.all(gaps.map(async (gap) => {
      const searchTerm = gap.gapTitle.split(' ').slice(0, 3).join(' ').trim();
      if (!searchTerm) return { ...gap, kbHints: [], knowledge_base_hints: [] };
      const kbHints = await db.select({ id: knowledgeEntries.id, title: knowledgeEntries.title, type: knowledgeEntries.type, importanceScore: knowledgeEntries.importanceScore })
        .from(knowledgeEntries)
        .where(and(kbScope(site.id), or(ilike(knowledgeEntries.title, `%${searchTerm}%`), sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${searchTerm})`)))
        .orderBy(desc(knowledgeEntries.importanceScore))
        .limit(3);
      return { ...gap, kbHints, knowledge_base_hints: kbHints };
    }));
    const recentRun = serializeRecentRun(recentRunResult[0] ?? null);
    const rawStats = statsRows[0];
    const stats = { ...rawStats, total_new: rawStats?.totalNew ?? 0, total_in_progress: rawStats?.totalInProgress ?? 0, total_acknowledged: rawStats?.totalAcknowledged ?? 0, total_archived: rawStats?.totalArchived ?? 0, total_proposals: rawStats?.totalProposals ?? 0 };
    json(res, 200, { items, gaps: items, pagination: { total: countResult[0]?.total ?? 0, limit, offset }, stats, recentRun, recent_run: recentRun, kbHintsIncluded: true });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && !segments[4]) {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' }), true;
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' }), true;
    json(res, 200, gap);
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && segments[4] === 'acknowledge') {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' }), true;
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const action = typeof body.action === 'string' ? body.action : '';
    if (!ACK_ACTIONS.includes(action as (typeof ACK_ACTIONS)[number])) return json(res, 400, { error: `action must be one of: ${ACK_ACTIONS.join(', ')}` }), true;
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' }), true;
    if (gap.status === 'archived') return json(res, 409, { error: 'Gap already archived' }), true;
    if (gap.status === 'acknowledged' && action !== 'generate_draft') return json(res, 409, { error: 'Gap already acknowledged' }), true;
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : (typeof body.author_notes === 'string' ? body.author_notes : (gap.authorNotes ?? ''));
    const nextStatus = action === 'generate_draft' ? 'in_progress' : 'archived';
    const now = new Date();
    let jobId: number | null = null;
    if (action === 'generate_draft') {
      const [existingDraft] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'draft'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`)).limit(1);
      if (existingDraft) return json(res, 409, { error: 'Draft job already active for this gap', jobId: existingDraft.id }), true;
      const job = await enqueueDraftJob(site.id, gapId, typeof body.model === 'string' ? body.model : 'anthropic/claude-sonnet-4-6', authorNotes);
      jobId = job.id;
    }
    await db.update(contentGaps).set({ status: nextStatus, authorNotes, acknowledgedAt: now }).where(eq(contentGaps.id, gapId));
    json(res, 200, { gapId, gap_id: gapId, status: nextStatus, authorNotes, author_notes: authorNotes, acknowledgedAt: now.toISOString(), acknowledged_at: now.toISOString(), jobId, draftGenerationStarted: action === 'generate_draft', draft_generation_started: action === 'generate_draft', draft_id: null });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && segments[4] === 'archive') {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' }), true;
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [gap] = await db.select({ id: contentGaps.id }).from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' }), true;
    const now = new Date();
    await db.update(contentGaps).set({ status: 'archived', acknowledgedAt: now }).where(eq(contentGaps.id, gapId));
    json(res, 200, { gapId, gap_id: gapId, status: 'archived', archivedAt: now.toISOString(), archived_at: now.toISOString(), reason: typeof body.reason === 'string' ? body.reason : null });
    return true;
  }

  return false;
}
