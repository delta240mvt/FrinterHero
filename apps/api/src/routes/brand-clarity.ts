import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, firstQueryValue,
  requireActiveSite, resolveBcProjectContext, enqueueAppJob, runBcScript,
  bcProjectScope, bcChannelScope, bcVideoScope, bcPainPointScope, bcClusterScope,
  db, and, asc, desc, eq, inArray, isNull, or, sql,
  bcProjects, bcTargetChannels, bcTargetVideos, bcExtractedPainPoints, bcIterations, bcIterationSelections, bcPainClusters, bcLandingPageVariants, bcSettings, appJobs,
} from '../helpers.js';
import { BC_SETTINGS_DEFAULTS, getBcSettings, saveBcSettings, buildLlmEnv } from '../../../../src/lib/bc-settings';
import { findOffBrandMatch } from '../../../../src/utils/brandFilter';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/bc/settings') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    json(res, 200, await getBcSettings(context.site.id));
    return true;
  }

  if (method === 'PUT' && pathname === '/v1/admin/bc/settings') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    const config = {
      provider: (body.provider === 'anthropic' ? 'anthropic' : 'openrouter') as 'anthropic' | 'openrouter',
      lpModel: String(body.lpModel || BC_SETTINGS_DEFAULTS.lpModel),
      scraperModel: String(body.scraperModel || BC_SETTINGS_DEFAULTS.scraperModel),
      clusterModel: String(body.clusterModel || BC_SETTINGS_DEFAULTS.clusterModel),
      generatorModel: String(body.generatorModel || BC_SETTINGS_DEFAULTS.generatorModel),
      extendedThinkingEnabled: Boolean(body.extendedThinkingEnabled),
      lpThinkingBudget: Math.max(1024, Number(body.lpThinkingBudget || BC_SETTINGS_DEFAULTS.lpThinkingBudget)),
      scraperThinkingBudget: Math.max(1024, Number(body.scraperThinkingBudget || BC_SETTINGS_DEFAULTS.scraperThinkingBudget)),
      clusterThinkingBudget: Math.max(1024, Number(body.clusterThinkingBudget || BC_SETTINGS_DEFAULTS.clusterThinkingBudget)),
      generatorThinkingBudget: Math.max(1024, Number(body.generatorThinkingBudget || BC_SETTINGS_DEFAULTS.generatorThinkingBudget)),
      lpMaxTokens: Math.max(512, Number(body.lpMaxTokens || BC_SETTINGS_DEFAULTS.lpMaxTokens)),
      scraperMaxTokens: Math.max(512, Number(body.scraperMaxTokens || BC_SETTINGS_DEFAULTS.scraperMaxTokens)),
      clusterMaxTokens: Math.max(512, Number(body.clusterMaxTokens || BC_SETTINGS_DEFAULTS.clusterMaxTokens)),
      generatorMaxTokens: Math.max(512, Number(body.generatorMaxTokens || BC_SETTINGS_DEFAULTS.generatorMaxTokens)),
    };
    await saveBcSettings(config, context.site.id);
    json(res, 200, { ok: true, config });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/admin/bc/projects') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const projects = await db.select().from(bcProjects).where(bcProjectScope(context.site.id)).orderBy(desc(bcProjects.createdAt));
    json(res, 200, projects);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/bc/projects') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const founderDescription = typeof body.founderDescription === 'string' ? body.founderDescription.trim() : '';
    const lpRawInput = typeof body.lpRawInput === 'string' ? body.lpRawInput.trim() : '';
    if (!name || !founderDescription || !lpRawInput) return json(res, 400, { error: 'name, founderDescription, lpRawInput required' });
    const [project] = await db.insert(bcProjects).values({
      siteId: context.site.id,
      name: name.substring(0, 255),
      founderDescription,
      founderVision: typeof body.founderVision === 'string' ? body.founderVision : null,
      lpRawInput,
      projectDocumentation: typeof body.projectDocumentation === 'string' ? body.projectDocumentation.trim() : null,
      status: 'parsing',
    }).returning();
    const job = await enqueueAppJob(context.site.id, 'bc-parse', 'bc-parse', {
      siteId: context.site.id,
      projectId: project.id,
    });
    json(res, 201, { project: { ...project, status: 'parsing' }, parsingStarted: true, jobId: job.id });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && !segments[5]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId: id } = context;

    if (method === 'GET') {
      const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, id), bcProjectScope(site.id))).limit(1);
      if (!project) return json(res, 404, { error: 'Not found' });
      json(res, 200, project);
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = String(body.name).trim().substring(0, 255);
      if (body.founderDescription !== undefined) updates.founderDescription = body.founderDescription;
      if (body.founderVision !== undefined) updates.founderVision = body.founderVision;
      if (body.lpRawInput !== undefined) updates.lpRawInput = body.lpRawInput;
      if (body.status !== undefined) updates.status = body.status;
      if (body.nicheKeywords !== undefined) updates.nicheKeywords = Array.isArray(body.nicheKeywords) ? body.nicheKeywords.map((item) => String(item).trim()).filter(Boolean) : [];
      const [updated] = await db.update(bcProjects).set(updates).where(and(eq(bcProjects.id, id), bcProjectScope(site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(bcProjects).where(and(eq(bcProjects.id, id), bcProjectScope(site.id)));
      json(res, 200, { deleted: true });
      return true;
    }
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'documentation') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId: id } = context;
    const body = await readJsonBody(req);
    const projectDocumentation = typeof body.projectDocumentation === 'string' ? body.projectDocumentation.trim() : '';
    if (!projectDocumentation) return json(res, 400, { error: 'projectDocumentation required' });
    const [updated] = await db.update(bcProjects).set({
      projectDocumentation,
      status: 'parsing',
      updatedAt: new Date(),
    }).where(and(eq(bcProjects.id, id), bcProjectScope(site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Not found' });
    const [existingJob] = await db.select({ id: appJobs.id }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-parse'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(id)}`,
    )).limit(1);
    const jobId = existingJob?.id ?? (await enqueueAppJob(site.id, 'bc-parse', 'bc-parse', {
      siteId: site.id,
      projectId: id,
    })).id;
    json(res, 200, { updated: true, parsingStarted: true, jobId });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;

    if (method === 'GET') {
      const channels = await db.select().from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id))).orderBy(asc(bcTargetChannels.sortOrder));
      json(res, 200, channels);
      return true;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
      const channelName = typeof body.channelName === 'string' ? body.channelName.trim() : '';
      const channelUrl = typeof body.channelUrl === 'string' ? body.channelUrl.trim() : '';
      if (!channelId || !channelName || !channelUrl) return json(res, 400, { error: 'channelId, channelName, channelUrl required' });
      const existing = await db.select({ sortOrder: bcTargetChannels.sortOrder }).from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
      const nextOrder = existing.length ? Math.max(...existing.map((row) => row.sortOrder)) + 1 : 0;
      const [channel] = await db.insert(bcTargetChannels).values({
        siteId: site.id,
        projectId,
        channelId,
        channelName: channelName.substring(0, 255),
        channelUrl,
        channelHandle: typeof body.channelHandle === 'string' ? body.channelHandle.trim() : null,
        subscriberCount: body.subscriberCount ? Number(body.subscriberCount) : null,
        description: typeof body.description === 'string' ? body.description.trim() : null,
        discoveryMethod: 'manual',
        isConfirmed: true,
        sortOrder: nextOrder,
      }).returning();
      json(res, 201, channel);
      return true;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const channelRowId = Number(segments[6]);
    if (!channelRowId) return json(res, 400, { error: 'Invalid params' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, unknown> = {};
      if (body.isConfirmed !== undefined) updates.isConfirmed = Boolean(body.isConfirmed);
      if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
      if (body.channelName !== undefined) updates.channelName = String(body.channelName).substring(0, 255);
      const [updated] = await db.update(bcTargetChannels).set(updates).where(and(eq(bcTargetChannels.id, channelRowId), eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(bcTargetChannels).where(and(eq(bcTargetChannels.id, channelRowId), eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
      json(res, 200, { deleted: true });
      return true;
    }
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && segments[6] === 'confirm-all') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    await db.update(bcTargetChannels).set({ isConfirmed: true }).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
    await db.update(bcProjects).set({ status: 'videos_pending', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    const confirmed = await db.select({ id: bcTargetChannels.id }).from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
    json(res, 200, { confirmed: confirmed.length });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;

    if (method === 'GET') {
      const videos = await db.select({
        id: bcTargetVideos.id,
        videoId: bcTargetVideos.videoId,
        videoUrl: bcTargetVideos.videoUrl,
        title: bcTargetVideos.title,
        description: bcTargetVideos.description,
        viewCount: bcTargetVideos.viewCount,
        commentCount: bcTargetVideos.commentCount,
        relevanceScore: bcTargetVideos.relevanceScore,
        publishedAt: bcTargetVideos.publishedAt,
        channelName: bcTargetChannels.channelName,
        channelUrl: bcTargetChannels.channelUrl,
        isSelected: bcTargetVideos.isSelected,
      }).from(bcTargetVideos).innerJoin(bcTargetChannels, eq(bcTargetVideos.channelId, bcTargetChannels.id)).where(and(eq(bcTargetVideos.projectId, projectId), bcVideoScope(site.id), bcChannelScope(site.id)));
      json(res, 200, videos);
      return true;
    }
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const videoRowId = Number(segments[6]);
    if (!videoRowId) return json(res, 400, { error: 'Invalid params' });
    const body = await readJsonBody(req);
    if (body.isSelected === undefined) return json(res, 400, { error: 'isSelected required' });
    const [updated] = await db.update(bcTargetVideos).set({ isSelected: Boolean(body.isSelected) }).where(and(eq(bcTargetVideos.id, videoRowId), eq(bcTargetVideos.projectId, projectId), bcVideoScope(site.id))).returning({ id: bcTargetVideos.id, isSelected: bcTargetVideos.isSelected });
    if (!updated) return json(res, 404, { error: 'Not found' });
    json(res, 200, updated);
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && segments[6] === 'add-manual') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const body = await readJsonBody(req);
    const urlValue = typeof body.url === 'string' ? body.url.trim() : '';
    if (!urlValue) return json(res, 400, { error: 'URL required' });
    let videoId = null;
    try {
      const parsed = new URL(urlValue);
      if (parsed.hostname === 'youtu.be') videoId = parsed.pathname.slice(1).split('?')[0] || null;
      if (!videoId) videoId = parsed.searchParams.get('v');
      if (!videoId) {
        const shorts = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shorts) videoId = shorts[1];
      }
      if (!videoId) {
        const embed = parsed.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
        if (embed) videoId = embed[1];
      }
    } catch {}
    if (!videoId) return json(res, 400, { error: 'Could not parse YouTube video ID from URL' });
    const ytKey = process.env.YOUTUBE_API_KEY;
    if (!ytKey) return json(res, 500, { error: 'YOUTUBE_API_KEY not configured' });
    const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    ytUrl.searchParams.set('part', 'snippet,statistics');
    ytUrl.searchParams.set('id', videoId);
    ytUrl.searchParams.set('key', ytKey);
    const ytRes = await fetch(ytUrl.toString());
    if (!ytRes.ok) {
      const err = await ytRes.json().catch(() => ({}));
      return json(res, 502, { error: err?.error?.message ?? `YouTube API ${ytRes.status}` });
    }
    const ytData = await ytRes.json();
    const item = ytData?.items?.[0];
    if (!item) return json(res, 404, { error: 'Video not found on YouTube' });
    const snippet = item.snippet;
    const stats = item.statistics;
    const ytChannelId = snippet.channelId;
    const ytChannelTitle = snippet.channelTitle;
    const [existingVideo] = await db.select({ id: bcTargetVideos.id }).from(bcTargetVideos).where(and(eq(bcTargetVideos.projectId, projectId), eq(bcTargetVideos.videoId, videoId), bcVideoScope(site.id)));
    if (existingVideo) return json(res, 409, { error: 'Video already added to this project' });
    let [channel] = await db.select().from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), eq(bcTargetChannels.channelId, ytChannelId), bcChannelScope(site.id)));
    if (!channel) {
      [channel] = await db.insert(bcTargetChannels).values({
        siteId: site.id,
        projectId,
        channelId: ytChannelId,
        channelName: ytChannelTitle,
        channelUrl: `https://www.youtube.com/channel/${ytChannelId}`,
        isConfirmed: true,
      }).returning();
    }
    const [inserted] = await db.insert(bcTargetVideos).values({
      siteId: site.id,
      projectId,
      channelId: channel.id,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: (snippet.title || videoId).substring(0, 500),
      description: snippet.description ? String(snippet.description).substring(0, 500) : null,
      viewCount: parseInt(stats?.viewCount || '0', 10) || null,
      commentCount: parseInt(stats?.commentCount || '0', 10) || null,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
      relevanceScore: 0.5,
      isSelected: true,
    }).returning({ id: bcTargetVideos.id, videoId: bcTargetVideos.videoId, title: bcTargetVideos.title });
    json(res, 200, {
      id: inserted.id,
      videoId: inserted.videoId,
      title: inserted.title,
      channelName: ytChannelTitle,
      channelId: channel.id,
      viewCount: parseInt(stats?.viewCount || '0', 10) || 0,
      commentCount: parseInt(stats?.commentCount || '0', 10) || 0,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'discover-channels') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (!project.nicheKeywords || !(project.nicheKeywords as string[]).length) {
      return json(res, 400, { error: 'nicheKeywords not set — run LP parser first' });
    }
    const result = await runBcScript(['scripts/bc-channel-discovery.ts'], { BC_PROJECT_ID: String(projectId) }, /CHANNELS_FOUND:(\d+)/, 'QUOTA_EXCEEDED');
    if (result.error) return json(res, 500, { error: result.error, logs: result.logs });
    json(res, 200, { channelsFound: result.count, logs: result.logs });
    return true;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'discover-videos') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const confirmed = await db.select({ id: bcTargetChannels.id }).from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id), eq(bcTargetChannels.isConfirmed, true)));
    if (!confirmed.length) return json(res, 400, { error: 'No confirmed channels — confirm channels first' });
    const result = await runBcScript(['scripts/bc-video-discovery.ts'], { BC_PROJECT_ID: String(projectId) }, /VIDEOS_FOUND:(\d+)/, 'QUOTA_EXCEEDED');
    if (result.error) return json(res, 500, { error: result.error, logs: result.logs });
    json(res, 200, { videosFound: result.count, logs: result.logs });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;

    if (method === 'GET') {
      const statusFilter = url.searchParams.get('status');
      const condition = statusFilter && statusFilter !== 'all'
        ? and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, statusFilter))
        : and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id));
      const painPoints = await db.select().from(bcExtractedPainPoints).where(condition).orderBy(desc(bcExtractedPainPoints.emotionalIntensity));
      json(res, 200, painPoints);
      return true;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const painPointId = Number(segments[6]);
    if (!painPointId) return json(res, 400, { error: 'Invalid params' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const validStatuses = ['pending', 'approved', 'rejected'];
      const nextStatus = String(body.status);
      if (!validStatuses.includes(nextStatus)) return json(res, 400, { error: `status must be one of: ${validStatuses.join(', ')}` });
      const [updated] = await db.update(bcExtractedPainPoints).set({ status: nextStatus }).where(and(eq(bcExtractedPainPoints.id, painPointId), eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.id, painPointId), eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id)));
      json(res, 200, { deleted: true });
      return true;
    }
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && segments[6] === 'auto-filter') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const pending = await db.select().from(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, 'pending')));
    let rejected = 0;
    let approved = 0;
    for (const pp of pending) {
      const offBrand = findOffBrandMatch(pp.painPointTitle, pp.painPointDescription, pp.vocabularyQuotes, pp.emotionalIntensity);
      const newStatus = offBrand ? 'rejected' : 'approved';
      await db.update(bcExtractedPainPoints).set({ status: newStatus }).where(and(eq(bcExtractedPainPoints.id, pp.id), bcPainPointScope(site.id)));
      if (offBrand) rejected += 1; else approved += 1;
    }
    json(res, 200, { processed: pending.length, approved, rejected });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;

    if (method === 'GET') {
      const iterations = await db.select().from(bcIterations).where(and(eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).orderBy(desc(bcIterations.createdAt));
      const result = await Promise.all(iterations.map(async (iteration) => {
        const sels = await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iteration.id));
        return { ...iteration, selectionCount: sels.length };
      }));
      json(res, 200, { iterations: result });
      return true;
    }

    if (method === 'POST') {
      const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
      if (!project) return json(res, 404, { error: 'Project not found' });
      const body = await readJsonBody(req);
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `Iteracja ${new Date().toLocaleDateString('pl-PL')}`;
      const [iteration] = await db.insert(bcIterations).values({
        siteId: site.id,
        projectId,
        name,
        intention: typeof body.intention === 'string' ? body.intention.trim() || null : null,
        status: 'draft',
      }).returning();
      json(res, 201, { iteration });
      return true;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const iterationId = Number(segments[6]);
    if (!iterationId) return json(res, 400, { error: 'Invalid ids' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.intention !== undefined) updates.intention = String(body.intention).trim() || null;
      if (!Object.keys(updates).length) return json(res, 400, { error: 'No fields to update' });
      const [updated] = await db.update(bcIterations).set(updates).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, { iteration: updated });
      return true;
    }

    if (method === 'DELETE') {
      await db.delete(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId))));
      json(res, 200, { deleted: true });
      return true;
    }
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && segments[7] === 'selections') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const iterationId = Number(segments[6]);
    if (!iterationId) return json(res, 400, { error: 'Invalid ids' });
    const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).limit(1);
    if (!iteration) return json(res, 404, { error: 'Iteration not found' });
    const rows = await db.select({
      selId: bcIterationSelections.id,
      rank: bcIterationSelections.rank,
      selectionReason: bcIterationSelections.selectionReason,
      pp: {
        id: bcExtractedPainPoints.id,
        painPointTitle: bcExtractedPainPoints.painPointTitle,
        painPointDescription: bcExtractedPainPoints.painPointDescription,
        emotionalIntensity: bcExtractedPainPoints.emotionalIntensity,
        category: bcExtractedPainPoints.category,
        customerLanguage: bcExtractedPainPoints.customerLanguage,
        desiredOutcome: bcExtractedPainPoints.desiredOutcome,
        vocabularyQuotes: bcExtractedPainPoints.vocabularyQuotes,
        vocData: bcExtractedPainPoints.vocData,
        status: bcExtractedPainPoints.status,
      },
    }).from(bcIterationSelections).innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id)).where(eq(bcIterationSelections.iterationId, iterationId)).orderBy(asc(bcIterationSelections.rank));
    json(res, 200, { iteration, selections: rows });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && segments[7] === 'detail') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const iterationId = Number(segments[6]);
    if (!iterationId) return json(res, 400, { error: 'Invalid ids' });
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).limit(1);
    if (!iteration) return json(res, 404, { error: 'Iteration not found' });
    const [selections, clusters, approved] = await Promise.all([
      db.select({
        selId: bcIterationSelections.id,
        rank: bcIterationSelections.rank,
        selectionReason: bcIterationSelections.selectionReason,
        pp: {
          id: bcExtractedPainPoints.id,
          painPointTitle: bcExtractedPainPoints.painPointTitle,
          emotionalIntensity: bcExtractedPainPoints.emotionalIntensity,
          category: bcExtractedPainPoints.category,
          customerLanguage: bcExtractedPainPoints.customerLanguage,
          desiredOutcome: bcExtractedPainPoints.desiredOutcome,
          vocabularyQuotes: bcExtractedPainPoints.vocabularyQuotes,
        },
      }).from(bcIterationSelections).innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id)).where(eq(bcIterationSelections.iterationId, iterationId)).orderBy(asc(bcIterationSelections.rank)),
      db.select().from(bcPainClusters).where(eq(bcPainClusters.iterationId, iterationId)),
      db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, 'approved'))),
    ]);
    json(res, 200, { project, iteration, selections, clusters, approvedCount: approved.length });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const variants = await db.select({
      id: bcLandingPageVariants.id,
      variantType: bcLandingPageVariants.variantType,
      variantLabel: bcLandingPageVariants.variantLabel,
      improvementSuggestions: bcLandingPageVariants.improvementSuggestions,
      generationModel: bcLandingPageVariants.generationModel,
      isSelected: bcLandingPageVariants.isSelected,
      createdAt: bcLandingPageVariants.createdAt,
      featurePainMap: bcLandingPageVariants.featurePainMap,
    }).from(bcLandingPageVariants).where(and(eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).orderBy(asc(bcLandingPageVariants.createdAt));
    json(res, 200, variants);
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants-list') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const [project] = await db.select({ status: bcProjects.status }).from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    const variants = await db.select({
      id: bcLandingPageVariants.id,
      variantType: bcLandingPageVariants.variantType,
      variantLabel: bcLandingPageVariants.variantLabel,
      isSelected: bcLandingPageVariants.isSelected,
      generationModel: bcLandingPageVariants.generationModel,
      improvementSuggestions: bcLandingPageVariants.improvementSuggestions,
      featurePainMap: bcLandingPageVariants.featurePainMap,
      createdAt: bcLandingPageVariants.createdAt,
    }).from(bcLandingPageVariants).where(and(eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).orderBy(asc(bcLandingPageVariants.createdAt));
    json(res, 200, { variants, projectStatus: project?.status ?? 'unknown' });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const variantId = Number(segments[6]);
    if (!variantId) return json(res, 400, { error: 'Invalid params' });
    if (method === 'GET') {
      const [variant] = await db.select().from(bcLandingPageVariants).where(and(eq(bcLandingPageVariants.id, variantId), eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).limit(1);
      if (!variant) return json(res, 404, { error: 'Not found' });
      json(res, 200, variant);
      return true;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, any> = {};
      if (body.isSelected !== undefined) updates.isSelected = Boolean(body.isSelected);
      if (!Object.keys(updates).length) return json(res, 400, { error: 'No fields to update' });
      const [updated] = await db.update(bcLandingPageVariants).set(updates).where(and(eq(bcLandingPageVariants.id, variantId), eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return true;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'scrape-data') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Not found' });
    const [painPoints, clusters, selectedVideos, rawIterations] = await Promise.all([
      db.select().from(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id))).orderBy(desc(bcExtractedPainPoints.emotionalIntensity)),
      db.select().from(bcPainClusters).where(and(eq(bcPainClusters.projectId, projectId), bcClusterScope(site.id), isNull(bcPainClusters.iterationId))),
      db.select({
        id: bcTargetVideos.id,
        videoId: bcTargetVideos.videoId,
        videoUrl: bcTargetVideos.videoUrl,
        title: bcTargetVideos.title,
        viewCount: bcTargetVideos.viewCount,
        commentCount: bcTargetVideos.commentCount,
        isScraped: bcTargetVideos.isScraped,
        channelName: bcTargetChannels.channelName,
      }).from(bcTargetVideos).innerJoin(bcTargetChannels, eq(bcTargetVideos.channelId, bcTargetChannels.id)).where(and(eq(bcTargetVideos.projectId, projectId), bcVideoScope(site.id), bcChannelScope(site.id), eq(bcTargetVideos.isSelected, true))),
      db.select().from(bcIterations).where(and(eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).orderBy(desc(bcIterations.createdAt)),
    ]);
    const iterations = await Promise.all(rawIterations.map(async (iteration) => {
      const sels = await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iteration.id));
      return { ...iteration, selectionCount: sels.length };
    }));
    json(res, 200, { project, painPoints, clusters, selectedVideos, iterations });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'job-status') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'bc-parse';
    const iterationId = firstQueryValue(url, 'iterationId', 'iteration_id');
    const jobs = await db.select().from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, topic))).orderBy(desc(appJobs.createdAt)).limit(20);
    const scoped = jobs.find((job) => {
      if (Number(job.payload?.projectId ?? 0) !== projectId) return false;
      if (!iterationId) return true;
      return Number(job.payload?.iterationId ?? 0) === Number(iterationId);
    }) ?? null;
    json(res, 200, { job: scoped });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'cluster-pain-points') {
    const context = await resolveBcProjectContext(req, res, segments[4]);
    if (!context) return true;
    const { site, projectId } = context;

    if (method === 'GET') {
      const clusters = await db.select().from(bcPainClusters).where(and(eq(bcPainClusters.projectId, projectId), bcClusterScope(site.id), isNull(bcPainClusters.iterationId)));
      json(res, 200, { clusters });
      return true;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const iterationId = body.iterationId ? Number(body.iterationId) : undefined;
      const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
      if (!project) return json(res, 404, { error: 'Project not found' });

      let pointCount = 0;
      if (iterationId) {
        pointCount = (await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iterationId))).length;
      } else {
        pointCount = (await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, 'approved')))).length;
      }
      if (pointCount < 2) return json(res, 400, { error: 'Need at least 2 pain points to cluster' });

      const llmSettings = await getBcSettings(site.id);
      const result = await runBcScript(['scripts/bc-pain-clusterer.ts'], {
        BC_PROJECT_ID: String(projectId),
        ...(iterationId ? { BC_ITERATION_ID: String(iterationId) } : {}),
        ...buildLlmEnv(llmSettings),
      }, /CLUSTERS_CREATED:(\d+)/);
      if (result.error) return json(res, 500, { error: result.error, logs: result.logs });

      const clusters = iterationId
        ? await db.select().from(bcPainClusters).where(eq(bcPainClusters.iterationId, iterationId))
        : await db.select().from(bcPainClusters).where(and(eq(bcPainClusters.projectId, projectId), bcClusterScope(site.id), isNull(bcPainClusters.iterationId)));

      json(res, 200, { clustersCreated: result.count, logs: result.logs, clusters });
      return true;
    }
  }

  return false;
}
