import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, firstQueryValue,
  requireActiveSite, requireAuth, enqueueDraftJob, enqueueAppJob,
  gapScope, bcProjectScope, ytTargetScope, redditTargetScope,
  db, and, desc, eq, inArray, sql,
  appJobs, contentGaps, bcProjects, bcIterations, bcExtractedPainPoints, bcPainPointScope,
  bcIterationSelections,
  redditTargets, redditScrapeRuns, ytTargets, ytScrapeRuns,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'POST' && pathname === '/v1/jobs/draft') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const gapId = Number(body.gapId ?? 0);
    if (!gapId) return json(res, 400, { error: 'gapId is required' }), true;
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' }), true;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'draft'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`)).limit(1);
    if (existingJob) return json(res, 409, { error: 'Draft job already active for this gap', jobId: existingJob.id }), true;
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : '';
    const job = await enqueueDraftJob(site.id, gapId, typeof body.model === 'string' ? body.model : 'anthropic/claude-sonnet-4-6', authorNotes);
    await db.update(contentGaps).set({ status: 'in_progress', authorNotes: authorNotes || gap.authorNotes, acknowledgedAt: new Date() }).where(eq(contentGaps.id, gapId));
    json(res, 202, { jobId: job.id, status: job.status });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/geo') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'geo'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'Geo job already active for this site', jobId: existingJob.id }), true;
    const [job] = await db.insert(appJobs).values({ siteId: site.id, type: 'geo', topic: 'geo', payload: {} }).returning();
    json(res, 202, { jobId: job.id, status: job.status });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/reddit') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'reddit'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'Reddit job already active for this site', status: 'running', jobId: existingJob.id }), true;

    let targets = Array.isArray(body.targets)
      ? body.targets.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    if (targets.length === 0) {
      const active = await db.select({ value: redditTargets.value }).from(redditTargets).where(and(redditTargetScope(site.id), eq(redditTargets.isActive, true)));
      targets = active.map((row) => row.value);
    }
    if (targets.length === 0) return json(res, 400, { error: 'No active targets configured' }), true;

    const [run] = await db.insert(redditScrapeRuns).values({
      siteId: site.id,
      status: 'running',
      targetsScraped: targets,
    }).returning({ id: redditScrapeRuns.id });

    const [job] = await db.insert(appJobs).values({
      siteId: site.id,
      type: 'reddit',
      topic: 'reddit',
      payload: { runId: run.id, targets, siteId: site.id },
    }).returning();

    json(res, 202, { runId: run.id, jobId: job.id, status: 'started', targetsCount: targets.length });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/youtube') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'youtube'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'YouTube job already active for this site', status: 'running', jobId: existingJob.id }), true;

    let targetIds = Array.isArray(body.targetIds) ? body.targetIds.map((entry) => Number(entry)).filter(Boolean) : [];
    const targets = targetIds.length
      ? await db.select().from(ytTargets).where(and(ytTargetScope(site.id), inArray(ytTargets.id, targetIds)))
      : await db.select().from(ytTargets).where(and(ytTargetScope(site.id), eq(ytTargets.isActive, true)));
    if (targets.length === 0) return json(res, 400, { error: 'No active targets configured' }), true;

    const [run] = await db.insert(ytScrapeRuns).values({
      siteId: site.id,
      status: 'running',
      targetsScraped: targets.map((target) => target.label),
    }).returning({ id: ytScrapeRuns.id });

    const [job] = await db.insert(appJobs).values({
      siteId: site.id,
      type: 'youtube',
      topic: 'youtube',
      payload: { runId: run.id, targetIds: targets.map((target) => target.id), siteId: site.id },
    }).returning();

    json(res, 202, { runId: run.id, jobId: job.id, status: 'started', targetsCount: targets.length });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-scrape') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    if (!projectId) return json(res, 400, { error: 'projectId is required' }), true;

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' }), true;

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-scrape'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity scrape job already active for this project', jobId: existingJob.id, status: existingJob.status }), true;

    const [job] = await db.insert(appJobs).values({
      siteId: site.id,
      type: 'bc-scrape',
      topic: 'bc-scrape',
      payload: {
        siteId: site.id,
        projectId,
        videoId: body.videoId ? Number(body.videoId) : null,
      },
    }).returning();

    await db.update(bcProjects).set({ status: 'scraping', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    json(res, 202, { jobId: job.id, projectId, status: job.status });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-parse') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    if (!projectId) return json(res, 400, { error: 'projectId is required' }), true;

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' }), true;

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-parse'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity parse job already active for this project', jobId: existingJob.id, status: existingJob.status }), true;

    const job = await enqueueAppJob(site.id, 'bc-parse', 'bc-parse', { siteId: site.id, projectId });
    await db.update(bcProjects).set({ status: 'parsing', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    json(res, 202, { jobId: job.id, projectId, status: job.status });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-selector') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = Number(body.iterationId ?? 0);
    if (!projectId || !iterationId) return json(res, 400, { error: 'projectId and iterationId are required' }), true;

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' }), true;
    const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
    if (!iteration) return json(res, 404, { error: 'Iteration not found' }), true;
    if (!iteration.intention?.trim()) return json(res, 400, { error: 'Set an intention before selecting pain points' }), true;

    const approved = await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      bcPainPointScope(site.id),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));
    if (approved.length === 0) return json(res, 400, { error: 'No approved pain points — approve some first' }), true;

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-selector'),
      inArray(appJobs.status, ['pending', 'running']),
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity selector job already active', jobId: existingJob.id, status: existingJob.status }), true;

    const job = await enqueueAppJob(site.id, 'bc-selector', 'bc-selector', { siteId: site.id, projectId, iterationId });
    await db.update(bcIterations).set({ status: 'selecting' }).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.siteId, site.id)));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status, approvedCount: approved.length });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-cluster') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = body.iterationId ? Number(body.iterationId) : null;
    if (!projectId) return json(res, 400, { error: 'projectId is required' }), true;

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' }), true;
    if (iterationId) {
      const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
      if (!iteration) return json(res, 404, { error: 'Iteration not found' }), true;
    }

    const pointCount = iterationId
      ? (await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iterationId))).length
      : (await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
          eq(bcExtractedPainPoints.projectId, projectId),
          bcPainPointScope(site.id),
          eq(bcExtractedPainPoints.status, 'approved'),
        ))).length;
    if (pointCount < 2) return json(res, 400, { error: 'Need at least 2 pain points to cluster' }), true;

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-cluster'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity cluster job already active for this project', jobId: existingJob.id, status: existingJob.status }), true;

    const job = await enqueueAppJob(site.id, 'bc-cluster', 'bc-cluster', {
      siteId: site.id,
      projectId,
      ...(iterationId ? { iterationId } : {}),
    });
    if (iterationId) await db.update(bcIterations).set({ status: 'clustering' }).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.siteId, site.id)));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-generate') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = body.iterationId ? Number(body.iterationId) : null;
    if (!projectId) return json(res, 400, { error: 'projectId is required' }), true;

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' }), true;
    if (!project.lpStructureJson) return json(res, 400, { error: 'lpStructureJson missing — run LP parser first' }), true;
    if (iterationId) {
      const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
      if (!iteration) return json(res, 404, { error: 'Iteration not found' }), true;
    }

    const approved = await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      bcPainPointScope(site.id),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));
    if (approved.length === 0) return json(res, 400, { error: 'No approved pain points — approve pain points first' }), true;

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-generate'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity generate job already active for this project', jobId: existingJob.id, status: existingJob.status }), true;

    const job = await enqueueAppJob(site.id, 'bc-generate', 'bc-generate', {
      siteId: site.id,
      projectId,
      ...(iterationId ? { iterationId } : {}),
    });
    await db.update(bcProjects).set({ status: 'generating', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    if (iterationId) await db.update(bcIterations).set({ status: 'generating' }).where(eq(bcIterations.id, iterationId));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'jobs' && segments[2] && segments[2] !== 'active' && segments[2] !== 'latest') {
    const session = await requireAuth(req, res);
    if (!session) return true;
    const jobId = Number(segments[2]);
    if (!jobId) return json(res, 400, { error: 'Invalid job id' }), true;
    const [job] = await db.select().from(appJobs).where(eq(appJobs.id, jobId)).limit(1);
    if (!job) return json(res, 404, { error: 'Job not found' }), true;
    if (session.siteId && job.siteId && session.siteId !== job.siteId) return json(res, 403, { error: 'Forbidden for selected job' }), true;
    json(res, 200, job);
    return true;
  }

  if (method === 'GET' && pathname === '/v1/jobs/latest') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'draft';
    const [job] = await db.select()
      .from(appJobs)
      .where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, topic)))
      .orderBy(desc(appJobs.createdAt))
      .limit(1);

    json(res, 200, {
      job: job ?? null,
    });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/jobs/active') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'draft';
    const [job] = await db.select()
      .from(appJobs)
      .where(and(
        eq(appJobs.siteId, site.id),
        eq(appJobs.topic, topic),
        inArray(appJobs.status, ['pending', 'running']),
      ))
      .orderBy(desc(appJobs.createdAt))
      .limit(1);

    json(res, 200, {
      running: Boolean(job),
      job: job ?? null,
    });
    return true;
  }

  if (method === 'DELETE' && pathname === '/v1/jobs/active') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'draft';

    const activeJobs = await db.select()
      .from(appJobs)
      .where(and(
        eq(appJobs.siteId, site.id),
        eq(appJobs.topic, topic),
        inArray(appJobs.status, ['pending', 'running']),
      ));

    const cancelled = await db.update(appJobs).set({
      status: 'cancelled',
      error: `Cancelled manually via API for topic=${topic}`,
      lockedAt: null,
      workerName: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, topic),
      inArray(appJobs.status, ['pending', 'running']),
    )).returning({ id: appJobs.id });

    if (topic === 'draft') {
      const gapIds = activeJobs
        .map((job) => Number((job.payload ?? {}).gapId ?? 0))
        .filter(Boolean);

      if (gapIds.length > 0) {
        await db.update(contentGaps).set({
          status: 'new',
          acknowledgedAt: null,
        }).where(and(inArray(contentGaps.id, gapIds), eq(contentGaps.siteId, site.id)));
      }
    }

    json(res, 200, {
      success: true,
      cancelledCount: cancelled.length,
      topic,
    });
    return true;
  }

  return false;
}
