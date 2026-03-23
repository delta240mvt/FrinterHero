import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import * as bcrypt from 'bcrypt';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../../src/db/client';
import {
  appJobs,
  articleGenerations,
  articles,
  bcExtractedPainPoints,
  bcIterationSelections,
  bcIterations,
  bcLandingPageVariants,
  bcProjects,
  bcPainClusters,
  bcSettings,
  bcTargetChannels,
  bcTargetVideos,
  contentGaps,
  geoQueries,
  geoRuns,
  knowledgeEntries,
  knowledgeSources,
  redditExtractedGaps,
  redditPosts,
  redditScrapeRuns,
  redditTargets,
  sessions,
  shContentBriefs,
  shGeneratedCopy,
  shMediaAssets,
  shPostMetrics,
  shPublishLog,
  shQueue,
  shSettings,
  shSocialAccounts,
  shTemplates,
  sites,
  ytComments,
  ytExtractedGaps,
  ytScrapeRuns,
  ytTargets,
} from '../../../src/db/schema';

export type Json = Record<string, unknown>;
export type SessionRecord = typeof sessions.$inferSelect;
export type SiteRecord = typeof sites.$inferSelect;

export const SESSION_COOKIE = 'session';
export const DEFAULT_SITE_SLUG = 'przemyslawfilipiak';
export const KB_TYPES = ['project_spec', 'published_article', 'external_research', 'personal_note'] as const;
export const ACK_ACTIONS = ['generate_draft', 'snooze', 'archive'] as const;
export const SH_TEMPLATE_REQUIRED_FIELDS = ['name', 'slug', 'category', 'aspectRatio', 'jsxTemplate'] as const;

export interface RouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  url: URL;
  pathname: string;
  segments: string[];
}

export function json(res: http.ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): true {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
  return true;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

export async function readJsonBody(req: http.IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Json;
}

export function toPositiveInt(value: string | null, fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function toNonNegativeInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(max, parsed));
}

export function normalizeSiteSlug(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function firstQueryValue(url: URL, ...keys: string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null) return value;
  }
  return null;
}

export function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

// --- Tenant scope helpers ---

export function articleScope(siteId: number) { return or(eq(articles.siteId, siteId), isNull(articles.siteId)); }
export function kbScope(siteId: number) { return or(eq(knowledgeEntries.siteId, siteId), isNull(knowledgeEntries.siteId)); }
export function gapScope(siteId: number) { return or(eq(contentGaps.siteId, siteId), isNull(contentGaps.siteId)); }
export function geoRunScope(siteId: number) { return or(eq(geoRuns.siteId, siteId), isNull(geoRuns.siteId)); }
export function redditTargetScope(siteId: number) { return or(eq(redditTargets.siteId, siteId), isNull(redditTargets.siteId)); }
export function redditRunScope(siteId: number) { return or(eq(redditScrapeRuns.siteId, siteId), isNull(redditScrapeRuns.siteId)); }
export function redditPostScope(siteId: number) { return or(eq(redditPosts.siteId, siteId), isNull(redditPosts.siteId)); }
export function redditGapScope(siteId: number) { return or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId)); }
export function ytTargetScope(siteId: number) { return or(eq(ytTargets.siteId, siteId), isNull(ytTargets.siteId)); }
export function ytRunScope(siteId: number) { return or(eq(ytScrapeRuns.siteId, siteId), isNull(ytScrapeRuns.siteId)); }
export function ytCommentScope(siteId: number) { return or(eq(ytComments.siteId, siteId), isNull(ytComments.siteId)); }
export function ytGapScope(siteId: number) { return or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId)); }
export function bcProjectScope(siteId: number) { return or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId)); }
export function bcChannelScope(siteId: number) { return or(eq(bcTargetChannels.siteId, siteId), isNull(bcTargetChannels.siteId)); }
export function bcVideoScope(siteId: number) { return or(eq(bcTargetVideos.siteId, siteId), isNull(bcTargetVideos.siteId)); }
export function bcPainPointScope(siteId: number) { return or(eq(bcExtractedPainPoints.siteId, siteId), isNull(bcExtractedPainPoints.siteId)); }
export function bcSettingsScope(siteId: number) { return or(eq(bcSettings.siteId, siteId), isNull(bcSettings.siteId)); }
export function bcClusterScope(siteId: number) { return or(eq(bcPainClusters.siteId, siteId), isNull(bcPainClusters.siteId)); }
export function shSettingsScope(siteId: number) { return or(eq(shSettings.siteId, siteId), isNull(shSettings.siteId)); }
export function shAccountScope(siteId: number) { return or(eq(shSocialAccounts.siteId, siteId), isNull(shSocialAccounts.siteId)); }
export function shBriefScope(siteId: number) { return or(eq(shContentBriefs.siteId, siteId), isNull(shContentBriefs.siteId)); }
export function shCopyScope(siteId: number) { return or(eq(shGeneratedCopy.siteId, siteId), isNull(shGeneratedCopy.siteId)); }
export function shTemplateScope(siteId: number) { return or(eq(shTemplates.siteId, siteId), isNull(shTemplates.siteId)); }
export function shMediaScope(siteId: number) { return or(eq(shMediaAssets.siteId, siteId), isNull(shMediaAssets.siteId)); }
export function shPublishScope(siteId: number) { return or(eq(shPublishLog.siteId, siteId), isNull(shPublishLog.siteId)); }
export function shMetricsScope(siteId: number) { return or(eq(shPostMetrics.siteId, siteId), isNull(shPostMetrics.siteId)); }
export function shQueueScope(siteId: number) { return or(eq(shQueue.siteId, siteId), isNull(shQueue.siteId)); }

export function redditStatuses(value: string | null) {
  const allowed = ['pending', 'approved', 'rejected'];
  const parsed = (value ?? 'pending').split(',').map((entry) => entry.trim()).filter(Boolean);
  return parsed.filter((entry) => allowed.includes(entry));
}

export function ytStatuses(value: string | null) {
  const allowed = ['pending', 'approved', 'rejected'];
  const parsed = (value ?? 'pending').split(',').map((entry) => entry.trim()).filter(Boolean);
  return parsed.filter((entry) => allowed.includes(entry));
}

export function createSessionCookie(token: string) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${7 * 24 * 60 * 60}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sessionCanAccessSite(session: Pick<SessionRecord, 'siteId'>, site: Pick<SiteRecord, 'id'>) {
  return !session.siteId || session.siteId === site.id;
}

export function getPathSegments(req: http.IncomingMessage) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  return { url, pathname: url.pathname, segments: url.pathname.split('/').filter(Boolean) };
}

export function serializeRecentRun(run: typeof geoRuns.$inferSelect | null) {
  if (!run) return null;
  return { id: run.id, runAt: run.runAt, gapsFound: run.gapsFound, gapsDeduped: run.gapsDeduped, queriesCount: run.queriesCount, draftsGenerated: run.draftsGenerated };
}

export async function fetchUploadPostMetrics(externalPostId: string) {
  const apiKey = process.env.UPLOADPOST_API_KEY;
  if (!apiKey) throw new Error('[sh-metrics] UPLOADPOST_API_KEY environment variable is not set');
  const response = await fetch(`https://api.upload-post.com/api/status/${externalPostId}`, {
    method: 'GET',
    headers: { Authorization: `Apikey ${apiKey}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`[sh-metrics] Upload-Post status API error ${response.status}: ${text}`);
  }
  return response.json();
}

export function runBcScript(args: string[], env: Record<string, string>, marker: RegExp, quotaToken?: string) {
  return new Promise<{ count: number; logs: string[]; error?: string }>((resolve) => {
    let count = 0;
    let stderr = '';
    const logs: string[] = [];
    const child = spawn('npx', ['tsx', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      shell: true,
    });
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        logs.push(trimmed);
        const match = trimmed.match(marker);
        if (match) count = Number.parseInt(match[1], 10);
        if (quotaToken && trimmed.includes(quotaToken)) resolve({ count: 0, logs, error: quotaToken });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) resolve({ count, logs, error: stderr.slice(-500) || `exit code ${code}` });
      else resolve({ count, logs });
    });
    child.on('error', (error) => resolve({ count: 0, logs, error: error.message }));
  });
}

export async function redditSourcePosts(postIds: number[]) {
  if (postIds.length === 0) return [];
  return db.select({
    id: redditPosts.id, title: redditPosts.title, subreddit: redditPosts.subreddit, upvotes: redditPosts.upvotes, url: redditPosts.url,
  }).from(redditPosts).where(inArray(redditPosts.id, postIds));
}

export async function hydrateRedditGaps(rows: Array<typeof redditExtractedGaps.$inferSelect>) {
  return Promise.all(rows.map(async (gap) => ({
    ...gap,
    sourcePosts: await redditSourcePosts(((gap as any).sourcePostIds || []).slice(0, 3)),
  })));
}

export async function ytSourceComments(commentIds: number[]) {
  if (commentIds.length === 0) return [];
  return db.select({
    id: ytComments.id, commentText: ytComments.commentText, author: ytComments.author, voteCount: ytComments.voteCount, videoTitle: ytComments.videoTitle,
  }).from(ytComments).where(inArray(ytComments.id, commentIds));
}

export async function hydrateYtGaps(rows: Array<typeof ytExtractedGaps.$inferSelect>) {
  return Promise.all(rows.map(async (gap) => ({
    ...gap,
    sourceComments: await ytSourceComments(((gap as any).sourceCommentIds || []).slice(0, 3)),
  })));
}

export function shPreview(text: string | null | undefined, maxLen = 400) {
  if (!text) return '';
  const normalized = text.trim();
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1)}\u2026`;
}

export function shFormatMeta(obj: Record<string, any>) {
  const parts: string[] = [];
  if (obj.status) parts.push(obj.status);
  if (obj.category) parts.push(obj.category);
  if (obj.dominantEmotion) parts.push(obj.dominantEmotion);
  if (obj.emotionalIntensity) parts.push(`intensity: ${obj.emotionalIntensity}/10`);
  if (obj.aggregateIntensity) parts.push(`intensity: ${obj.aggregateIntensity}/10`);
  if (obj.confidenceScore) parts.push(`score: ${obj.confidenceScore}%`);
  if (obj.frequency) parts.push(`mentions: ${obj.frequency}`);
  if (obj.author) parts.push(`by ${obj.author}`);
  if (obj.sourceVideoTitle) parts.push(`vid: ${String(obj.sourceVideoTitle).slice(0, 30)}\u2026`);
  if (Array.isArray(obj.tags) && obj.tags.length > 0) parts.push(obj.tags.slice(0, 4).join(', '));
  if (obj.publishedAt) parts.push(new Date(obj.publishedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }));
  return parts.filter(Boolean).join(' \u00B7 ');
}

export function parseShSuggestionPrompt(value: string | null | undefined) {
  const marker = '[[VIRAL_ENGINE_META_V1]]';
  const markerEnd = '[[/VIRAL_ENGINE_META_V1]]';
  if (!value) return { prompt: null, viralEngine: null };
  const start = value.lastIndexOf(marker);
  const end = value.lastIndexOf(markerEnd);
  if (start === -1 || end === -1 || end <= start) return { prompt: value, viralEngine: null };
  const before = value.slice(0, start).trim();
  const raw = value.slice(start + marker.length, end).trim();
  try { return { prompt: before || null, viralEngine: JSON.parse(raw) }; }
  catch { return { prompt: value, viralEngine: null }; }
}

export function normalizeShViralEnginePayload(body: Record<string, unknown>, outputFormat: string) {
  const nested = typeof body.viralEngine === 'object' && body.viralEngine ? body.viralEngine as Record<string, unknown> : {};
  const asOptionalString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const asBoolean = (value: unknown, fallback: boolean) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    if (typeof value === 'number') return value !== 0;
    return fallback;
  };
  const asStringArray = (value: unknown) => Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const mode = body.viralEngineMode === 'personalized' || nested.mode === 'personalized' ? 'personalized' : 'default';
  const appliedTo = outputFormat === 'video' ? 'video' : 'written';
  const allowedFormats = [
    ...asStringArray((nested.video as Record<string, unknown> | undefined)?.allowedFormats),
    ...asStringArray((nested.video as Record<string, unknown> | undefined)?.defaultFormats),
  ];
  return {
    enabled: asBoolean(body.viralEngineEnabled ?? nested.enabled, true),
    mode,
    personalization: asOptionalString(body.viralEnginePersonalization ?? nested.personalization ?? nested.personalizationNotes ?? nested.notes),
    appliedTo,
    contentFormat: outputFormat,
    pcm: {
      profile: asOptionalString(body.pcmProfileOverride ?? nested.pcmProfileOverride ?? (nested.written as Record<string, unknown> | undefined)?.defaultPcmProfile ?? (nested.written as Record<string, unknown> | undefined)?.pcmProfile ?? nested.pcmProfile),
      fivePoint: appliedTo === 'written'
        ? {
            coreAudienceState: asOptionalString((nested.written as Record<string, unknown> | undefined)?.coreAudienceState) ?? 'Aligned with source intent',
            dominantNeed: asOptionalString((nested.written as Record<string, unknown> | undefined)?.dominantNeed) ?? 'Clarity and relevance',
            communicationStyle: asOptionalString((nested.written as Record<string, unknown> | undefined)?.communicationStyle) ?? 'Plain, direct, high-signal',
            toneAndLanguage: asOptionalString((nested.written as Record<string, unknown> | undefined)?.toneAndLanguage) ?? 'Brand-safe, concise, human',
            ctaStyle: asOptionalString((nested.written as Record<string, unknown> | undefined)?.ctaStyle) ?? 'Low-friction invitation',
          }
        : null,
    },
    video: {
      selectedFormat: asOptionalString(body.videoFormatSlug ?? nested.videoFormatSlug ?? (nested.video as Record<string, unknown> | undefined)?.preferredPrimaryFormat),
      allowedFormats,
    },
  };
}

export function encodeShSuggestionPrompt(suggestionPrompt: string | null | undefined, viralEngine: Record<string, unknown>) {
  const marker = '[[VIRAL_ENGINE_META_V1]]';
  const markerEnd = '[[/VIRAL_ENGINE_META_V1]]';
  const userPrompt = typeof suggestionPrompt === 'string' && suggestionPrompt.trim() ? suggestionPrompt.trim() : null;
  const payload = `${marker}\n${JSON.stringify(viralEngine, null, 2)}\n${markerEnd}`;
  return userPrompt ? `${userPrompt}\n\n${payload}` : payload;
}

// --- Auth & context resolution ---

export async function getSiteBySlug(slug: string) {
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  return site ?? null;
}

export async function getSiteById(id: number) {
  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return site ?? null;
}

export async function requireActiveSite(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  if (!session.activeSiteId) {
    json(res, 403, { error: 'No active tenant selected' });
    return null;
  }
  const site = await getSiteById(session.activeSiteId);
  if (!site) {
    json(res, 404, { error: 'Active tenant not found' });
    return null;
  }
  return { session, site };
}

export async function getSession(req: http.IncomingMessage) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function requireAuth(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = await getSession(req);
  if (!session) {
    json(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return session;
}

export function ensureSiteAccess(session: SessionRecord, site: SiteRecord, res: http.ServerResponse) {
  if (!sessionCanAccessSite(session, site)) {
    json(res, 403, { error: 'Forbidden for selected site' });
    return false;
  }
  return true;
}

export async function resolveAuthedSite(req: http.IncomingMessage, res: http.ServerResponse, siteSlug: string) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  const site = await getSiteBySlug(siteSlug);
  if (!site) {
    json(res, 404, { error: 'Site not found' });
    return null;
  }
  if (!ensureSiteAccess(session, site, res)) return null;
  return { session, site };
}

export async function resolveBcProjectContext(req: http.IncomingMessage, res: http.ServerResponse, projectIdValue: unknown) {
  const context = await requireActiveSite(req, res);
  if (!context) return null;
  const projectId = Number(projectIdValue);
  if (!projectId) {
    json(res, 400, { error: 'Invalid projectId' });
    return null;
  }
  const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(context.site.id))).limit(1);
  if (!project) {
    json(res, 404, { error: 'Not found' });
    return null;
  }
  return { ...context, projectId, project };
}

export async function enqueueDraftJob(siteId: number, gapId: number, model: string, authorNotes: string) {
  const [job] = await db.insert(appJobs).values({ siteId, type: 'draft', topic: 'draft', payload: { gapId, model, authorNotes } }).returning();
  return job;
}

export async function enqueueAppJob(siteId: number, type: string, topic: string, payload: Record<string, unknown>) {
  const [job] = await db.insert(appJobs).values({ siteId, type, topic, payload }).returning();
  return job;
}

export async function findLatestJobByPayload(topic: string, payloadKey: string, payloadValue: number | string, siteId?: number | null) {
  const [job] = await db.select()
    .from(appJobs)
    .where(and(
      eq(appJobs.topic, topic),
      siteId ? eq(appJobs.siteId, siteId) : undefined,
      sql`${appJobs.payload}->>${payloadKey} = ${String(payloadValue)}`,
    ))
    .orderBy(desc(appJobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function findActiveJobByPayload(topic: string, payloadKey: string, payloadValue: number | string, siteId?: number | null) {
  const [job] = await db.select()
    .from(appJobs)
    .where(and(
      eq(appJobs.topic, topic),
      siteId ? eq(appJobs.siteId, siteId) : undefined,
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>${payloadKey} = ${String(payloadValue)}`,
    ))
    .orderBy(desc(appJobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function resolveShSite(req: http.IncomingMessage, res: http.ServerResponse) {
  return requireActiveSite(req, res);
}

export async function resolveShBriefContext(req: http.IncomingMessage, res: http.ServerResponse, briefIdValue: unknown) {
  const context = await resolveShSite(req, res);
  if (!context) return null;
  const briefId = Number(briefIdValue);
  if (!briefId) {
    json(res, 400, { error: 'Invalid brief id' });
    return null;
  }
  const [brief] = await db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(context.site.id))).limit(1);
  if (!brief) {
    json(res, 404, { error: 'Brief not found' });
    return null;
  }
  return { ...context, briefId, brief };
}

// Re-export everything routes need from drizzle and schema
export { db, and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql };
export { crypto, bcrypt };
export {
  appJobs, articleGenerations, articles, bcExtractedPainPoints, bcIterationSelections, bcIterations,
  bcLandingPageVariants, bcProjects, bcPainClusters, bcSettings, bcTargetChannels, bcTargetVideos,
  contentGaps, geoQueries, geoRuns, knowledgeEntries, knowledgeSources,
  redditExtractedGaps, redditPosts, redditScrapeRuns, redditTargets, sessions,
  shContentBriefs, shGeneratedCopy, shMediaAssets, shPostMetrics, shPublishLog, shQueue,
  shSettings, shSocialAccounts, shTemplates, sites, ytComments, ytExtractedGaps, ytScrapeRuns, ytTargets,
};
