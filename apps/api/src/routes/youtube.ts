import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, toPositiveInt,
  requireActiveSite, ytStatuses, hydrateYtGaps, ytSourceComments,
  ytTargetScope, ytRunScope, ytGapScope, ytCommentScope,
  db, and, desc, eq, inArray, sql,
  ytTargets, ytScrapeRuns, ytExtractedGaps, ytComments, contentGaps,
} from '../helpers.js';
import { findOffBrandMatch } from '../../../../src/utils/brandFilter';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/youtube/overview') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [gapStats, runStats, targetStats, commentStats] = await Promise.all([
      db.select({
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(ytExtractedGaps).where(ytGapScope(site.id)),
      db.select({ total: sql<number>`count(*)::int` }).from(ytScrapeRuns).where(ytRunScope(site.id)),
      db.select({ active: sql<number>`count(*) filter (where is_active = true)::int`, total: sql<number>`count(*)::int` }).from(ytTargets).where(ytTargetScope(site.id)),
      db.select({ total: sql<number>`count(*)::int` }).from(ytComments).where(ytCommentScope(site.id)),
    ]);
    json(res, 200, {
      gaps: gapStats[0] ?? { pending: 0, approved: 0, rejected: 0 },
      runs: runStats[0] ?? { total: 0 },
      targets: targetStats[0] ?? { active: 0, total: 0 },
      comments: commentStats[0] ?? { total: 0 },
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/targets') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const targets = await db.select().from(ytTargets).where(ytTargetScope(site.id)).orderBy(desc(ytTargets.priority), desc(ytTargets.createdAt));
    json(res, 200, { targets });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/youtube/targets') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const body = await readJsonBody(req);
    const urlValue = typeof body.url === 'string' ? body.url.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const type = body.type === 'channel' ? 'channel' : 'video';
    if (!urlValue || !label) return json(res, 400, { error: 'url and label required' });
    let videoId = typeof body.videoId === 'string' && body.videoId.trim() ? body.videoId.trim() : null;
    let channelHandle = typeof body.channelHandle === 'string' && body.channelHandle.trim() ? body.channelHandle.trim() : null;
    try {
      const parsed = new URL(urlValue);
      if (!videoId && type === 'video') videoId = parsed.searchParams.get('v') ?? null;
      if (!channelHandle && type === 'channel') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] === 'channel') channelHandle = parts[1] ?? null;
        else if (parts[0]?.startsWith('@')) channelHandle = parts[0].replace('@', '');
        else if (parts[0] === 'c' || parts[0] === 'user') channelHandle = parts[1] ?? null;
      }
    } catch {}
    const [target] = await db.insert(ytTargets).values({
      siteId: site.id,
      type,
      url: urlValue,
      label,
      videoId,
      channelHandle,
      maxVideosPerChannel: toPositiveInt(String(body.maxVideosPerChannel ?? '5'), 5, { min: 1, max: 50 }),
      priority: toPositiveInt(String(body.priority ?? '50'), 50, { min: 0, max: 100 }),
      maxComments: toPositiveInt(String(body.maxComments ?? '300'), 300, { min: 1, max: 5000 }),
      isActive: body.isActive !== false,
    }).returning();
    json(res, 201, { target });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'targets' && segments[4] && !segments[5]) {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, unknown> = {};
      if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
      if (typeof body.priority === 'number') updates.priority = Math.max(0, Math.min(100, body.priority));
      if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
      if (typeof body.maxComments === 'number') updates.maxComments = Math.max(1, Math.min(5000, body.maxComments));
      if (typeof body.maxVideosPerChannel === 'number') updates.maxVideosPerChannel = Math.max(1, Math.min(50, body.maxVideosPerChannel));
      const [target] = await db.update(ytTargets).set(updates).where(and(eq(ytTargets.id, id), ytTargetScope(site.id))).returning();
      if (!target) return json(res, 404, { error: 'Not found' });
      json(res, 200, { target });
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(ytTargets).where(and(eq(ytTargets.id, id), ytTargetScope(site.id)));
      res.writeHead(204);
      res.end();
      return true;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/runs') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 10, { min: 1, max: 50 });
    const offset = (page - 1) * limit;
    const [runs, totals] = await Promise.all([
      db.select().from(ytScrapeRuns).where(ytRunScope(site.id)).orderBy(desc(ytScrapeRuns.runAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(ytScrapeRuns).where(ytRunScope(site.id)),
    ]);
    json(res, 200, { runs, total: totals[0]?.total ?? 0, page, limit });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'runs' && segments[4] && !segments[5]) {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });

    if (method === 'GET') {
      const [run] = await db.select().from(ytScrapeRuns).where(and(eq(ytScrapeRuns.id, id), ytRunScope(site.id))).limit(1);
      if (!run) return json(res, 404, { error: 'Run not found' });
      const gaps = await db.select()
        .from(ytExtractedGaps)
        .where(and(eq(ytExtractedGaps.scrapeRunId, id), ytGapScope(site.id)))
        .orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt));
      json(res, 200, { run, gaps: await hydrateYtGaps(gaps) });
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(ytScrapeRuns).where(and(eq(ytScrapeRuns.id, id), ytRunScope(site.id)));
      json(res, 200, { success: true });
      return true;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/gaps') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const statuses = ytStatuses(url.searchParams.get('status'));
    const category = url.searchParams.get('category')?.trim() ?? '';
    const runId = Number(url.searchParams.get('runId') ?? 0);
    const conditions: any[] = [ytGapScope(site.id), inArray(ytExtractedGaps.status, statuses.length > 0 ? statuses : ['pending'])];
    if (category) conditions.push(eq(ytExtractedGaps.category, category));
    if (runId) conditions.push(eq(ytExtractedGaps.scrapeRunId, runId));
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const [gaps, totalRows, statsRows] = await Promise.all([
      db.select().from(ytExtractedGaps).where(whereClause).orderBy(desc(ytExtractedGaps.emotionalIntensity), desc(ytExtractedGaps.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(ytExtractedGaps).where(whereClause),
      db.select({
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(ytExtractedGaps).where(ytGapScope(site.id)),
    ]);
    const items = await hydrateYtGaps(gaps);
    json(res, 200, {
      gaps: items,
      items,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
      stats: statsRows[0] ?? { pending: 0, approved: 0, rejected: 0 },
    });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/youtube/gaps/auto-filter') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const pendingGaps = await db.select().from(ytExtractedGaps).where(and(ytGapScope(site.id), eq(ytExtractedGaps.status, 'pending')));
    const rejectedIds: number[] = [];
    const matches: Array<{ id: number; keyword: string }> = [];
    for (const gap of pendingGaps) {
      const match = findOffBrandMatch(gap.painPointTitle, gap.painPointDescription, gap.vocabularyQuotes || [], gap.emotionalIntensity);
      if (!match) continue;
      rejectedIds.push(gap.id);
      matches.push({ id: gap.id, keyword: match });
    }
    if (rejectedIds.length > 0) {
      await db.update(ytExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(inArray(ytExtractedGaps.id, rejectedIds));
    }
    json(res, 200, { success: true, processed: pendingGaps.length, rejectedCount: rejectedIds.length, matches });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'gaps' && segments[4] && segments[5] === 'approve') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });
    const [gap] = await db.select().from(ytExtractedGaps).where(and(eq(ytExtractedGaps.id, id), ytGapScope(site.id))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    if (!['pending', 'rejected'].includes(gap.status)) return json(res, 400, { error: 'Gap already processed' });
    const body = await readJsonBody(req);
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : (typeof body.author_notes === 'string' ? body.author_notes : '');
    const sourceComments = await ytSourceComments((gap.sourceCommentIds || []).slice(0, 5));
    const gapDescription = [
      `Problem Context\n${gap.painPointDescription}`,
      gap.sourceVideoTitle ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed` : '',
      sourceComments.length > 0 ? `\n\nRepresentative Voices\n${sourceComments.map((comment) => `- "${String(comment.commentText ?? '').slice(0, 150)}" (${comment.voteCount} votes)`).join('\n')}` : '',
      gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
    ].filter(Boolean).join('');
    const [contentGap] = await db.insert(contentGaps).values({
      siteId: site.id,
      gapTitle: gap.painPointTitle,
      gapDescription,
      confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
      suggestedAngle: gap.suggestedArticleAngle,
      relatedQueries: gap.vocabularyQuotes,
      sourceModels: ['youtube-apify', 'claude-sonnet'],
      authorNotes: authorNotes || null,
      status: 'new',
    }).returning();
    await db.update(ytExtractedGaps).set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id }).where(eq(ytExtractedGaps.id, id));
    json(res, 200, { ok: true, contentGapId: contentGap.id });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'gaps' && segments[4] && segments[5] === 'reject') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });
    await db.update(ytExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(ytExtractedGaps.id, id), ytGapScope(site.id)));
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}
