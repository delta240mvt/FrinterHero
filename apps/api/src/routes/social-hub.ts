import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, toPositiveInt, toNonNegativeInt, firstQueryValue,
  resolveShSite, resolveShBriefContext, requireActiveSite,
  shPreview, shFormatMeta, parseShSuggestionPrompt, normalizeShViralEnginePayload, encodeShSuggestionPrompt,
  findActiveJobByPayload, findLatestJobByPayload, fetchUploadPostMetrics, enqueueAppJob,
  shAccountScope, shBriefScope, shCopyScope, shTemplateScope, shMediaScope, shPublishScope, shMetricsScope, shQueueScope,
  articleScope, kbScope, gapScope, bcPainPointScope, bcClusterScope, redditGapScope, ytGapScope,
  SH_TEMPLATE_REQUIRED_FIELDS,
  db, and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql,
  shSocialAccounts, shTemplates, shContentBriefs, shGeneratedCopy, shMediaAssets, shPublishLog, shPostMetrics, shQueue, shSettings,
  articles, bcExtractedPainPoints, bcPainClusters, contentGaps, knowledgeEntries, redditExtractedGaps, ytExtractedGaps, appJobs,
} from '../helpers.js';
import { getDefaultTemplates, renderSocialImage } from '../../../../src/lib/sh-image-gen';
import { matchKbEntries } from '../../../../src/lib/sh-kb-matcher';
import { loadSource } from '../../../../src/lib/sh-source-loader';
import { SH_SETTINGS_DEFAULTS, getShSettings, normalizeShSettingsConfig, saveShSettings } from '../../../../src/lib/sh-settings';
import { SOURCE_TYPES, isValidSourceType } from '../../../../src/lib/sh-source-types';
import { publishBrief } from '../../../../src/lib/sh-distributor';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/social-hub/settings') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    json(res, 200, await getShSettings(context.site.id));
    return true;
  }

  if (method === 'PUT' && pathname === '/v1/social-hub/settings') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    const config = normalizeShSettingsConfig(body);
    await saveShSettings(config, context.site.id);
    json(res, 200, { ok: true, config });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/accounts') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const accounts = await db.select().from(shSocialAccounts).where(shAccountScope(context.site.id)).orderBy(asc(shSocialAccounts.platform), desc(shSocialAccounts.createdAt));
    json(res, 200, accounts);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/accounts') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    if (!body.platform || !body.accountName) return json(res, 400, { error: 'platform and accountName are required' }), true;
    const [created] = await db.insert(shSocialAccounts).values({
      siteId: context.site.id,
      platform: String(body.platform),
      accountName: String(body.accountName),
      accountHandle: body.accountHandle ? String(body.accountHandle) : null,
      authPayload: body.authPayload ?? null,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    }).returning();
    json(res, 201, created);
    return true;
  }

  if ((method === 'PUT' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'accounts' && segments[3]) {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const accountId = Number(segments[3]);
    if (!accountId) return json(res, 400, { error: 'Invalid id' }), true;
    if (method === 'DELETE') {
      const deleted = await db.delete(shSocialAccounts).where(and(eq(shSocialAccounts.id, accountId), shAccountScope(context.site.id))).returning({ id: shSocialAccounts.id });
      if (!deleted.length) return json(res, 404, { error: 'Not found' }), true;
      json(res, 200, { ok: true, id: accountId });
      return true;
    }
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (body.accountName !== undefined) patch.accountName = String(body.accountName);
    if (body.accountHandle !== undefined) patch.accountHandle = body.accountHandle ? String(body.accountHandle) : null;
    if (!Object.keys(patch).length) return json(res, 400, { error: 'No updatable fields provided' }), true;
    const [updated] = await db.update(shSocialAccounts).set(patch).where(and(eq(shSocialAccounts.id, accountId), shAccountScope(context.site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Not found' }), true;
    json(res, 200, updated);
    return true;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/templates') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(shTemplates).where(shTemplateScope(context.site.id));
    if ((total ?? 0) === 0) await db.insert(shTemplates).values(getDefaultTemplates().map((template) => ({ ...template, siteId: context.site.id })));
    const templates = await db.select().from(shTemplates).where(and(shTemplateScope(context.site.id), eq(shTemplates.isActive, true))).orderBy(shTemplates.id);
    json(res, 200, templates);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/templates') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    const missing = SH_TEMPLATE_REQUIRED_FIELDS.filter((field) => !body[field]);
    if (missing.length > 0) return json(res, 400, { error: `Missing required fields: ${missing.join(', ')}` }), true;
    try {
      const [created] = await db.insert(shTemplates).values({
        siteId: context.site.id,
        name: String(body.name),
        slug: String(body.slug),
        category: String(body.category),
        aspectRatio: String(body.aspectRatio),
        jsxTemplate: String(body.jsxTemplate),
      }).returning();
      json(res, 201, created);
      return true;
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('unique')) return json(res, 409, { error: `Template slug "${body.slug}" already exists` }), true;
      throw error;
    }
  }

  if ((method === 'PUT' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'templates' && segments[3]) {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const templateId = Number(segments[3]);
    if (!templateId) return json(res, 400, { error: 'Invalid id' }), true;
    if (method === 'DELETE') {
      const deleted = await db.delete(shTemplates).where(and(eq(shTemplates.id, templateId), shTemplateScope(context.site.id))).returning({ id: shTemplates.id });
      if (!deleted.length) return json(res, 404, { error: 'Template not found' }), true;
      json(res, 200, { ok: true, id: templateId });
      return true;
    }
    const body = await readJsonBody(req);
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name);
    if (body.slug !== undefined) updates.slug = String(body.slug);
    if (body.category !== undefined) updates.category = String(body.category);
    if (body.aspectRatio !== undefined) updates.aspectRatio = String(body.aspectRatio);
    if (body.jsxTemplate !== undefined) updates.jsxTemplate = String(body.jsxTemplate);
    if (body.previewUrl !== undefined) updates.previewUrl = body.previewUrl ? String(body.previewUrl) : null;
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    if (!Object.keys(updates).length) return json(res, 400, { error: 'Request body is empty' }), true;
    try {
      const [updated] = await db.update(shTemplates).set(updates).where(and(eq(shTemplates.id, templateId), shTemplateScope(context.site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Template not found' }), true;
      json(res, 200, updated);
      return true;
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('unique')) return json(res, 409, { error: `Template slug "${body.slug}" already exists` }), true;
      throw error;
    }
  }

  if (pathname === '/v1/social-hub/calendar') {
    const context = await resolveShSite(req, res);
    if (!context) return true;

    if (method === 'GET') {
      const now = new Date();
      const year = Number.parseInt(url.searchParams.get('year') ?? String(now.getFullYear()), 10);
      const month = Number.parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1), 10);
      if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
        return json(res, 400, { error: 'Invalid year or month' }), true;
      }

      const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const inMonth = and(
        gte(shPublishLog.scheduledFor, monthStart),
        lte(shPublishLog.scheduledFor, new Date(monthEnd.getTime() - 1)),
      );
      const publishedInMonth = and(
        gte(shPublishLog.publishedAt, monthStart),
        lte(shPublishLog.publishedAt, new Date(monthEnd.getTime() - 1)),
      );

      const [scheduledRows, publishedRows] = await Promise.all([
        db.select({
          logId: shPublishLog.id,
          briefId: shPublishLog.briefId,
          platform: shPublishLog.platform,
          status: shPublishLog.status,
          scheduledFor: shPublishLog.scheduledFor,
          publishedAt: shPublishLog.publishedAt,
          accountHandle: shSocialAccounts.accountHandle,
          sourceTitle: shContentBriefs.sourceTitle,
          outputFormat: shContentBriefs.outputFormat,
        }).from(shPublishLog)
          .leftJoin(shContentBriefs, eq(shPublishLog.briefId, shContentBriefs.id))
          .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
          .where(and(shPublishScope(context.site.id), inMonth)),
        db.select({
          logId: shPublishLog.id,
          briefId: shPublishLog.briefId,
          platform: shPublishLog.platform,
          status: shPublishLog.status,
          scheduledFor: shPublishLog.scheduledFor,
          publishedAt: shPublishLog.publishedAt,
          accountHandle: shSocialAccounts.accountHandle,
          sourceTitle: shContentBriefs.sourceTitle,
          outputFormat: shContentBriefs.outputFormat,
        }).from(shPublishLog)
          .leftJoin(shContentBriefs, eq(shPublishLog.briefId, shContentBriefs.id))
          .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
          .where(and(shPublishScope(context.site.id), publishedInMonth)),
      ]);

      const seen = new Set<number>();
      const posts = [...scheduledRows, ...publishedRows]
        .filter((row) => {
          if (seen.has(row.logId)) return false;
          seen.add(row.logId);
          return true;
        })
        .map((row) => {
          const anchor = row.scheduledFor ?? row.publishedAt;
          return {
            day: anchor ? anchor.getUTCDate() : null,
            logId: row.logId,
            briefId: row.briefId,
            platform: row.platform,
            accountHandle: row.accountHandle ?? null,
            sourceTitle: row.sourceTitle ?? null,
            outputFormat: row.outputFormat ?? null,
            status: row.status,
            scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
            publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          };
        });

      json(res, 200, { month: { year, month }, posts });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const publishLogId = Number(body.publishLogId ?? 0);
      const scheduledFor = typeof body.scheduledFor === 'string' ? body.scheduledFor : '';
      if (!publishLogId || !scheduledFor) return json(res, 400, { error: 'Missing required fields: publishLogId, scheduledFor' }), true;
      const newDate = new Date(scheduledFor);
      if (Number.isNaN(newDate.getTime())) return json(res, 400, { error: 'Invalid scheduledFor date' }), true;
      const [updated] = await db.update(shPublishLog).set({ scheduledFor: newDate }).where(and(eq(shPublishLog.id, publishLogId), shPublishScope(context.site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Publish log not found' }), true;
      json(res, 200, { ok: true, publishLog: updated });
      return true;
    }
  }

  if (method === 'POST' && pathname === '/v1/social-hub/repurpose') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
    const sourceId = Number(body.sourceId ?? 0);
    const targetAccountIds = Array.isArray(body.targetAccountIds) ? body.targetAccountIds.map((id) => Number(id)).filter(Boolean) : [];
    if (!sourceType || !sourceId) return json(res, 400, { error: 'Missing required fields: sourceType, sourceId' }), true;
    if (targetAccountIds.length === 0) return json(res, 400, { error: 'targetAccountIds must be a non-empty array' }), true;

    const source = await loadSource(sourceType, sourceId, context.site.id);
    if (!source) return json(res, 404, { error: `Source not found: ${sourceType} #${sourceId}` }), true;

    const accounts = await db.select({ id: shSocialAccounts.id, platform: shSocialAccounts.platform }).from(shSocialAccounts).where(and(inArray(shSocialAccounts.id, targetAccountIds), shAccountScope(context.site.id)));
    const platformsForAccounts = [...new Set(accounts.map((account) => account.platform))];
    const kbMatches = await matchKbEntries(source.content, 3, context.site.id);
    const kbEntriesUsed = kbMatches.map((entry: any) => entry.id);
    const viralEngine = normalizeShViralEnginePayload(body, 'image');

    const briefDefs = [
      { outputFormat: 'image', suggestionPrompt: 'Create a retro-style quote card (1:1) highlighting the core insight.', videoFormatSlug: null },
      { outputFormat: 'image', suggestionPrompt: 'Create a story-format pain point visual (9:16) for Instagram/TikTok.', videoFormatSlug: null },
      { outputFormat: 'text', suggestionPrompt: 'Write a short-form text post distilling the key message.', videoFormatSlug: null },
    ];

    const createdIds: number[] = [];
    for (const def of briefDefs) {
      const [created] = await db.insert(shContentBriefs).values({
        siteId: context.site.id,
        sourceType,
        sourceId,
        sourceTitle: source.title,
        sourceSnapshot: source.content,
        suggestionPrompt: encodeShSuggestionPrompt(def.suggestionPrompt, {
          ...viralEngine,
          contentFormat: def.outputFormat,
          appliedTo: 'written',
          video: {
            ...viralEngine.video,
            selectedFormat: def.videoFormatSlug,
          },
        }),
        outputFormat: def.outputFormat,
        targetPlatforms: platformsForAccounts,
        targetAccountIds,
        kbEntriesUsed,
        brandVoiceUsed: true,
        viralEngineEnabled: viralEngine.enabled,
        viralEngineMode: viralEngine.mode,
        viralEngineProfile: {
          ...viralEngine,
          contentFormat: def.outputFormat,
          appliedTo: 'written',
          video: {
            ...viralEngine.video,
            selectedFormat: def.videoFormatSlug,
          },
        } as any,
        videoFormatSlug: def.videoFormatSlug,
        repurposeGroupId: createdIds.length > 0 ? createdIds[0] : null,
        status: 'draft',
        updatedAt: new Date(),
      }).returning({ id: shContentBriefs.id });
      createdIds.push(created.id);
    }

    await db.update(shContentBriefs).set({ repurposeGroupId: createdIds[0], updatedAt: new Date() }).where(and(eq(shContentBriefs.id, createdIds[0]), shBriefScope(context.site.id)));
    json(res, 201, { briefs: createdIds, repurposeGroupId: createdIds[0], viralEngine });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/seed-templates') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const templates = getDefaultTemplates();
    const results: string[] = [];
    for (const template of templates) {
      const [existing] = await db.select({ id: shTemplates.id }).from(shTemplates).where(and(eq(shTemplates.slug, template.slug), shTemplateScope(context.site.id))).limit(1);
      if (existing) {
        await db.update(shTemplates).set({
          name: template.name,
          category: template.category,
          aspectRatio: template.aspectRatio,
          jsxTemplate: template.jsxTemplate,
          isActive: true,
        }).where(and(eq(shTemplates.slug, template.slug), shTemplateScope(context.site.id)));
        results.push(`updated: ${template.slug}`);
      } else {
        await db.insert(shTemplates).values({ ...template, siteId: context.site.id, isActive: true });
        results.push(`inserted: ${template.slug}`);
      }
    }
    json(res, 200, { ok: true, results });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/briefs') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const status = url.searchParams.get('status') || '';
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 10000);
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 200 });
    const conditions = [shBriefScope(context.site.id), status ? eq(shContentBriefs.status, status) : undefined].filter(Boolean);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [briefs, countRows] = await Promise.all([
      db.select().from(shContentBriefs).where(whereClause).orderBy(desc(shContentBriefs.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(shContentBriefs).where(whereClause),
    ]);
    const briefIds = briefs.map((brief) => brief.id);
    const firstCopyByBriefId: Record<number, any> = {};
    if (briefIds.length > 0) {
      const copies = await db.select().from(shGeneratedCopy).where(and(inArray(shGeneratedCopy.briefId, briefIds), shCopyScope(context.site.id))).orderBy(shGeneratedCopy.briefId, shGeneratedCopy.variantIndex);
      for (const copy of copies) {
        if (!(copy.briefId in firstCopyByBriefId)) firstCopyByBriefId[copy.briefId] = copy;
      }
    }
    const results = briefs.map((brief) => ({
      ...brief,
      ...parseShSuggestionPrompt(brief.suggestionPrompt),
      firstGeneratedCopy: firstCopyByBriefId[brief.id] ?? null,
    }));
    json(res, 200, { results, total: countRows[0]?.total ?? 0, offset, limit });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/briefs') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const body = await readJsonBody(req);
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
    const sourceId = Number(body.sourceId ?? 0);
    const outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : '';
    const targetPlatforms = Array.isArray(body.targetPlatforms) ? body.targetPlatforms.map((value) => String(value)) : [];
    const targetAccountIds = Array.isArray(body.targetAccountIds) ? body.targetAccountIds.map((value) => Number(value)).filter(Boolean) : [];
    if (!sourceType || !sourceId || !outputFormat) return json(res, 400, { error: 'Missing required fields: sourceType, sourceId, outputFormat' }), true;
    if (!Array.isArray(body.targetPlatforms) || !Array.isArray(body.targetAccountIds)) return json(res, 400, { error: 'targetPlatforms and targetAccountIds must be arrays' }), true;
    const source = await loadSource(sourceType, sourceId, context.site.id);
    if (!source) return json(res, 404, { error: `Source not found: ${sourceType} #${sourceId}` }), true;
    const kbMatches = await matchKbEntries(source.content, 3, context.site.id);
    const kbEntriesUsed = kbMatches.map((entry: any) => entry.id);
    const viralEngine = normalizeShViralEnginePayload(body, outputFormat);
    const [created] = await db.insert(shContentBriefs).values({
      siteId: context.site.id,
      sourceType,
      sourceId,
      sourceTitle: source.title,
      sourceSnapshot: source.content,
      suggestionPrompt: encodeShSuggestionPrompt(typeof body.suggestionPrompt === 'string' ? body.suggestionPrompt : null, viralEngine),
      outputFormat,
      targetPlatforms,
      targetAccountIds,
      kbEntriesUsed,
      brandVoiceUsed: true,
      viralEngineEnabled: viralEngine.enabled,
      viralEngineMode: viralEngine.mode,
      viralEngineProfile: viralEngine as any,
      videoFormatSlug: viralEngine.video.selectedFormat,
      status: 'draft',
      updatedAt: new Date(),
    }).returning();
    json(res, 201, { ...created, prompt: parseShSuggestionPrompt(created.suggestionPrompt).prompt, viralEngine });
    return true;
  }

  if ((method === 'GET' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && !segments[4]) {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;
    if (method === 'DELETE') {
      const publishLogRows = await db.select({ id: shPublishLog.id }).from(shPublishLog).where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));
      if (publishLogRows.length > 0) await db.delete(shPostMetrics).where(and(inArray(shPostMetrics.publishLogId, publishLogRows.map((row) => row.id)), shMetricsScope(site.id)));
      await db.delete(shPublishLog).where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));
      await db.delete(shMediaAssets).where(and(eq(shMediaAssets.briefId, briefId), shMediaScope(site.id)));
      await db.delete(shGeneratedCopy).where(and(eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id)));
      await db.delete(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true, id: briefId });
      return true;
    }
    const { brief } = context;
    const [generatedCopy, mediaAssets, publishLogsRaw] = await Promise.all([
      db.select().from(shGeneratedCopy).where(and(eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id))).orderBy(shGeneratedCopy.variantIndex),
      db.select().from(shMediaAssets).where(and(eq(shMediaAssets.briefId, briefId), shMediaScope(site.id))).orderBy(shMediaAssets.createdAt),
      db.select({ log: shPublishLog, account: shSocialAccounts }).from(shPublishLog).leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id)).where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id))).orderBy(desc(shPublishLog.createdAt)),
    ]);
    const publishLogIds = publishLogsRaw.map((row) => row.log.id);
    const metricsByLogId: Record<number, any[]> = {};
    if (publishLogIds.length > 0) {
      const allMetrics = await db.select().from(shPostMetrics).where(and(inArray(shPostMetrics.publishLogId, publishLogIds), shMetricsScope(site.id))).orderBy(desc(shPostMetrics.fetchedAt));
      for (const metric of allMetrics) {
        if (!metricsByLogId[metric.publishLogId]) metricsByLogId[metric.publishLogId] = [];
        metricsByLogId[metric.publishLogId].push(metric);
      }
    }
    const publishLogs = publishLogsRaw.map(({ log, account }) => ({ ...log, account: account ?? null, metrics: metricsByLogId[log.id] ?? [] }));
    json(res, 200, { brief, generatedCopy, mediaAssets, publishLogs });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/analytics') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number.parseInt(daysParam, 10) : null;
    const validDays = days && [7, 30, 90].includes(days) ? days : null;
    const cutoff = validDays ? new Date(Date.now() - validDays * 24 * 60 * 60 * 1000) : null;
    const publishedCondition = cutoff ? and(shPublishScope(context.site.id), eq(shPublishLog.status, 'published'), gte(shPublishLog.publishedAt, cutoff)) : and(shPublishScope(context.site.id), eq(shPublishLog.status, 'published'));
    const metricsCondition = cutoff ? and(shMetricsScope(context.site.id), gte(shPostMetrics.fetchedAt, cutoff)) : shMetricsScope(context.site.id);
    const [totalPostsRows, metricsAggRows, byPlatformRows, topPostsRows, recentBriefs, statusCountRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(shPublishLog).where(publishedCondition),
      db.select({
        totalImpressions: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        avgEngagementRate: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)::float`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        totalComments: sql<number>`coalesce(sum(${shPostMetrics.comments}), 0)::int`,
        totalShares: sql<number>`coalesce(sum(${shPostMetrics.shares}), 0)::int`,
      }).from(shPostMetrics).where(metricsCondition),
      db.select({
        platform: shPublishLog.platform,
        postsCount: sql<number>`count(distinct ${shPublishLog.id})::int`,
        totalViews: sql<number>`coalesce(sum(${shPostMetrics.views}), 0)::int`,
        totalLikes: sql<number>`coalesce(sum(${shPostMetrics.likes}), 0)::int`,
        avgEngagement: sql<number>`coalesce(avg(${shPostMetrics.engagementRate}), 0)::float`,
      }).from(shPublishLog).leftJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id)).where(publishedCondition).groupBy(shPublishLog.platform).orderBy(desc(sql`coalesce(sum(${shPostMetrics.views}), 0)`)),
      db.select({
        briefId: shPublishLog.briefId,
        platform: shPublishLog.platform,
        externalPostUrl: shPublishLog.externalPostUrl,
        publishedAt: shPublishLog.publishedAt,
        views: shPostMetrics.views,
        likes: shPostMetrics.likes,
        engagementRate: shPostMetrics.engagementRate,
        hookLine: shGeneratedCopy.hookLine,
      }).from(shPublishLog).innerJoin(shPostMetrics, eq(shPostMetrics.publishLogId, shPublishLog.id)).leftJoin(shGeneratedCopy, and(eq(shGeneratedCopy.briefId, shPublishLog.briefId), eq(shGeneratedCopy.variantIndex, 0))).where(publishedCondition).orderBy(desc(shPostMetrics.views)).limit(10),
      db.select({
        id: shContentBriefs.id,
        sourceType: shContentBriefs.sourceType,
        sourceTitle: shContentBriefs.sourceTitle,
        status: shContentBriefs.status,
        createdAt: shContentBriefs.createdAt,
      }).from(shContentBriefs).where(shBriefScope(context.site.id)).orderBy(desc(shContentBriefs.createdAt)).limit(20),
      db.select({ status: shContentBriefs.status, cnt: sql<number>`count(*)::int` }).from(shContentBriefs).where(shBriefScope(context.site.id)).groupBy(shContentBriefs.status),
    ]);
    const statusMap: Record<string, number> = {};
    for (const row of statusCountRows) statusMap[row.status] = row.cnt;
    json(res, 200, {
      summary: {
        totalPosts: totalPostsRows[0]?.total ?? 0,
        totalImpressions: metricsAggRows[0]?.totalImpressions ?? 0,
        avgEngagementRate: metricsAggRows[0]?.avgEngagementRate ?? 0,
        totalLikes: metricsAggRows[0]?.totalLikes ?? 0,
        totalComments: metricsAggRows[0]?.totalComments ?? 0,
        totalShares: metricsAggRows[0]?.totalShares ?? 0,
      },
      byPlatform: byPlatformRows,
      topPosts: topPostsRows.map((row) => ({
        briefId: row.briefId,
        platform: row.platform,
        hookLine: row.hookLine ?? '',
        externalPostUrl: row.externalPostUrl ?? '',
        views: row.views ?? 0,
        likes: row.likes ?? 0,
        engagementRate: row.engagementRate ?? 0,
        publishedAt: row.publishedAt?.toISOString() ?? '',
      })),
      recentActivity: recentBriefs.map((brief) => ({
        briefId: brief.id,
        sourceType: brief.sourceType,
        sourceTitle: brief.sourceTitle ?? '',
        status: brief.status,
        createdAt: brief.createdAt.toISOString(),
      })),
      briefsStatusSummary: {
        draft: statusMap.draft ?? 0,
        generating: statusMap.generating ?? 0,
        copy_review: statusMap.copy_review ?? 0,
        rendering: statusMap.rendering ?? 0,
        render_review: statusMap.render_review ?? 0,
        published: statusMap.published ?? 0,
        done: statusMap.done ?? 0,
      },
    });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'job-status') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'sh-copy';
    const activeJob = await findActiveJobByPayload(topic, 'briefId', briefId, site.id);
    const latestJob = activeJob ?? await findLatestJobByPayload(topic, 'briefId', briefId, site.id);
    json(res, 200, { job: latestJob });
    return true;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'copy') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;
    const body = await readJsonBody(req);
    const copyId = Number(body.copyId ?? 0);
    if (!copyId) return json(res, 400, { error: 'copyId is required' }), true;

    const updateFields: Record<string, any> = {};
    if (body.hookLine !== undefined) updateFields.hookLine = body.hookLine;
    if (body.bodyText !== undefined) updateFields.bodyText = body.bodyText;
    if (body.hashtags !== undefined) updateFields.hashtags = body.hashtags;
    if (body.cta !== undefined) updateFields.cta = body.cta;
    if (body.status !== undefined) updateFields.status = body.status;
    if (body.hookLine !== undefined || body.bodyText !== undefined || body.hashtags !== undefined || body.cta !== undefined) {
      updateFields.isEdited = true;
      updateFields.editedAt = new Date();
    }
    if (!Object.keys(updateFields).length) return json(res, 400, { error: 'No fields to update' }), true;

    const [updated] = await db.update(shGeneratedCopy).set(updateFields).where(and(eq(shGeneratedCopy.id, copyId), eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Copy record not found' }), true;

    if (body.status === 'approved') {
      await db.update(shContentBriefs).set({ status: 'rendering', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
    } else if (body.status === 'rejected') {
      const remainingApproved = await db.select({ id: shGeneratedCopy.id }).from(shGeneratedCopy).where(and(eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id), eq(shGeneratedCopy.status, 'approved'))).limit(1);
      if (remainingApproved.length === 0) {
        await db.update(shContentBriefs).set({ status: 'copy_review', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      }
    }

    json(res, 200, updated);
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'metrics') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;

    const logsRaw = await db
      .select({ log: shPublishLog, account: shSocialAccounts })
      .from(shPublishLog)
      .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));

    if (!logsRaw.length) {
      json(res, 200, { metrics: [] });
      return true;
    }

    const logIds = logsRaw.map((row) => row.log.id);
    const existingMetrics = await db.select().from(shPostMetrics).where(and(inArray(shPostMetrics.publishLogId, logIds), shMetricsScope(site.id)));
    const latestMetricByLogId = new Map<number, any>();
    for (const metric of existingMetrics) {
      const current = latestMetricByLogId.get(metric.publishLogId);
      if (!current || metric.fetchedAt > current.fetchedAt) latestMetricByLogId.set(metric.publishLogId, metric);
    }

    const METRICS_TTL_MS = 60 * 60 * 1000;
    const now = Date.now();
    const updatedMetrics: any[] = [];

    for (const { log } of logsRaw) {
      if (!log.externalPostId) {
        const existing = latestMetricByLogId.get(log.id);
        if (existing) updatedMetrics.push(existing);
        continue;
      }

      const existing = latestMetricByLogId.get(log.id);
      const ageMs = existing ? now - existing.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
      if (existing && ageMs < METRICS_TTL_MS) {
        updatedMetrics.push(existing);
        continue;
      }

      try {
        const raw: any = await fetchUploadPostMetrics(log.externalPostId);
        const metricsPayload = {
          siteId: site.id,
          publishLogId: log.id,
          views: raw.views ?? 0,
          likes: raw.likes ?? 0,
          comments: raw.comments ?? 0,
          shares: raw.shares ?? 0,
          saves: raw.saves ?? 0,
          engagementRate: raw.engagement_rate ?? null,
          fetchedAt: new Date(),
        };

        if (existing) {
          const [updated] = await db.update(shPostMetrics).set(metricsPayload).where(eq(shPostMetrics.id, existing.id)).returning();
          updatedMetrics.push(updated);
        } else {
          const [inserted] = await db.insert(shPostMetrics).values(metricsPayload).returning();
          updatedMetrics.push(inserted);
        }
      } catch (error) {
        console.error(`[sh-metrics] Failed to fetch metrics for post ${log.externalPostId}:`, error);
        if (existing) updatedMetrics.push(existing);
      }
    }

    const metricsByLogId = new Map<number, any>();
    for (const metric of updatedMetrics) metricsByLogId.set(metric.publishLogId, metric);

    const result = logsRaw.map(({ log, account }) => ({
      ...log,
      account: account ?? null,
      metrics: metricsByLogId.get(log.id) ?? null,
    }));

    json(res, 200, { metrics: result });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'generate-copy' && method === 'POST') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;

    const existingJob = await findActiveJobByPayload('sh-copy', 'briefId', briefId, site.id);
    if (existingJob) return json(res, 409, { error: 'Copywriter already running', status: existingJob.status, jobId: existingJob.id }), true;

    const body = await readJsonBody(req);
    const [job] = await db.insert(appJobs).values({
      siteId: site.id,
      type: 'sh-copy',
      topic: 'sh-copy',
      payload: {
        briefId,
        copyId: body.copyId ? Number(body.copyId) : null,
        queueId: body.queueId ? Number(body.queueId) : null,
        siteId: site.id,
      },
    }).returning();

    json(res, 202, { ok: true, status: 'started', briefId, jobId: job.id });
    return true;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'render') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId, brief } = context;

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const copyId = Number(body.copyId ?? 0);
      const format = body.format === 'video' ? 'video' : body.format === 'image' ? 'image' : null;
      const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug : null;
      if (!copyId || !format) return json(res, 400, { error: 'Missing required fields: copyId, format' }), true;

      const [[scopedBrief], [copy]] = await Promise.all([
        db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id))).limit(1),
        db.select().from(shGeneratedCopy).where(and(eq(shGeneratedCopy.id, copyId), shCopyScope(site.id))).limit(1),
      ]);
      if (!scopedBrief) return json(res, 404, { error: 'Brief not found' }), true;
      if (!copy) return json(res, 404, { error: 'Copy record not found' }), true;

      if (format === 'image') {
        let template = null;
        if (templateSlug) {
          [template] = await db.select().from(shTemplates).where(and(eq(shTemplates.slug, templateSlug), shTemplateScope(site.id))).limit(1);
        }
        if (!template) {
          [template] = await db.select().from(shTemplates).where(and(eq(shTemplates.slug, 'retro-quote-card'), shTemplateScope(site.id))).limit(1);
        }
        if (!template) {
          const defaults = getDefaultTemplates();
          template = defaults.find((entry) => entry.slug === 'retro-quote-card') ?? defaults[0] ?? null;
        }

        const aspectRatio = (template?.aspectRatio ?? '1:1') as '1:1' | '9:16' | '16:9' | '3:4';
        const templateId = template && 'id' in template ? template.id : null;

        const result = await renderSocialImage({
          hookLine: copy.hookLine,
          bodyText: copy.bodyText,
          hashtags: Array.isArray(copy.hashtags) ? copy.hashtags : [],
          templateSlug: template?.slug ?? 'retro-quote-card',
          aspectRatio,
        });

        const mediaUrl = `data:image/png;base64,${result.buffer.toString('base64')}`;
        const [asset] = await db.insert(shMediaAssets).values({
          siteId: site.id,
          briefId,
          copyId,
          templateId,
          type: 'image',
          mediaUrl,
          width: result.width,
          height: result.height,
          videoFormatSlug: scopedBrief.videoFormatSlug ?? null,
          viralEngineSnapshot: copy.viralEngineSnapshot ?? scopedBrief.viralEngineProfile ?? null,
          status: 'completed',
        }).returning();

        await db.update(shContentBriefs).set({ status: 'render_review', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
        json(res, 200, { ok: true, assetId: asset.id, mediaUrl, width: result.width, height: result.height, status: 'completed' });
        return true;
      }

      const existingJob = await findActiveJobByPayload('sh-video', 'briefId', briefId, site.id);
      if (existingJob) return json(res, 409, { error: 'Video render already running', status: existingJob.status, jobId: existingJob.id }), true;

      const [job] = await db.insert(appJobs).values({
        siteId: site.id,
        type: 'sh-video',
        topic: 'sh-video',
        payload: {
          briefId,
          copyId,
          siteId: site.id,
        },
      }).returning();

      await db.update(shContentBriefs).set({ status: 'rendering', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 202, { ok: true, status: 'rendering', briefId, jobId: job.id });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const assetId = Number(body.assetId ?? 0);
      if (body.action !== 'approve' || !assetId) {
        return json(res, 400, { error: 'Unknown action or missing assetId. Use: { assetId, action: "approve" }' }), true;
      }

      await db.update(shMediaAssets).set({ status: 'completed' }).where(and(eq(shMediaAssets.id, assetId), eq(shMediaAssets.briefId, briefId), shMediaScope(site.id)));
      await db.update(shContentBriefs).set({ status: 'done', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true });
      return true;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'publish' && method === 'POST') {
    const context = await resolveShBriefContext(req, res, segments[3]);
    if (!context) return true;
    const { site, briefId } = context;
    const body = await readJsonBody(req);
    const rawAccountIds = Array.isArray(body.accountIds) ? body.accountIds : [];
    const isDryRun = rawAccountIds.includes('__dry_run__');

    if (isDryRun) {
      await db.update(shContentBriefs).set({ status: 'done', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true, dryRun: true, message: 'Test mode — brief completed without publishing.' });
      return true;
    }

    const existingJob = await findActiveJobByPayload('sh-publish', 'briefId', briefId, site.id);
    if (existingJob) return json(res, 409, { error: 'Publish already running', status: existingJob.status, jobId: existingJob.id }), true;

    const accountIds = rawAccountIds.map((entry) => Number(entry)).filter(Boolean);
    const scheduledFor = typeof body.scheduledFor === 'string' && body.scheduledFor.trim() ? body.scheduledFor.trim() : null;
    const [job] = await db.insert(appJobs).values({
      siteId: site.id,
      type: 'sh-publish',
      topic: 'sh-publish',
      payload: {
        briefId,
        accountIds,
        scheduledFor,
        siteId: site.id,
      },
    }).returning();

    json(res, 202, { ok: true, status: 'started', briefId, jobId: job.id });
    return true;
  }

  if (pathname === '/v1/social-hub/queue') {
    const context = await resolveShSite(req, res);
    if (!context) return true;
    const { site } = context;

    if (method === 'GET') {
      const countRows = await db
        .select({ status: shQueue.status, cnt: sql<number>`count(*)::int` })
        .from(shQueue)
        .where(shQueueScope(site.id))
        .groupBy(shQueue.status);

      const countMap: Record<string, number> = {};
      for (const row of countRows) countMap[row.status] = row.cnt;

      const items = await db
        .select({
          id: shQueue.id,
          briefId: shQueue.briefId,
          priority: shQueue.priority,
          status: shQueue.status,
          processedAt: shQueue.processedAt,
          errorMessage: shQueue.errorMessage,
          createdAt: shQueue.createdAt,
          sourceType: shContentBriefs.sourceType,
          sourceTitle: shContentBriefs.sourceTitle,
          outputFormat: shContentBriefs.outputFormat,
        })
        .from(shQueue)
        .leftJoin(shContentBriefs, eq(shContentBriefs.id, shQueue.briefId))
        .where(shQueueScope(site.id))
        .orderBy(desc(shQueue.createdAt))
        .limit(200);

      const [processingJobRow] = await db.select({ cnt: sql<number>`count(*)::int` }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'sh-copy'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'queueId' is not null`));
      json(res, 200, {
        pending: countMap.pending ?? 0,
        processing: countMap.processing ?? 0,
        done: countMap.done ?? 0,
        failed: countMap.failed ?? 0,
        isProcessing: (processingJobRow?.cnt ?? 0) > 0,
        items: items.map((item) => ({
          ...item,
          processedAt: item.processedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
      });
      return true;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const briefIds = Array.isArray(body.briefIds) ? body.briefIds.map((entry) => Number(entry)).filter(Boolean) : [];
      if (briefIds.length === 0) return json(res, 400, { error: 'briefIds must be a non-empty array of numbers' }), true;
      const priority = typeof body.priority === 'number' ? Math.min(100, Math.max(0, body.priority)) : 50;
      const queueIds: number[] = [];
      for (const briefId of briefIds) {
        const [existing] = await db.select({ id: shQueue.id }).from(shQueue).where(and(eq(shQueue.briefId, briefId), shQueueScope(site.id), inArray(shQueue.status, ['pending', 'processing']))).limit(1);
        if (existing) {
          queueIds.push(existing.id);
          continue;
        }
        const [inserted] = await db.insert(shQueue).values({ siteId: site.id, briefId, priority, status: 'pending' }).returning({ id: shQueue.id });
        queueIds.push(inserted.id);
      }
      json(res, 201, { ok: true, queueIds });
      return true;
    }

    if (method === 'DELETE') {
      const id = Number(firstQueryValue(url, 'id') ?? 0);
      if (id) {
        await db.delete(shQueue).where(and(eq(shQueue.id, id), shQueueScope(site.id)));
        json(res, 200, { ok: true, removed: id });
        return true;
      }
      await db.delete(shQueue).where(and(shQueueScope(site.id), or(eq(shQueue.status, 'done'), eq(shQueue.status, 'failed'))));
      json(res, 200, { ok: true });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const action = typeof body.action === 'string' ? body.action : '';

      if (action === 'reprioritize') {
        const id = Number(body.id ?? 0);
        const priority = Math.min(100, Math.max(0, Number(body.priority ?? 50)));
        if (!id) return json(res, 400, { error: 'id and priority are required for reprioritize' }), true;
        await db.update(shQueue).set({ priority }).where(and(eq(shQueue.id, id), shQueueScope(site.id)));
        json(res, 200, { ok: true, id, priority });
        return true;
      }

      if (action === 'start') {
        const pendingItems = await db.select().from(shQueue).where(and(shQueueScope(site.id), eq(shQueue.status, 'pending'))).orderBy(desc(shQueue.priority), asc(shQueue.createdAt));
        const enqueuedIds: number[] = [];
        for (const item of pendingItems) {
          const existingJob = await findActiveJobByPayload('sh-copy', 'queueId', item.id, site.id);
          if (existingJob) {
            enqueuedIds.push(existingJob.id);
            continue;
          }
          const [job] = await db.insert(appJobs).values({
            siteId: site.id,
            type: 'sh-copy',
            topic: 'sh-copy',
            priority: item.priority,
            payload: {
              briefId: item.briefId,
              queueId: item.id,
              siteId: site.id,
            },
          }).returning({ id: appJobs.id });
          enqueuedIds.push(job.id);
          await db.update(shQueue).set({ status: 'processing', errorMessage: null }).where(and(eq(shQueue.id, item.id), shQueueScope(site.id)));
        }
        json(res, 200, { ok: true, action: 'started', enqueuedCount: enqueuedIds.length, jobIds: enqueuedIds });
        return true;
      }

      if (action === 'stop') {
        const activeJobs = await db.select().from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'sh-copy'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'queueId' is not null`));
        const queueIds = activeJobs.map((job) => Number(job.payload?.queueId ?? 0)).filter(Boolean);
        await db.update(appJobs).set({
          status: 'cancelled',
          error: 'Cancelled manually via Social Hub queue stop',
          lockedAt: null,
          workerName: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'sh-copy'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'queueId' is not null`));
        if (queueIds.length > 0) {
          await db.update(shQueue).set({ status: 'pending', errorMessage: 'Stopped manually' }).where(and(inArray(shQueue.id, queueIds), shQueueScope(site.id)));
        }
        json(res, 200, { ok: true, action: 'stop_requested', cancelledCount: activeJobs.length });
        return true;
      }

      return json(res, 400, { error: `Unknown action: ${action}` }), true;
    }
  }

  if (method === 'GET' && pathname === '/v1/social-hub/sources') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const typeParam = url.searchParams.get('type') || '';
    const search = url.searchParams.get('search') || '';
    if (typeParam && !isValidSourceType(typeParam)) return json(res, 400, { error: `Invalid type. Must be one of: ${SOURCE_TYPES.join(', ')}` }), true;

    async function queryArticles() {
      const rows = await db.select({
        id: articles.id, title: articles.title, description: articles.description, content: articles.content, status: articles.status, tags: articles.tags, author: articles.author, publishedAt: articles.publishedAt,
      }).from(articles).where(and(articleScope(site.id), search ? ilike(articles.title, `%${search}%`) : undefined)).orderBy(desc(articles.publishedAt)).limit(100);
      return rows.map((row) => {
        const full = row.description ? `${row.description}\n\n${row.content ?? ''}` : (row.content ?? '');
        return { sourceType: 'article', sourceId: row.id, title: row.title, preview: shPreview(full, 600), fullText: shPreview(full, 12000), metadata: { status: row.status, tags: row.tags, author: row.author, publishedAt: row.publishedAt }, meta: shFormatMeta({ status: row.status, tags: row.tags, author: row.author, publishedAt: row.publishedAt }) };
      });
    }

    async function queryPainPoints() {
      const rows = await db.select({
        id: bcExtractedPainPoints.id, painPointTitle: bcExtractedPainPoints.painPointTitle, painPointDescription: bcExtractedPainPoints.painPointDescription, category: bcExtractedPainPoints.category, emotionalIntensity: bcExtractedPainPoints.emotionalIntensity, customerLanguage: bcExtractedPainPoints.customerLanguage, vocData: bcExtractedPainPoints.vocData, status: bcExtractedPainPoints.status, projectId: bcExtractedPainPoints.projectId,
      }).from(bcExtractedPainPoints).where(and(bcPainPointScope(site.id), search ? ilike(bcExtractedPainPoints.painPointTitle, `%${search}%`) : undefined)).orderBy(desc(bcExtractedPainPoints.emotionalIntensity)).limit(100);
      return rows.map((row) => ({ sourceType: 'pain_point', sourceId: row.id, title: row.painPointTitle, preview: shPreview(row.painPointDescription), fullText: row.painPointDescription || '', metadata: { category: row.category, emotionalIntensity: row.emotionalIntensity, customerLanguage: row.customerLanguage, vocData: row.vocData, status: row.status, projectId: row.projectId }, meta: shFormatMeta({ category: row.category, emotionalIntensity: row.emotionalIntensity, status: row.status }) }));
    }

    async function queryPainClusters() {
      const rows = await db.select({
        id: bcPainClusters.id, clusterTheme: bcPainClusters.clusterTheme, dominantEmotion: bcPainClusters.dominantEmotion, bestQuotes: bcPainClusters.bestQuotes, synthesizedProblemLabel: bcPainClusters.synthesizedProblemLabel, synthesizedSuccessVision: bcPainClusters.synthesizedSuccessVision, aggregateIntensity: bcPainClusters.aggregateIntensity, projectId: bcPainClusters.projectId, iterationId: bcPainClusters.iterationId, createdAt: bcPainClusters.createdAt,
      }).from(bcPainClusters).where(and(bcClusterScope(site.id), search ? ilike(bcPainClusters.clusterTheme, `%${search}%`) : undefined)).orderBy(desc(bcPainClusters.createdAt)).limit(100);
      return rows.map((row) => ({ sourceType: 'pain_cluster', sourceId: row.id, title: row.clusterTheme, preview: shPreview(row.synthesizedProblemLabel ?? row.clusterTheme), fullText: `${row.synthesizedProblemLabel ?? row.clusterTheme}\n\n${row.bestQuotes ?? ''}`, metadata: { dominantEmotion: row.dominantEmotion, bestQuotes: row.bestQuotes, synthesizedSuccessVision: row.synthesizedSuccessVision, aggregateIntensity: row.aggregateIntensity, projectId: row.projectId, iterationId: row.iterationId }, meta: shFormatMeta({ dominantEmotion: row.dominantEmotion, aggregateIntensity: row.aggregateIntensity }) }));
    }

    async function queryContentGapRows() {
      const rows = await db.select({
        id: contentGaps.id, gapTitle: contentGaps.gapTitle, gapDescription: contentGaps.gapDescription, suggestedAngle: contentGaps.suggestedAngle, confidenceScore: contentGaps.confidenceScore, status: contentGaps.status, relatedQueries: contentGaps.relatedQueries, sourceModels: contentGaps.sourceModels,
      }).from(contentGaps).where(and(gapScope(site.id), search ? ilike(contentGaps.gapTitle, `%${search}%`) : undefined)).orderBy(desc(contentGaps.confidenceScore)).limit(100);
      return rows.map((row) => ({ sourceType: 'content_gap', sourceId: row.id, title: row.gapTitle, preview: shPreview(row.gapDescription), fullText: `${row.gapDescription || ''}\n\n${row.suggestedAngle ? `Suggested Angle:\n${row.suggestedAngle}` : ''}`, metadata: { confidenceScore: row.confidenceScore, status: row.status, suggestedAngle: row.suggestedAngle, relatedQueries: row.relatedQueries, sourceModels: row.sourceModels }, meta: shFormatMeta({ status: row.status, confidenceScore: row.confidenceScore }) }));
    }

    async function queryKbEntriesRows() {
      const rows = await db.select({
        id: knowledgeEntries.id, title: knowledgeEntries.title, content: knowledgeEntries.content, type: knowledgeEntries.type, importanceScore: knowledgeEntries.importanceScore, tags: knowledgeEntries.tags, projectName: knowledgeEntries.projectName, sourceUrl: knowledgeEntries.sourceUrl,
      }).from(knowledgeEntries).where(and(kbScope(site.id), search ? ilike(knowledgeEntries.title, `%${search}%`) : undefined)).orderBy(desc(knowledgeEntries.importanceScore)).limit(100);
      return rows.map((row) => ({ sourceType: 'kb_entry', sourceId: row.id, title: row.title, preview: shPreview(row.content), fullText: row.content || '', metadata: { type: row.type, importanceScore: row.importanceScore, tags: row.tags, projectName: row.projectName, sourceUrl: row.sourceUrl }, meta: shFormatMeta({ type: row.type, tags: row.tags, importanceScore: row.importanceScore }) }));
    }

    async function queryRedditGapsRows() {
      const rows = await db.select({
        id: redditExtractedGaps.id, painPointTitle: redditExtractedGaps.painPointTitle, painPointDescription: redditExtractedGaps.painPointDescription, vocabularyQuotes: redditExtractedGaps.vocabularyQuotes, category: redditExtractedGaps.category, emotionalIntensity: redditExtractedGaps.emotionalIntensity, frequency: redditExtractedGaps.frequency, status: redditExtractedGaps.status, scrapeRunId: redditExtractedGaps.scrapeRunId,
      }).from(redditExtractedGaps).where(and(redditGapScope(site.id), search ? ilike(redditExtractedGaps.painPointTitle, `%${search}%`) : undefined)).orderBy(desc(redditExtractedGaps.emotionalIntensity)).limit(100);
      return rows.map((row) => ({ sourceType: 'reddit_gap', sourceId: row.id, title: row.painPointTitle, preview: shPreview(row.painPointDescription), fullText: `${row.painPointDescription || ''}\n\n${row.vocabularyQuotes ? `Quotes:\n${row.vocabularyQuotes}` : ''}`, metadata: { vocabularyQuotes: row.vocabularyQuotes, category: row.category, emotionalIntensity: row.emotionalIntensity, frequency: row.frequency, status: row.status, scrapeRunId: row.scrapeRunId }, meta: shFormatMeta({ category: row.category, emotionalIntensity: row.emotionalIntensity, frequency: row.frequency, status: row.status }) }));
    }

    async function queryYtGapsRows() {
      const rows = await db.select({
        id: ytExtractedGaps.id, painPointTitle: ytExtractedGaps.painPointTitle, painPointDescription: ytExtractedGaps.painPointDescription, vocabularyQuotes: ytExtractedGaps.vocabularyQuotes, category: ytExtractedGaps.category, emotionalIntensity: ytExtractedGaps.emotionalIntensity, frequency: ytExtractedGaps.frequency, status: ytExtractedGaps.status, sourceVideoId: ytExtractedGaps.sourceVideoId, sourceVideoTitle: ytExtractedGaps.sourceVideoTitle, scrapeRunId: ytExtractedGaps.scrapeRunId,
      }).from(ytExtractedGaps).where(and(ytGapScope(site.id), search ? ilike(ytExtractedGaps.painPointTitle, `%${search}%`) : undefined)).orderBy(desc(ytExtractedGaps.emotionalIntensity)).limit(100);
      return rows.map((row) => ({ sourceType: 'yt_gap', sourceId: row.id, title: row.painPointTitle, preview: shPreview(row.painPointDescription), fullText: `${row.painPointDescription || ''}\n\n${row.vocabularyQuotes ? `Quotes:\n${row.vocabularyQuotes}` : ''}`, metadata: { vocabularyQuotes: row.vocabularyQuotes, category: row.category, emotionalIntensity: row.emotionalIntensity, frequency: row.frequency, status: row.status, sourceVideoId: row.sourceVideoId, sourceVideoTitle: row.sourceVideoTitle, scrapeRunId: row.scrapeRunId }, meta: shFormatMeta({ category: row.category, emotionalIntensity: row.emotionalIntensity, frequency: row.frequency, status: row.status, sourceVideoTitle: row.sourceVideoTitle }) }));
    }

    const queryMap: Record<string, () => Promise<any[]>> = {
      article: queryArticles,
      pain_point: queryPainPoints,
      pain_cluster: queryPainClusters,
      content_gap: queryContentGapRows,
      kb_entry: queryKbEntriesRows,
      reddit_gap: queryRedditGapsRows,
      yt_gap: queryYtGapsRows,
    };

    const results = typeParam
      ? await queryMap[typeParam]()
      : (await Promise.all(SOURCE_TYPES.map((type) => queryMap[type]()))).flat().slice(0, 100);
    json(res, 200, results);
    return true;
  }

  return false;
}
