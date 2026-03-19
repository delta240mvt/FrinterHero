// @ts-nocheck
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
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
import { getDefaultTemplates, renderSocialImage } from '../../../src/lib/sh-image-gen';
import { BC_SETTINGS_DEFAULTS, getBcSettings, saveBcSettings } from '../../../src/lib/bc-settings';
import { matchKbEntries } from '../../../src/lib/sh-kb-matcher';
import { loadSource } from '../../../src/lib/sh-source-loader';
import { SH_SETTINGS_DEFAULTS, getShSettings, normalizeShSettingsConfig, saveShSettings } from '../../../src/lib/sh-settings';
import { SOURCE_TYPES, isValidSourceType } from '../../../src/lib/sh-source-types';
import { publishBrief } from '../../../src/lib/sh-distributor';
import { findOffBrandMatch } from '../../../src/utils/brandFilter';
import { importMarkdownFiles } from '../../../src/utils/kb-importer';
import { calculateReadingTime, parseMarkdown } from '../../../src/utils/markdown';
import { generateSlug } from '../../../src/utils/slug';

type Json = Record<string, unknown>;
type SessionRecord = typeof sessions.$inferSelect;
type SiteRecord = typeof sites.$inferSelect;

dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env.local') });

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';
const SESSION_COOKIE = 'session';
const DEFAULT_SITE_SLUG = 'przemyslawfilipiak';
const KB_TYPES = ['project_spec', 'published_article', 'external_research', 'personal_note'] as const;
const ACK_ACTIONS = ['generate_draft', 'snooze', 'archive'] as const;
const SH_TEMPLATE_REQUIRED_FIELDS = ['name', 'slug', 'category', 'aspectRatio', 'jsxTemplate'] as const;

function json(res: http.ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

async function readJsonBody(req: http.IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Json;
}

function toPositiveInt(value: string | null, fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toNonNegativeInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, Math.min(max, parsed));
}

function normalizeSiteSlug(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SITE_SLUG;
}

function firstQueryValue(url: URL, ...keys: string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value !== null) return value;
  }
  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function articleScope(siteId: number) { return or(eq(articles.siteId, siteId), isNull(articles.siteId)); }
function kbScope(siteId: number) { return or(eq(knowledgeEntries.siteId, siteId), isNull(knowledgeEntries.siteId)); }
function gapScope(siteId: number) { return or(eq(contentGaps.siteId, siteId), isNull(contentGaps.siteId)); }
function geoRunScope(siteId: number) { return or(eq(geoRuns.siteId, siteId), isNull(geoRuns.siteId)); }
function redditTargetScope(siteId: number) { return or(eq(redditTargets.siteId, siteId), isNull(redditTargets.siteId)); }
function redditRunScope(siteId: number) { return or(eq(redditScrapeRuns.siteId, siteId), isNull(redditScrapeRuns.siteId)); }
function redditPostScope(siteId: number) { return or(eq(redditPosts.siteId, siteId), isNull(redditPosts.siteId)); }
function redditGapScope(siteId: number) { return or(eq(redditExtractedGaps.siteId, siteId), isNull(redditExtractedGaps.siteId)); }
function ytTargetScope(siteId: number) { return or(eq(ytTargets.siteId, siteId), isNull(ytTargets.siteId)); }
function ytRunScope(siteId: number) { return or(eq(ytScrapeRuns.siteId, siteId), isNull(ytScrapeRuns.siteId)); }
function ytCommentScope(siteId: number) { return or(eq(ytComments.siteId, siteId), isNull(ytComments.siteId)); }
function ytGapScope(siteId: number) { return or(eq(ytExtractedGaps.siteId, siteId), isNull(ytExtractedGaps.siteId)); }
function bcProjectScope(siteId: number) { return or(eq(bcProjects.siteId, siteId), isNull(bcProjects.siteId)); }
function bcChannelScope(siteId: number) { return or(eq(bcTargetChannels.siteId, siteId), isNull(bcTargetChannels.siteId)); }
function bcVideoScope(siteId: number) { return or(eq(bcTargetVideos.siteId, siteId), isNull(bcTargetVideos.siteId)); }
function bcPainPointScope(siteId: number) { return or(eq(bcExtractedPainPoints.siteId, siteId), isNull(bcExtractedPainPoints.siteId)); }
function bcSettingsScope(siteId: number) { return or(eq(bcSettings.siteId, siteId), isNull(bcSettings.siteId)); }
function bcClusterScope(siteId: number) { return or(eq(bcPainClusters.siteId, siteId), isNull(bcPainClusters.siteId)); }
function shSettingsScope(siteId: number) { return or(eq(shSettings.siteId, siteId), isNull(shSettings.siteId)); }
function shAccountScope(siteId: number) { return or(eq(shSocialAccounts.siteId, siteId), isNull(shSocialAccounts.siteId)); }
function shBriefScope(siteId: number) { return or(eq(shContentBriefs.siteId, siteId), isNull(shContentBriefs.siteId)); }
function shCopyScope(siteId: number) { return or(eq(shGeneratedCopy.siteId, siteId), isNull(shGeneratedCopy.siteId)); }
function shTemplateScope(siteId: number) { return or(eq(shTemplates.siteId, siteId), isNull(shTemplates.siteId)); }
function shMediaScope(siteId: number) { return or(eq(shMediaAssets.siteId, siteId), isNull(shMediaAssets.siteId)); }
function shPublishScope(siteId: number) { return or(eq(shPublishLog.siteId, siteId), isNull(shPublishLog.siteId)); }
function shMetricsScope(siteId: number) { return or(eq(shPostMetrics.siteId, siteId), isNull(shPostMetrics.siteId)); }
function shQueueScope(siteId: number) { return or(eq(shQueue.siteId, siteId), isNull(shQueue.siteId)); }
function redditStatuses(value: string | null) {
  const allowed = ['pending', 'approved', 'rejected'];
  const parsed = (value ?? 'pending').split(',').map((entry) => entry.trim()).filter(Boolean);
  return parsed.filter((entry) => allowed.includes(entry));
}

function ytStatuses(value: string | null) {
  const allowed = ['pending', 'approved', 'rejected'];
  const parsed = (value ?? 'pending').split(',').map((entry) => entry.trim()).filter(Boolean);
  return parsed.filter((entry) => allowed.includes(entry));
}

function createSessionCookie(token: string) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${7 * 24 * 60 * 60}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function getPathSegments(req: http.IncomingMessage) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  return { url, pathname: url.pathname, segments: url.pathname.split('/').filter(Boolean) };
}

function serializeRecentRun(run: typeof geoRuns.$inferSelect | null) {
  if (!run) return null;
  return { id: run.id, runAt: run.runAt, gapsFound: run.gapsFound, gapsDeduped: run.gapsDeduped, queriesCount: run.queriesCount, draftsGenerated: run.draftsGenerated };
}

async function fetchUploadPostMetrics(externalPostId: string) {
  const apiKey = process.env.UPLOADPOST_API_KEY;
  if (!apiKey) throw new Error('[sh-metrics] UPLOADPOST_API_KEY environment variable is not set');

  const response = await fetch(`https://api.upload-post.com/api/status/${externalPostId}`, {
    method: 'GET',
    headers: {
      Authorization: `Apikey ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`[sh-metrics] Upload-Post status API error ${response.status}: ${text}`);
  }

  return response.json();
}

function runBcScript(args: string[], env: Record<string, string>, marker: RegExp, quotaToken?: string) {
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

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) resolve({ count, logs, error: stderr.slice(-500) || `exit code ${code}` });
      else resolve({ count, logs });
    });

    child.on('error', (error) => resolve({ count: 0, logs, error: error.message }));
  });
}

async function redditSourcePosts(postIds: number[]) {
  if (postIds.length === 0) return [];
  return db.select({
    id: redditPosts.id,
    title: redditPosts.title,
    subreddit: redditPosts.subreddit,
    upvotes: redditPosts.upvotes,
    url: redditPosts.url,
  }).from(redditPosts).where(inArray(redditPosts.id, postIds));
}

async function hydrateRedditGaps(rows: Array<typeof redditExtractedGaps.$inferSelect>) {
  return Promise.all(rows.map(async (gap) => ({
    ...gap,
    sourcePosts: await redditSourcePosts((gap.sourcePostIds || []).slice(0, 3)),
  })));
}

async function ytSourceComments(commentIds: number[]) {
  if (commentIds.length === 0) return [];
  return db.select({
    id: ytComments.id,
    commentText: ytComments.commentText,
    author: ytComments.author,
    voteCount: ytComments.voteCount,
    videoTitle: ytComments.videoTitle,
  }).from(ytComments).where(inArray(ytComments.id, commentIds));
}

async function hydrateYtGaps(rows: Array<typeof ytExtractedGaps.$inferSelect>) {
  return Promise.all(rows.map(async (gap) => ({
    ...gap,
    sourceComments: await ytSourceComments((gap.sourceCommentIds || []).slice(0, 3)),
  })));
}

function shPreview(text: string | null | undefined, maxLen = 400) {
  if (!text) return '';
  const normalized = text.trim();
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen - 1)}…`;
}

function shFormatMeta(obj: Record<string, any>) {
  const parts: string[] = [];
  if (obj.status) parts.push(obj.status);
  if (obj.category) parts.push(obj.category);
  if (obj.dominantEmotion) parts.push(obj.dominantEmotion);
  if (obj.emotionalIntensity) parts.push(`intensity: ${obj.emotionalIntensity}/10`);
  if (obj.aggregateIntensity) parts.push(`intensity: ${obj.aggregateIntensity}/10`);
  if (obj.confidenceScore) parts.push(`score: ${obj.confidenceScore}%`);
  if (obj.frequency) parts.push(`mentions: ${obj.frequency}`);
  if (obj.author) parts.push(`by ${obj.author}`);
  if (obj.sourceVideoTitle) parts.push(`vid: ${String(obj.sourceVideoTitle).slice(0, 30)}…`);
  if (Array.isArray(obj.tags) && obj.tags.length > 0) parts.push(obj.tags.slice(0, 4).join(', '));
  if (obj.publishedAt) parts.push(new Date(obj.publishedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }));
  return parts.filter(Boolean).join(' · ');
}

function parseShSuggestionPrompt(value: string | null | undefined) {
  const marker = '[[VIRAL_ENGINE_META_V1]]';
  const markerEnd = '[[/VIRAL_ENGINE_META_V1]]';
  if (!value) return { prompt: null, viralEngine: null };
  const start = value.lastIndexOf(marker);
  const end = value.lastIndexOf(markerEnd);
  if (start === -1 || end === -1 || end <= start) {
    return { prompt: value, viralEngine: null };
  }
  const before = value.slice(0, start).trim();
  const raw = value.slice(start + marker.length, end).trim();
  try {
    return { prompt: before || null, viralEngine: JSON.parse(raw) };
  } catch {
    return { prompt: value, viralEngine: null };
  }
}

function normalizeShViralEnginePayload(body: Record<string, unknown>, outputFormat: string) {
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

function encodeShSuggestionPrompt(suggestionPrompt: string | null | undefined, viralEngine: Record<string, unknown>) {
  const marker = '[[VIRAL_ENGINE_META_V1]]';
  const markerEnd = '[[/VIRAL_ENGINE_META_V1]]';
  const userPrompt = typeof suggestionPrompt === 'string' && suggestionPrompt.trim() ? suggestionPrompt.trim() : null;
  const payload = `${marker}\n${JSON.stringify(viralEngine, null, 2)}\n${markerEnd}`;
  return userPrompt ? `${userPrompt}\n\n${payload}` : payload;
}

async function getSiteBySlug(slug: string) {
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  return site ?? null;
}

async function getSession(req: http.IncomingMessage) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

async function requireAuth(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = await getSession(req);
  if (!session) {
    json(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return session;
}

function ensureSiteAccess(session: SessionRecord, site: SiteRecord, res: http.ServerResponse) {
  if (session.siteId && session.siteId !== site.id) {
    json(res, 403, { error: 'Forbidden for selected site' });
    return false;
  }
  return true;
}

async function resolveAuthedSite(req: http.IncomingMessage, res: http.ServerResponse, siteSlug: string) {
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

async function resolveBcProjectContext(req: http.IncomingMessage, res: http.ServerResponse, siteSlug: string, projectIdValue: unknown) {
  const context = await resolveAuthedSite(req, res, siteSlug);
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

async function enqueueDraftJob(siteId: number, gapId: number, model: string, authorNotes: string) {
  const [job] = await db.insert(appJobs).values({ siteId, type: 'draft', topic: 'draft', payload: { gapId, model, authorNotes } }).returning();
  return job;
}

async function enqueueAppJob(siteId: number, type: string, topic: string, payload: Record<string, unknown>) {
  const [job] = await db.insert(appJobs).values({ siteId, type, topic, payload }).returning();
  return job;
}

async function findLatestJobByPayload(topic: string, payloadKey: string, payloadValue: number | string, siteId?: number | null) {
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

async function findActiveJobByPayload(topic: string, payloadKey: string, payloadValue: number | string, siteId?: number | null) {
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

async function resolveShSite(req: http.IncomingMessage, res: http.ServerResponse, siteSlug: string) {
  return resolveAuthedSite(req, res, siteSlug);
}

async function resolveShBriefContext(req: http.IncomingMessage, res: http.ServerResponse, siteSlug: string, briefIdValue: unknown) {
  const context = await resolveShSite(req, res, siteSlug);
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

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const method = req.method ?? 'GET';
  const { url, pathname, segments } = getPathSegments(req);
  if (pathname === '/health' || pathname === '/live' || pathname === '/ready') {
    json(res, 200, { service: 'api', status: 'ok', path: pathname, timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'sites' && segments[3] === 'public-config') {
    const site = segments[2] ? await getSiteBySlug(segments[2]) : null;
    if (!site) return json(res, 404, { error: 'Site not found' });
    json(res, 200, {
      slug: site.slug,
      status: site.status,
      displayName: site.displayName,
      primaryDomain: site.primaryDomain,
      brandConfig: site.brandConfig,
      seoConfig: site.seoConfig,
      featureFlags: site.featureFlags,
      llmContext: site.llmContext,
    });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'articles' && segments.length === 2) {
    const site = await getSiteBySlug(normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!site) return json(res, 404, { error: 'Site not found' });
    const status = url.searchParams.get('status') ?? 'published';
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 1000);
    const rows = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.status, status))).orderBy(desc(articles.publishedAt), desc(articles.createdAt)).limit(limit).offset(offset);
    json(res, 200, { results: rows, pagination: { limit, offset } });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'articles' && segments.length === 3) {
    const site = await getSiteBySlug(normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!site) return json(res, 404, { error: 'Site not found' });
    const [article] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.slug, decodeURIComponent(segments[2])))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' });
    json(res, 200, article);
    return;
  }

  if (method === 'POST' && pathname === '/v1/auth/login') {
    const body = await readJsonBody(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const site = await getSiteBySlug(normalizeSiteSlug(body.siteSlug));
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!password || !hash) return json(res, 400, { error: 'Password required or server misconfigured' });
    if (!site) return json(res, 404, { error: 'Site not found' });
    if (!(await bcrypt.compare(password, hash))) return json(res, 401, { error: 'Invalid credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({ token, expiresAt, siteId: site.id });
    json(res, 200, { ok: true, siteSlug: site.slug }, { 'Set-Cookie': createSessionCookie(token) });
    return;
  }

  if (method === 'GET' && pathname === '/v1/auth/me') {
    const session = await getSession(req);
    if (!session) return json(res, 401, { authenticated: false });
    json(res, 200, { authenticated: true, session: { id: session.id, siteId: session.siteId ?? null, expiresAt: session.expiresAt } });
    return;
  }

  if (method === 'POST' && pathname === '/v1/auth/logout') {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await db.delete(sessions).where(eq(sessions.token, token));
    json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/dashboard') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [articleStats, gapStats, kbStats] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int`, published: sql<number>`count(*) filter (where status = 'published')::int`, draft: sql<number>`count(*) filter (where status = 'draft')::int` }).from(articles).where(articleScope(site.id)),
      db.select({ total: sql<number>`count(*)::int`, open: sql<number>`count(*) filter (where status in ('new', 'acknowledged', 'in_progress'))::int` }).from(contentGaps).where(gapScope(site.id)),
      db.select({ total: sql<number>`count(*)::int` }).from(knowledgeEntries).where(kbScope(site.id)),
    ]);
    json(res, 200, { site: { slug: site.slug, displayName: site.displayName }, articles: articleStats[0], contentGaps: gapStats[0], knowledgeBase: kbStats[0] });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/geo/runs') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const rows = await db.select().from(geoRuns).where(geoRunScope(site.id)).orderBy(desc(geoRuns.runAt)).limit(limit);
    json(res, 200, { runs: rows.map((run) => serializeRecentRun(run)) });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'geo' && segments[3] === 'runs' && segments[4]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const runId = Number(segments[4]);
    if (!runId) return json(res, 400, { error: 'Invalid run id' });

    const [run] = await db.select().from(geoRuns).where(and(geoRunScope(site.id), eq(geoRuns.id, runId))).limit(1);
    if (!run) return json(res, 404, { error: 'Run not found' });

    const runStart = new Date(run.runAt.getTime() - 5 * 60 * 1000);
    const runEnd = new Date(run.runAt.getTime() + 60 * 60 * 1000);
    const [queries, drafts] = await Promise.all([
      db.select().from(geoQueries).where(and(gte(geoQueries.createdAt, runStart), lte(geoQueries.createdAt, runEnd))),
      db.select().from(articles).where(and(articleScope(site.id), eq(articles.status, 'draft'), gte(articles.createdAt, runStart), lte(articles.createdAt, runEnd))),
    ]);

    json(res, 200, { run, queries, drafts });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/articles') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const search = url.searchParams.get('search')?.trim() ?? '';
    const status = url.searchParams.get('status')?.trim() ?? '';
    const conditions: any[] = [articleScope(site.id)];
    if (search) conditions.push(ilike(articles.title, `%${search}%`));
    if (status) conditions.push(eq(articles.status, status));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const offset = (page - 1) * limit;
    const [rows, totals] = await Promise.all([
      db.select().from(articles).where(whereClause).orderBy(desc(articles.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(articles).where(whereClause),
    ]);
    json(res, 200, { results: rows, total: totals[0]?.total ?? 0, page, limit });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' });
    const [article] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' });
    json(res, 200, article);
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/articles') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return json(res, 400, { error: 'title is required' });
    const slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : generateSlug(title);
    const [existing] = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, slug)).limit(1);
    if (existing) return json(res, 409, { error: 'Article slug already exists' });
    const htmlContent = parseMarkdown(typeof body.content === 'string' ? body.content : '');
    const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'draft';
    const [created] = await db.insert(articles).values({
      siteId: site.id,
      slug,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      content: htmlContent,
      tags: parseTags(body.tags),
      featured: Boolean(body.featured),
      status,
      readingTime: calculateReadingTime(htmlContent),
      author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : site.displayName,
      publishedAt: status === 'published' ? new Date() : null,
    }).returning();
    json(res, 201, { id: created.id, slug: created.slug, status: created.status, publishedAt: created.publishedAt, updatedAt: created.updatedAt });
    return;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' });
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [existing] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Article not found' });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim() || generateSlug(String(body.title ?? existing.title));
      const [collision] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, slug), sql`${articles.id} <> ${articleId}`)).limit(1);
      if (collision) return json(res, 409, { error: 'Article slug already exists' });
      updates.slug = slug;
    }
    if (body.description !== undefined) updates.description = body.description ? String(body.description) : null;
    if (body.content !== undefined) {
      const htmlContent = parseMarkdown(String(body.content));
      updates.content = htmlContent;
      updates.readingTime = calculateReadingTime(htmlContent);
    }
    if (body.tags !== undefined) updates.tags = parseTags(body.tags);
    if (body.featured !== undefined) updates.featured = Boolean(body.featured);
    if (body.author !== undefined) updates.author = String(body.author).trim();
    if (body.status !== undefined) {
      const nextStatus = String(body.status).trim();
      updates.status = nextStatus;
      updates.publishedAt = nextStatus === 'published' ? (existing.publishedAt ?? new Date()) : null;
    }
    const [updated] = await db.update(articles).set(updates).where(eq(articles.id, articleId)).returning();
    json(res, 200, updated);
    return;
  }

  if (method === 'DELETE' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && !segments[4]) {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' });
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [existing] = await db.select({ id: articles.id }).from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Article not found' });
    await db.delete(articles).where(eq(articles.id, articleId));
    json(res, 200, { success: true, deletedId: articleId });
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/articles/bulk-delete') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => Number(id)).filter(Boolean) : [];
    if (ids.length === 0) return json(res, 400, { error: 'ids are required' });
    const existing = await db.select({ id: articles.id }).from(articles).where(and(articleScope(site.id), inArray(articles.id, ids)));
    if (existing.length === 0) return json(res, 404, { error: 'No matching articles found' });
    await db.delete(articles).where(inArray(articles.id, existing.map((row) => row.id)));
    json(res, 200, { success: true, deletedIds: existing.map((row) => row.id), deletedCount: existing.length });
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'articles' && segments[3] && segments[4] === 'publish') {
    const articleId = Number(segments[3]);
    if (!articleId) return json(res, 400, { error: 'Invalid article id' });
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [article] = await db.select().from(articles).where(and(articleScope(site.id), eq(articles.id, articleId))).limit(1);
    if (!article) return json(res, 404, { error: 'Article not found' });
    if (article.status === 'published') return json(res, 409, { error: 'Article already published' });
    const publishedAt = body.publishedAt ? new Date(String(body.publishedAt)) : new Date();
    const [updated] = await db.update(articles).set({ status: 'published', publishedAt, updatedAt: new Date() }).where(eq(articles.id, articleId)).returning();
    if (article.sourceGapId) await db.update(contentGaps).set({ status: 'acknowledged', acknowledgedAt: new Date() }).where(eq(contentGaps.id, article.sourceGapId));
    const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent }).from(articleGenerations).where(eq(articleGenerations.articleId, articleId)).limit(1);
    if (generation) {
      await db.update(articleGenerations).set({ publicationTimestamp: new Date(), finalContent: updated.content, contentChanged: generation.originalContent !== updated.content }).where(eq(articleGenerations.id, generation.id));
    }
    json(res, 200, { id: updated.id, slug: updated.slug, status: updated.status, publishedAt: updated.publishedAt, url: `/blog/${updated.slug}` });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/article-generations') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const articleId = toPositiveInt(firstQueryValue(url, 'articleId', 'article_id'), 0);
    const gapId = toPositiveInt(firstQueryValue(url, 'gapId', 'gap_id'), 0);
    const conditions: any[] = [articleScope(site.id)];
    if (articleId > 0) conditions.push(eq(articleGenerations.articleId, articleId));
    if (gapId > 0) conditions.push(eq(articleGenerations.gapId, gapId));

    const rows = await db.select({
      id: articleGenerations.id,
      articleId: articleGenerations.articleId,
      gapId: articleGenerations.gapId,
      generatedByModel: articleGenerations.generatedByModel,
      generationTimestamp: articleGenerations.generationTimestamp,
      publicationTimestamp: articleGenerations.publicationTimestamp,
      contentChanged: articleGenerations.contentChanged,
      kbEntriesUsed: articleGenerations.kbEntriesUsed,
      modelsQueried: articleGenerations.modelsQueried,
      authorNotes: articleGenerations.authorNotes,
    })
      .from(articleGenerations)
      .innerJoin(articles, eq(articles.id, articleGenerations.articleId))
      .where(and(...conditions));

    const generations = rows.map(({ id, articleId, gapId, generatedByModel, generationTimestamp, publicationTimestamp, contentChanged, kbEntriesUsed, modelsQueried, authorNotes }) => ({
      id,
      articleId,
      gapId,
      generatedByModel,
      generationTimestamp,
      publicationTimestamp,
      contentChanged,
      kbEntriesUsed,
      modelsQueried,
      authorNotes,
      original_content_length: 0,
      final_content_length: 0,
    }));

    json(res, 200, { generations });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/knowledge-base') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const search = url.searchParams.get('search')?.trim() ?? '';
    const tagsParam = url.searchParams.get('tags')?.trim() ?? '';
    const type = url.searchParams.get('type')?.trim() ?? '';
    const sortBy = url.searchParams.get('sort_by') ?? 'importance';
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 5000);
    const conditions: any[] = [kbScope(site.id)];
    if (type) conditions.push(eq(knowledgeEntries.type, type));
    if (tagsParam) for (const tag of tagsParam.split(',').map((entry) => entry.trim()).filter(Boolean)) conditions.push(sql`${knowledgeEntries.tags} @> ARRAY[${tag}]::text[]`);
    if (search) conditions.push(or(ilike(knowledgeEntries.title, `%${search}%`), sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${search})`));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const orderBy = sortBy === 'recency' ? desc(knowledgeEntries.createdAt) : desc(knowledgeEntries.importanceScore);
    const [rows, totals] = await Promise.all([
      db.select().from(knowledgeEntries).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(knowledgeEntries).where(whereClause),
    ]);
    json(res, 200, { entries: rows, pagination: { total: totals[0]?.total ?? 0, limit, offset } });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' });
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [entry] = await db.select().from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!entry) return json(res, 404, { error: 'Knowledge entry not found' });
    json(res, 200, entry);
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/knowledge-base') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const fieldErrors: Record<string, string> = {};
    const type = typeof body.type === 'string' ? body.type : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const sourceUrl = body.source_url ? String(body.source_url) : null;
    const tags = parseTags(body.tags);
    const projectName = body.project_name ? String(body.project_name) : null;
    const sourceId = body.source_id ? Number(body.source_id) : null;
    const importanceScore = body.importance_score === undefined ? 50 : Number(body.importance_score);
    if (!KB_TYPES.includes(type as (typeof KB_TYPES)[number])) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`;
    if (!title) fieldErrors.title = 'Required and must be non-empty';
    if (!content || content.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${content.trim().length})`;
    if (Number.isNaN(importanceScore) || importanceScore < 0 || importanceScore > 100) fieldErrors.importance_score = 'Must be 0-100';
    if (sourceUrl) { try { new URL(sourceUrl); } catch { fieldErrors.source_url = 'Must be a valid URL'; } }
    const invalidTags = tags.filter((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag));
    if (invalidTags.length > 0) fieldErrors.tags = `Invalid tags: ${invalidTags.join(', ')}`;
    if (Object.keys(fieldErrors).length > 0) return json(res, 400, { error: 'Validation failed', fields: fieldErrors });
    const duplicateFilter = sourceId ? and(eq(knowledgeEntries.title, title), eq(knowledgeEntries.sourceId, sourceId), kbScope(site.id)) : and(eq(knowledgeEntries.title, title), isNull(knowledgeEntries.sourceId), kbScope(site.id));
    const [duplicate] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(duplicateFilter).limit(1);
    if (duplicate) return json(res, 409, { error: 'Duplicate entry detected', existingId: duplicate.id });
    const [created] = await db.insert(knowledgeEntries).values({ siteId: site.id, type, title, content, sourceUrl, tags, projectName, importanceScore, sourceId }).returning();
    json(res, 201, created);
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/knowledge-base/import') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const folderName = typeof body.folderName === 'string' && body.folderName.trim() ? body.folderName.trim() : null;
    const files = Array.isArray(body.files)
      ? body.files
          .map((file) => ({
            filename: typeof file?.filename === 'string' ? file.filename : '',
            content: typeof file?.content === 'string' ? file.content : '',
          }))
          .filter((file) => file.filename.endsWith('.md') && file.content)
      : [];
    if (files.length === 0) return json(res, 400, { error: 'No .md files provided' });

    const { valid, errors } = importMarkdownFiles(files);
    const sourceName = `batch-import-${Date.now()}`;
    const [source] = await db.insert(knowledgeSources).values({
      siteId: site.id,
      sourceType: 'imported_markdown',
      sourceName,
      status: 'active',
    }).returning();

    let successCount = 0;
    const failedEntries = [...errors.map((entry) => ({ filename: entry.filename, reason: entry.errors.join('; ') }))];

    for (const entry of valid) {
      try {
        const existing = await db.select({ id: knowledgeEntries.id })
          .from(knowledgeEntries)
          .where(and(kbScope(site.id), eq(knowledgeEntries.title, entry.title), eq(knowledgeEntries.sourceId, source.id)))
          .limit(1);

        if (existing.length > 0) {
          failedEntries.push({ filename: entry.filename, reason: 'Duplicate entry (same title + source)' });
          continue;
        }

        await db.insert(knowledgeEntries).values({
          siteId: site.id,
          type: entry.type,
          title: entry.title,
          content: entry.content,
          tags: entry.tags,
          projectName: folderName || entry.projectName || null,
          importanceScore: entry.importanceScore,
          sourceUrl: entry.sourceUrl || null,
          sourceId: source.id,
        });
        successCount += 1;
      } catch (error) {
        console.error('[KB Import] Failed to insert entry:', { filename: entry.filename, error });
        failedEntries.push({ filename: entry.filename, reason: 'Database insertion error' });
      }
    }

    json(res, 200, {
      total_files: files.length,
      successful: successCount,
      failed: failedEntries.length,
      source_id: source.id,
      errors: failedEntries,
    });
    return;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' });
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [existing] = await db.select().from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Knowledge entry not found' });
    const fieldErrors: Record<string, string> = {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.type !== undefined) {
      const type = String(body.type);
      if (!KB_TYPES.includes(type as (typeof KB_TYPES)[number])) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`;
      else updates.type = type;
    }
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) fieldErrors.title = 'Must be non-empty string';
      else updates.title = title;
    }
    if (body.content !== undefined) {
      const content = String(body.content);
      if (content.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${content.trim().length})`;
      else updates.content = content;
    }
    if (body.source_url !== undefined) {
      if (body.source_url) { try { new URL(String(body.source_url)); updates.sourceUrl = String(body.source_url); } catch { fieldErrors.source_url = 'Must be a valid URL'; } }
      else updates.sourceUrl = null;
    }
    if (body.tags !== undefined) {
      const tags = parseTags(body.tags);
      const invalidTags = tags.filter((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag));
      if (invalidTags.length > 0) fieldErrors.tags = `Invalid tags: ${invalidTags.join(', ')}`;
      else updates.tags = tags;
    }
    if (body.project_name !== undefined) updates.projectName = body.project_name ? String(body.project_name) : null;
    if (body.importance_score !== undefined) {
      const importanceScore = Number(body.importance_score);
      if (Number.isNaN(importanceScore) || importanceScore < 0 || importanceScore > 100) fieldErrors.importance_score = 'Must be 0-100';
      else updates.importanceScore = importanceScore;
    }
    if (Object.keys(fieldErrors).length > 0) return json(res, 400, { error: 'Validation failed', fields: fieldErrors });
    const [updated] = await db.update(knowledgeEntries).set(updates).where(eq(knowledgeEntries.id, entryId)).returning();
    json(res, 200, updated);
    return;
  }

  if (method === 'DELETE' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' });
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [existing] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Knowledge entry not found' });
    await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, entryId));
    json(res, 200, { success: true, deletedId: entryId });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/content-gaps') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
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
    const stats = {
      ...rawStats,
      total_new: rawStats?.totalNew ?? 0,
      total_in_progress: rawStats?.totalInProgress ?? 0,
      total_acknowledged: rawStats?.totalAcknowledged ?? 0,
      total_archived: rawStats?.totalArchived ?? 0,
      total_proposals: rawStats?.totalProposals ?? 0,
    };
    json(res, 200, {
      items,
      gaps: items,
      pagination: { total: countResult[0]?.total ?? 0, limit, offset },
      stats,
      recentRun,
      recent_run: recentRun,
      kbHintsIncluded: true,
    });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && !segments[4]) {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' });
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    json(res, 200, gap);
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && segments[4] === 'acknowledge') {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' });
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const action = typeof body.action === 'string' ? body.action : '';
    if (!ACK_ACTIONS.includes(action as (typeof ACK_ACTIONS)[number])) return json(res, 400, { error: `action must be one of: ${ACK_ACTIONS.join(', ')}` });
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    if (gap.status === 'archived') return json(res, 409, { error: 'Gap already archived' });
    if (gap.status === 'acknowledged' && action !== 'generate_draft') return json(res, 409, { error: 'Gap already acknowledged' });
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : (typeof body.author_notes === 'string' ? body.author_notes : (gap.authorNotes ?? ''));
    const nextStatus = action === 'generate_draft' ? 'in_progress' : 'archived';
    const now = new Date();
    let jobId: number | null = null;
    if (action === 'generate_draft') {
      const [existingDraft] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'draft'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`)).limit(1);
      if (existingDraft) return json(res, 409, { error: 'Draft job already active for this gap', jobId: existingDraft.id });
      const job = await enqueueDraftJob(site.id, gapId, typeof body.model === 'string' ? body.model : 'anthropic/claude-sonnet-4-6', authorNotes);
      jobId = job.id;
    }
    await db.update(contentGaps).set({ status: nextStatus, authorNotes, acknowledgedAt: now }).where(eq(contentGaps.id, gapId));
    json(res, 200, {
      gapId,
      gap_id: gapId,
      status: nextStatus,
      authorNotes,
      author_notes: authorNotes,
      acknowledgedAt: now.toISOString(),
      acknowledged_at: now.toISOString(),
      jobId,
      draftGenerationStarted: action === 'generate_draft',
      draft_generation_started: action === 'generate_draft',
      draft_id: null,
    });
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'content-gaps' && segments[3] && segments[4] === 'archive') {
    const gapId = Number(segments[3]);
    if (!gapId) return json(res, 400, { error: 'Invalid gap id' });
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const [gap] = await db.select({ id: contentGaps.id }).from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    const now = new Date();
    await db.update(contentGaps).set({ status: 'archived', acknowledgedAt: now }).where(eq(contentGaps.id, gapId));
    json(res, 200, {
      gapId,
      gap_id: gapId,
      status: 'archived',
      archivedAt: now.toISOString(),
      archived_at: now.toISOString(),
      reason: typeof body.reason === 'string' ? body.reason : null,
    });
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/settings') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    json(res, 200, await getShSettings(context.site.id));
    return;
  }

  if (method === 'PUT' && pathname === '/v1/social-hub/settings') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    const config = normalizeShSettingsConfig(body);
    await saveShSettings(config, context.site.id);
    json(res, 200, { ok: true, config });
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/accounts') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const accounts = await db.select().from(shSocialAccounts).where(shAccountScope(context.site.id)).orderBy(asc(shSocialAccounts.platform), desc(shSocialAccounts.createdAt));
    json(res, 200, accounts);
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/accounts') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    if (!body.platform || !body.accountName) return json(res, 400, { error: 'platform and accountName are required' });
    const [created] = await db.insert(shSocialAccounts).values({
      siteId: context.site.id,
      platform: String(body.platform),
      accountName: String(body.accountName),
      accountHandle: body.accountHandle ? String(body.accountHandle) : null,
      authPayload: body.authPayload ?? null,
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    }).returning();
    json(res, 201, created);
    return;
  }

  if ((method === 'PUT' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'accounts' && segments[3]) {
    const context = await resolveShSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const accountId = Number(segments[3]);
    if (!accountId) return json(res, 400, { error: 'Invalid id' });
    if (method === 'DELETE') {
      const deleted = await db.delete(shSocialAccounts).where(and(eq(shSocialAccounts.id, accountId), shAccountScope(context.site.id))).returning({ id: shSocialAccounts.id });
      if (!deleted.length) return json(res, 404, { error: 'Not found' });
      json(res, 200, { ok: true, id: accountId });
      return;
    }
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {};
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (body.accountName !== undefined) patch.accountName = String(body.accountName);
    if (body.accountHandle !== undefined) patch.accountHandle = body.accountHandle ? String(body.accountHandle) : null;
    if (!Object.keys(patch).length) return json(res, 400, { error: 'No updatable fields provided' });
    const [updated] = await db.update(shSocialAccounts).set(patch).where(and(eq(shSocialAccounts.id, accountId), shAccountScope(context.site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Not found' });
    json(res, 200, updated);
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/templates') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(shTemplates).where(shTemplateScope(context.site.id));
    if ((total ?? 0) === 0) await db.insert(shTemplates).values(getDefaultTemplates().map((template) => ({ ...template, siteId: context.site.id })));
    const templates = await db.select().from(shTemplates).where(and(shTemplateScope(context.site.id), eq(shTemplates.isActive, true))).orderBy(shTemplates.id);
    json(res, 200, templates);
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/templates') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    const missing = SH_TEMPLATE_REQUIRED_FIELDS.filter((field) => !body[field]);
    if (missing.length > 0) return json(res, 400, { error: `Missing required fields: ${missing.join(', ')}` });
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
      return;
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('unique')) return json(res, 409, { error: `Template slug "${body.slug}" already exists` });
      throw error;
    }
  }

  if ((method === 'PUT' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'templates' && segments[3]) {
    const context = await resolveShSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const templateId = Number(segments[3]);
    if (!templateId) return json(res, 400, { error: 'Invalid id' });
    if (method === 'DELETE') {
      const deleted = await db.delete(shTemplates).where(and(eq(shTemplates.id, templateId), shTemplateScope(context.site.id))).returning({ id: shTemplates.id });
      if (!deleted.length) return json(res, 404, { error: 'Template not found' });
      json(res, 200, { ok: true, id: templateId });
      return;
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
    if (!Object.keys(updates).length) return json(res, 400, { error: 'Request body is empty' });
    try {
      const [updated] = await db.update(shTemplates).set(updates).where(and(eq(shTemplates.id, templateId), shTemplateScope(context.site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Template not found' });
      json(res, 200, updated);
      return;
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('unique')) return json(res, 409, { error: `Template slug "${body.slug}" already exists` });
      throw error;
    }
  }

  if (pathname === '/v1/social-hub/calendar') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;

    if (method === 'GET') {
      const now = new Date();
      const year = Number.parseInt(url.searchParams.get('year') ?? String(now.getFullYear()), 10);
      const month = Number.parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1), 10);
      if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
        return json(res, 400, { error: 'Invalid year or month' });
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
      return;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const publishLogId = Number(body.publishLogId ?? 0);
      const scheduledFor = typeof body.scheduledFor === 'string' ? body.scheduledFor : '';
      if (!publishLogId || !scheduledFor) return json(res, 400, { error: 'Missing required fields: publishLogId, scheduledFor' });
      const newDate = new Date(scheduledFor);
      if (Number.isNaN(newDate.getTime())) return json(res, 400, { error: 'Invalid scheduledFor date' });
      const [updated] = await db.update(shPublishLog).set({ scheduledFor: newDate }).where(and(eq(shPublishLog.id, publishLogId), shPublishScope(context.site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Publish log not found' });
      json(res, 200, { ok: true, publishLog: updated });
      return;
    }
  }

  if (method === 'POST' && pathname === '/v1/social-hub/repurpose') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
    const sourceId = Number(body.sourceId ?? 0);
    const targetAccountIds = Array.isArray(body.targetAccountIds) ? body.targetAccountIds.map((id) => Number(id)).filter(Boolean) : [];
    if (!sourceType || !sourceId) return json(res, 400, { error: 'Missing required fields: sourceType, sourceId' });
    if (targetAccountIds.length === 0) return json(res, 400, { error: 'targetAccountIds must be a non-empty array' });

    const source = await loadSource(sourceType, sourceId, context.site.id);
    if (!source) return json(res, 404, { error: `Source not found: ${sourceType} #${sourceId}` });

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
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/seed-templates') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/briefs') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/briefs') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
    const sourceId = Number(body.sourceId ?? 0);
    const outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : '';
    const targetPlatforms = Array.isArray(body.targetPlatforms) ? body.targetPlatforms.map((value) => String(value)) : [];
    const targetAccountIds = Array.isArray(body.targetAccountIds) ? body.targetAccountIds.map((value) => Number(value)).filter(Boolean) : [];
    if (!sourceType || !sourceId || !outputFormat) return json(res, 400, { error: 'Missing required fields: sourceType, sourceId, outputFormat' });
    if (!Array.isArray(body.targetPlatforms) || !Array.isArray(body.targetAccountIds)) return json(res, 400, { error: 'targetPlatforms and targetAccountIds must be arrays' });
    const source = await loadSource(sourceType, sourceId, context.site.id);
    if (!source) return json(res, 404, { error: `Source not found: ${sourceType} #${sourceId}` });
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
    return;
  }

  if ((method === 'GET' || method === 'DELETE') && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && !segments[4]) {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;
    if (method === 'DELETE') {
      const publishLogRows = await db.select({ id: shPublishLog.id }).from(shPublishLog).where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));
      if (publishLogRows.length > 0) await db.delete(shPostMetrics).where(and(inArray(shPostMetrics.publishLogId, publishLogRows.map((row) => row.id)), shMetricsScope(site.id)));
      await db.delete(shPublishLog).where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));
      await db.delete(shMediaAssets).where(and(eq(shMediaAssets.briefId, briefId), shMediaScope(site.id)));
      await db.delete(shGeneratedCopy).where(and(eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id)));
      await db.delete(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true, id: briefId });
      return;
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
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/analytics') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'job-status') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;
    const topic = firstQueryValue(url, 'topic') ?? 'sh-copy';
    const activeJob = await findActiveJobByPayload(topic, 'briefId', briefId, site.id);
    const latestJob = activeJob ?? await findLatestJobByPayload(topic, 'briefId', briefId, site.id);
    json(res, 200, { job: latestJob });
    return;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'copy') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;
    const body = await readJsonBody(req);
    const copyId = Number(body.copyId ?? 0);
    if (!copyId) return json(res, 400, { error: 'copyId is required' });

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
    if (!Object.keys(updateFields).length) return json(res, 400, { error: 'No fields to update' });

    const [updated] = await db.update(shGeneratedCopy).set(updateFields).where(and(eq(shGeneratedCopy.id, copyId), eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Copy record not found' });

    if (body.status === 'approved') {
      await db.update(shContentBriefs).set({ status: 'rendering', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
    } else if (body.status === 'rejected') {
      const remainingApproved = await db.select({ id: shGeneratedCopy.id }).from(shGeneratedCopy).where(and(eq(shGeneratedCopy.briefId, briefId), shCopyScope(site.id), eq(shGeneratedCopy.status, 'approved'))).limit(1);
      if (remainingApproved.length === 0) {
        await db.update(shContentBriefs).set({ status: 'copy_review', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      }
    }

    json(res, 200, updated);
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'metrics') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;

    const logsRaw = await db
      .select({ log: shPublishLog, account: shSocialAccounts })
      .from(shPublishLog)
      .leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id))
      .where(and(eq(shPublishLog.briefId, briefId), shPublishScope(site.id)));

    if (!logsRaw.length) {
      json(res, 200, { metrics: [] });
      return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'generate-copy' && method === 'POST') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;

    const existingJob = await findActiveJobByPayload('sh-copy', 'briefId', briefId, site.id);
    if (existingJob) return json(res, 409, { error: 'Copywriter already running', status: existingJob.status, jobId: existingJob.id });

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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'render') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId, brief } = context;

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const copyId = Number(body.copyId ?? 0);
      const format = body.format === 'video' ? 'video' : body.format === 'image' ? 'image' : null;
      const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug : null;
      if (!copyId || !format) return json(res, 400, { error: 'Missing required fields: copyId, format' });

      const [[scopedBrief], [copy]] = await Promise.all([
        db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id))).limit(1),
        db.select().from(shGeneratedCopy).where(and(eq(shGeneratedCopy.id, copyId), shCopyScope(site.id))).limit(1),
      ]);
      if (!scopedBrief) return json(res, 404, { error: 'Brief not found' });
      if (!copy) return json(res, 404, { error: 'Copy record not found' });

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

        const result = await renderSocialImage({
          hookLine: copy.hookLine,
          bodyText: copy.bodyText,
          hashtags: Array.isArray(copy.hashtags) ? copy.hashtags : [],
          templateSlug: template?.slug ?? 'retro-quote-card',
          aspectRatio: template?.aspectRatio ?? '1:1',
        });

        const mediaUrl = `data:image/png;base64,${result.buffer.toString('base64')}`;
        const [asset] = await db.insert(shMediaAssets).values({
          siteId: site.id,
          briefId,
          copyId,
          templateId: template?.id ?? null,
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
        return;
      }

      const existingJob = await findActiveJobByPayload('sh-video', 'briefId', briefId, site.id);
      if (existingJob) return json(res, 409, { error: 'Video render already running', status: existingJob.status, jobId: existingJob.id });

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
      return;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const assetId = Number(body.assetId ?? 0);
      if (body.action !== 'approve' || !assetId) {
        return json(res, 400, { error: 'Unknown action or missing assetId. Use: { assetId, action: "approve" }' });
      }

      await db.update(shMediaAssets).set({ status: 'completed' }).where(and(eq(shMediaAssets.id, assetId), eq(shMediaAssets.briefId, briefId), shMediaScope(site.id)));
      await db.update(shContentBriefs).set({ status: 'done', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true });
      return;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'social-hub' && segments[2] === 'briefs' && segments[3] && segments[4] === 'publish' && method === 'POST') {
    const context = await resolveShBriefContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[3]);
    if (!context) return;
    const { site, briefId } = context;
    const body = await readJsonBody(req);
    const rawAccountIds = Array.isArray(body.accountIds) ? body.accountIds : [];
    const isDryRun = rawAccountIds.includes('__dry_run__');

    if (isDryRun) {
      await db.update(shContentBriefs).set({ status: 'done', updatedAt: new Date() }).where(and(eq(shContentBriefs.id, briefId), shBriefScope(site.id)));
      json(res, 200, { ok: true, dryRun: true, message: 'Test mode — brief completed without publishing.' });
      return;
    }

    const existingJob = await findActiveJobByPayload('sh-publish', 'briefId', briefId, site.id);
    if (existingJob) return json(res, 409, { error: 'Publish already running', status: existingJob.status, jobId: existingJob.id });

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
    return;
  }

  if (pathname === '/v1/social-hub/queue') {
    const context = await resolveShSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
      return;
    }

    if (method === 'POST') {
      const body = await readJsonBody(req);
      const briefIds = Array.isArray(body.briefIds) ? body.briefIds.map((entry) => Number(entry)).filter(Boolean) : [];
      if (briefIds.length === 0) return json(res, 400, { error: 'briefIds must be a non-empty array of numbers' });
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
      return;
    }

    if (method === 'DELETE') {
      const id = Number(firstQueryValue(url, 'id') ?? 0);
      if (id) {
        await db.delete(shQueue).where(and(eq(shQueue.id, id), shQueueScope(site.id)));
        json(res, 200, { ok: true, removed: id });
        return;
      }
      await db.delete(shQueue).where(and(shQueueScope(site.id), or(eq(shQueue.status, 'done'), eq(shQueue.status, 'failed'))));
      json(res, 200, { ok: true });
      return;
    }

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const action = typeof body.action === 'string' ? body.action : '';

      if (action === 'reprioritize') {
        const id = Number(body.id ?? 0);
        const priority = Math.min(100, Math.max(0, Number(body.priority ?? 50)));
        if (!id) return json(res, 400, { error: 'id and priority are required for reprioritize' });
        await db.update(shQueue).set({ priority }).where(and(eq(shQueue.id, id), shQueueScope(site.id)));
        json(res, 200, { ok: true, id, priority });
        return;
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
        return;
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
        return;
      }

      return json(res, 400, { error: `Unknown action: ${action}` });
    }
  }

  if (method === 'GET' && pathname === '/v1/social-hub/sources') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const { site } = context;
    const typeParam = url.searchParams.get('type') || '';
    const search = url.searchParams.get('search') || '';
    if (typeParam && !isValidSourceType(typeParam)) return json(res, 400, { error: `Invalid type. Must be one of: ${SOURCE_TYPES.join(', ')}` });

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
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/reddit/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const targets = await db.select().from(redditTargets).where(redditTargetScope(site.id)).orderBy(desc(redditTargets.priority), desc(redditTargets.createdAt));
    json(res, 200, { targets });
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/reddit/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const body = await readJsonBody(req);
    const type = typeof body.type === 'string' ? body.type : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!['subreddit', 'keyword_search'].includes(type)) return json(res, 400, { error: 'type must be subreddit or keyword_search' });
    if (!value || !label) return json(res, 400, { error: 'value and label required' });
    const [target] = await db.insert(redditTargets).values({
      siteId: site.id,
      type,
      value,
      label,
      priority: toPositiveInt(String(body.priority ?? '50'), 50, { min: 0, max: 100 }),
      isActive: body.isActive !== false,
    }).returning();
    json(res, 201, { target });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'targets' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, unknown> = {};
      if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
      if (typeof body.priority === 'number') updates.priority = Math.max(0, Math.min(100, body.priority));
      if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
      if (typeof body.value === 'string' && body.value.trim()) updates.value = body.value.trim();
      const [target] = await db.update(redditTargets).set(updates).where(and(eq(redditTargets.id, id), redditTargetScope(site.id))).returning();
      if (!target) return json(res, 404, { error: 'Not found' });
      json(res, 200, { target });
      return;
    }

    if (method === 'DELETE') {
      await db.delete(redditTargets).where(and(eq(redditTargets.id, id), redditTargetScope(site.id)));
      res.writeHead(204);
      res.end();
      return;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/reddit/runs') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 10, { min: 1, max: 50 });
    const offset = (page - 1) * limit;
    const [runs, totals] = await Promise.all([
      db.select().from(redditScrapeRuns).where(redditRunScope(site.id)).orderBy(desc(redditScrapeRuns.runAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(redditScrapeRuns).where(redditRunScope(site.id)),
    ]);
    json(res, 200, { runs, total: totals[0]?.total ?? 0, page, limit });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'runs' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });

    if (method === 'GET') {
      const [run] = await db.select().from(redditScrapeRuns).where(and(eq(redditScrapeRuns.id, id), redditRunScope(site.id))).limit(1);
      if (!run) return json(res, 404, { error: 'Run not found' });
      const gaps = await db.select()
        .from(redditExtractedGaps)
        .where(and(eq(redditExtractedGaps.scrapeRunId, id), redditGapScope(site.id)))
        .orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt));
      json(res, 200, { run, gaps: await hydrateRedditGaps(gaps) });
      return;
    }

    if (method === 'DELETE') {
      await db.delete(redditScrapeRuns).where(and(eq(redditScrapeRuns.id, id), redditRunScope(site.id)));
      json(res, 200, { success: true });
      return;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/reddit/gaps') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { min: 1, max: 100 });
    const offset = (page - 1) * limit;
    const statuses = redditStatuses(url.searchParams.get('status'));
    const category = url.searchParams.get('category')?.trim() ?? '';
    const runId = Number(url.searchParams.get('runId') ?? 0);
    const conditions: any[] = [redditGapScope(site.id), inArray(redditExtractedGaps.status, statuses.length > 0 ? statuses : ['pending'])];
    if (category) conditions.push(eq(redditExtractedGaps.category, category));
    if (runId) conditions.push(eq(redditExtractedGaps.scrapeRunId, runId));
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const [gaps, totalRows, statsRows] = await Promise.all([
      db.select().from(redditExtractedGaps).where(whereClause).orderBy(desc(redditExtractedGaps.emotionalIntensity), desc(redditExtractedGaps.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(redditExtractedGaps).where(whereClause),
      db.select({
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where status = 'rejected')::int`,
      }).from(redditExtractedGaps).where(redditGapScope(site.id)),
    ]);
    const items = await hydrateRedditGaps(gaps);
    json(res, 200, {
      gaps: items,
      items,
      total: totalRows[0]?.total ?? 0,
      page,
      limit,
      stats: statsRows[0] ?? { pending: 0, approved: 0, rejected: 0 },
    });
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/reddit/gaps/auto-filter') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const pendingGaps = await db.select().from(redditExtractedGaps).where(and(redditGapScope(site.id), eq(redditExtractedGaps.status, 'pending')));
    const rejectedIds: number[] = [];
    const matches: Array<{ id: number; keyword: string }> = [];
    for (const gap of pendingGaps) {
      const match = findOffBrandMatch(gap.painPointTitle, gap.painPointDescription, gap.vocabularyQuotes || [], gap.emotionalIntensity);
      if (!match) continue;
      rejectedIds.push(gap.id);
      matches.push({ id: gap.id, keyword: match });
    }
    if (rejectedIds.length > 0) {
      await db.update(redditExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(inArray(redditExtractedGaps.id, rejectedIds));
    }
    json(res, 200, { success: true, processed: pendingGaps.length, rejectedCount: rejectedIds.length, matches });
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'gaps' && segments[4] && segments[5] === 'approve') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });
    const [gap] = await db.select().from(redditExtractedGaps).where(and(eq(redditExtractedGaps.id, id), redditGapScope(site.id))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    if (gap.status !== 'pending') return json(res, 400, { error: 'Gap already processed' });
    const body = await readJsonBody(req);
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : '';
    const sourcePosts = await redditSourcePosts((gap.sourcePostIds || []).slice(0, 3));
    const gapDescription = [
      `Problem Context\n${gap.painPointDescription}`,
      sourcePosts.length > 0 ? `\n\nReddit Context\n- Sources: ${gap.frequency} posts analyzed\n${sourcePosts.map((post) => `- "${post.title}" [r/${post.subreddit}]`).join('\n')}` : '',
      gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
    ].filter(Boolean).join('');
    const [contentGap] = await db.insert(contentGaps).values({
      siteId: site.id,
      gapTitle: gap.painPointTitle,
      gapDescription,
      confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
      suggestedAngle: gap.suggestedArticleAngle,
      relatedQueries: gap.vocabularyQuotes,
      sourceModels: ['reddit-apify', 'claude-sonnet'],
      authorNotes: authorNotes || null,
      status: 'new',
    }).returning();
    await db.update(redditExtractedGaps).set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id }).where(eq(redditExtractedGaps.id, id));
    json(res, 200, { ok: true, contentGapId: contentGap.id });
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'reddit' && segments[3] === 'gaps' && segments[4] && segments[5] === 'reject') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });
    await db.update(redditExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(redditExtractedGaps.id, id), redditGapScope(site.id)));
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/overview') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const targets = await db.select().from(ytTargets).where(ytTargetScope(site.id)).orderBy(desc(ytTargets.priority), desc(ytTargets.createdAt));
    json(res, 200, { targets });
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/youtube/targets') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'targets' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
      return;
    }

    if (method === 'DELETE') {
      await db.delete(ytTargets).where(and(eq(ytTargets.id, id), ytTargetScope(site.id)));
      res.writeHead(204);
      res.end();
      return;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/runs') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const page = toPositiveInt(url.searchParams.get('page'), 1, { max: 1000 });
    const limit = toPositiveInt(url.searchParams.get('limit'), 10, { min: 1, max: 50 });
    const offset = (page - 1) * limit;
    const [runs, totals] = await Promise.all([
      db.select().from(ytScrapeRuns).where(ytRunScope(site.id)).orderBy(desc(ytScrapeRuns.runAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(ytScrapeRuns).where(ytRunScope(site.id)),
    ]);
    json(res, 200, { runs, total: totals[0]?.total ?? 0, page, limit });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'runs' && segments[4] && !segments[5]) {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
      return;
    }

    if (method === 'DELETE') {
      await db.delete(ytScrapeRuns).where(and(eq(ytScrapeRuns.id, id), ytRunScope(site.id)));
      json(res, 200, { success: true });
      return;
    }
  }

  if (method === 'GET' && pathname === '/v1/admin/youtube/gaps') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/youtube/gaps/auto-filter') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'gaps' && segments[4] && segments[5] === 'approve') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'youtube' && segments[3] === 'gaps' && segments[4] && segments[5] === 'reject') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
    const { site } = context;
    const id = Number(segments[4]);
    if (!id) return json(res, 400, { error: 'Invalid id' });
    await db.update(ytExtractedGaps).set({ status: 'rejected', rejectedAt: new Date() }).where(and(eq(ytExtractedGaps.id, id), ytGapScope(site.id)));
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/bc/settings') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    json(res, 200, await getBcSettings(context.site.id));
    return;
  }

  if (method === 'PUT' && pathname === '/v1/admin/bc/settings') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const body = await readJsonBody(req);
    const config = {
      provider: body.provider === 'anthropic' ? 'anthropic' : 'openrouter',
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
    return;
  }

  if (method === 'GET' && pathname === '/v1/admin/bc/projects') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
    if (!context) return;
    const projects = await db.select().from(bcProjects).where(bcProjectScope(context.site.id)).orderBy(desc(bcProjects.createdAt));
    json(res, 200, projects);
    return;
  }

  if (method === 'POST' && pathname === '/v1/admin/bc/projects') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && !segments[5]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId: id } = context;

    if (method === 'GET') {
      const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, id), bcProjectScope(site.id))).limit(1);
      if (!project) return json(res, 404, { error: 'Not found' });
      json(res, 200, project);
      return;
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
      return;
    }

    if (method === 'DELETE') {
      await db.delete(bcProjects).where(and(eq(bcProjects.id, id), bcProjectScope(site.id)));
      json(res, 200, { deleted: true });
      return;
    }
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'documentation') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;

    if (method === 'GET') {
      const channels = await db.select().from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id))).orderBy(asc(bcTargetChannels.sortOrder));
      json(res, 200, channels);
      return;
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
      return;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
      return;
    }

    if (method === 'DELETE') {
      await db.delete(bcTargetChannels).where(and(eq(bcTargetChannels.id, channelRowId), eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
      json(res, 200, { deleted: true });
      return;
    }
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'channels' && segments[6] === 'confirm-all') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    await db.update(bcTargetChannels).set({ isConfirmed: true }).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
    await db.update(bcProjects).set({ status: 'videos_pending', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    const confirmed = await db.select({ id: bcTargetChannels.id }).from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id)));
    json(res, 200, { confirmed: confirmed.length });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
      return;
    }
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const videoRowId = Number(segments[6]);
    if (!videoRowId) return json(res, 400, { error: 'Invalid params' });
    const body = await readJsonBody(req);
    if (body.isSelected === undefined) return json(res, 400, { error: 'isSelected required' });
    const [updated] = await db.update(bcTargetVideos).set({ isSelected: Boolean(body.isSelected) }).where(and(eq(bcTargetVideos.id, videoRowId), eq(bcTargetVideos.projectId, projectId), bcVideoScope(site.id))).returning({ id: bcTargetVideos.id, isSelected: bcTargetVideos.isSelected });
    if (!updated) return json(res, 404, { error: 'Not found' });
    json(res, 200, updated);
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'videos' && segments[6] === 'add-manual') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'discover-channels') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (!project.nicheKeywords || !(project.nicheKeywords as string[]).length) {
      return json(res, 400, { error: 'nicheKeywords not set — run LP parser first' });
    }
    const result = await runBcScript(['scripts/bc-channel-discovery.ts'], { BC_PROJECT_ID: String(projectId) }, /CHANNELS_FOUND:(\d+)/, 'QUOTA_EXCEEDED');
    if (result.error) return json(res, 500, { error: result.error, logs: result.logs });
    json(res, 200, { channelsFound: result.count, logs: result.logs });
    return;
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'discover-videos') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const confirmed = await db.select({ id: bcTargetChannels.id }).from(bcTargetChannels).where(and(eq(bcTargetChannels.projectId, projectId), bcChannelScope(site.id), eq(bcTargetChannels.isConfirmed, true)));
    if (!confirmed.length) return json(res, 400, { error: 'No confirmed channels — confirm channels first' });
    const result = await runBcScript(['scripts/bc-video-discovery.ts'], { BC_PROJECT_ID: String(projectId) }, /VIDEOS_FOUND:(\d+)/, 'QUOTA_EXCEEDED');
    if (result.error) return json(res, 500, { error: result.error, logs: result.logs });
    json(res, 200, { videosFound: result.count, logs: result.logs });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;

    if (method === 'GET') {
      const statusFilter = url.searchParams.get('status');
      const condition = statusFilter && statusFilter !== 'all'
        ? and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, statusFilter))
        : and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id));
      const painPoints = await db.select().from(bcExtractedPainPoints).where(condition).orderBy(desc(bcExtractedPainPoints.emotionalIntensity));
      json(res, 200, painPoints);
      return;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const painPointId = Number(segments[6]);
    if (!painPointId) return json(res, 400, { error: 'Invalid params' });

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const validStatuses = ['pending', 'approved', 'rejected'];
      if (!validStatuses.includes(String(body.status))) return json(res, 400, { error: `status must be one of: ${validStatuses.join(', ')}` });
      const [updated] = await db.update(bcExtractedPainPoints).set({ status: body.status }).where(and(eq(bcExtractedPainPoints.id, painPointId), eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return;
    }

    if (method === 'DELETE') {
      await db.delete(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.id, painPointId), eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id)));
      json(res, 200, { deleted: true });
      return;
    }
  }

  if (method === 'POST' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'pain-points' && segments[6] === 'auto-filter') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const pending = await db.select().from(bcExtractedPainPoints).where(and(eq(bcExtractedPainPoints.projectId, projectId), bcPainPointScope(site.id), eq(bcExtractedPainPoints.status, 'pending')));
    let rejected = 0;
    let approved = 0;
    for (const pp of pending) {
      const offBrand = findOffBrandMatch(pp.painPointTitle, pp.painPointDescription, pp.vocabularyQuotes, pp.emotionalIntensity);
      const newStatus = offBrand ? 'rejected' : 'approved';
      await db.update(bcExtractedPainPoints).set({ status: newStatus }).where(eq(bcExtractedPainPoints.id, pp.id));
      if (offBrand) rejected += 1; else approved += 1;
    }
    json(res, 200, { processed: pending.length, approved, rejected });
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;

    if (method === 'GET') {
      const iterations = await db.select().from(bcIterations).where(and(eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId)))).orderBy(desc(bcIterations.createdAt));
      const result = await Promise.all(iterations.map(async (iteration) => {
        const sels = await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iteration.id));
        return { ...iteration, selectionCount: sels.length };
      }));
      json(res, 200, { iterations: result });
      return;
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
      return;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
      return;
    }

    if (method === 'DELETE') {
      await db.delete(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId), or(eq(bcIterations.siteId, site.id), isNull(bcIterations.siteId))));
      json(res, 200, { deleted: true });
      return;
    }
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && segments[7] === 'selections') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'iterations' && segments[6] && segments[7] === 'detail') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants' && !segments[6]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants-list') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'variants' && segments[6] && !segments[7]) {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;
    const variantId = Number(segments[6]);
    if (!variantId) return json(res, 400, { error: 'Invalid params' });
    if (method === 'GET') {
      const [variant] = await db.select().from(bcLandingPageVariants).where(and(eq(bcLandingPageVariants.id, variantId), eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).limit(1);
      if (!variant) return json(res, 404, { error: 'Not found' });
      json(res, 200, variant);
      return;
    }
    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const updates: Record<string, any> = {};
      if (body.isSelected !== undefined) updates.isSelected = Boolean(body.isSelected);
      if (!Object.keys(updates).length) return json(res, 400, { error: 'No fields to update' });
      const [updated] = await db.update(bcLandingPageVariants).set(updates).where(and(eq(bcLandingPageVariants.id, variantId), eq(bcLandingPageVariants.projectId, projectId), or(eq(bcLandingPageVariants.siteId, site.id), isNull(bcLandingPageVariants.siteId)))).returning();
      if (!updated) return json(res, 404, { error: 'Not found' });
      json(res, 200, updated);
      return;
    }
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'scrape-data') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'job-status') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
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
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'bc' && segments[3] === 'projects' && segments[4] && segments[5] === 'cluster-pain-points') {
    const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')), segments[4]);
    if (!context) return;
    const { site, projectId } = context;

    if (method === 'GET') {
      const clusters = await db.select().from(bcPainClusters).where(and(eq(bcPainClusters.projectId, projectId), bcClusterScope(site.id), isNull(bcPainClusters.iterationId)));
      json(res, 200, { clusters });
      return;
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
      return;
    }
  }

  if (method === 'POST' && pathname === '/v1/jobs/draft') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const gapId = Number(body.gapId ?? 0);
    if (!gapId) return json(res, 400, { error: 'gapId is required' });
    const [gap] = await db.select().from(contentGaps).where(and(gapScope(site.id), eq(contentGaps.id, gapId))).limit(1);
    if (!gap) return json(res, 404, { error: 'Gap not found' });
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'draft'), inArray(appJobs.status, ['pending', 'running']), sql`${appJobs.payload}->>'gapId' = ${String(gapId)}`)).limit(1);
    if (existingJob) return json(res, 409, { error: 'Draft job already active for this gap', jobId: existingJob.id });
    const authorNotes = typeof body.authorNotes === 'string' ? body.authorNotes : '';
    const job = await enqueueDraftJob(site.id, gapId, typeof body.model === 'string' ? body.model : 'anthropic/claude-sonnet-4-6', authorNotes);
    await db.update(contentGaps).set({ status: 'in_progress', authorNotes: authorNotes || gap.authorNotes, acknowledgedAt: new Date() }).where(eq(contentGaps.id, gapId));
    json(res, 202, { jobId: job.id, status: job.status });
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/geo') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'geo'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'Geo job already active for this site', jobId: existingJob.id });
    const [job] = await db.insert(appJobs).values({ siteId: site.id, type: 'geo', topic: 'geo', payload: {} }).returning();
    json(res, 202, { jobId: job.id, status: job.status });
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/reddit') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'reddit'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'Reddit job already active for this site', status: 'running', jobId: existingJob.id });

    let targets = Array.isArray(body.targets)
      ? body.targets.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    if (targets.length === 0) {
      const active = await db.select({ value: redditTargets.value }).from(redditTargets).where(and(redditTargetScope(site.id), eq(redditTargets.isActive, true)));
      targets = active.map((row) => row.value);
    }
    if (targets.length === 0) return json(res, 400, { error: 'No active targets configured' });

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
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/youtube') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(eq(appJobs.siteId, site.id), eq(appJobs.topic, 'youtube'), inArray(appJobs.status, ['pending', 'running']))).limit(1);
    if (existingJob) return json(res, 409, { error: 'YouTube job already active for this site', status: 'running', jobId: existingJob.id });

    let targetIds = Array.isArray(body.targetIds) ? body.targetIds.map((entry) => Number(entry)).filter(Boolean) : [];
    const targets = targetIds.length
      ? await db.select().from(ytTargets).where(and(ytTargetScope(site.id), inArray(ytTargets.id, targetIds)))
      : await db.select().from(ytTargets).where(and(ytTargetScope(site.id), eq(ytTargets.isActive, true)));
    if (targets.length === 0) return json(res, 400, { error: 'No active targets configured' });

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
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-scrape') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    if (!projectId) return json(res, 400, { error: 'projectId is required' });

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-scrape'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity scrape job already active for this project', jobId: existingJob.id, status: existingJob.status });

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
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-parse') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    if (!projectId) return json(res, 400, { error: 'projectId is required' });

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-parse'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity parse job already active for this project', jobId: existingJob.id, status: existingJob.status });

    const job = await enqueueAppJob(site.id, 'bc-parse', 'bc-parse', { siteId: site.id, projectId });
    await db.update(bcProjects).set({ status: 'parsing', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    json(res, 202, { jobId: job.id, projectId, status: job.status });
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-selector') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = Number(body.iterationId ?? 0);
    if (!projectId || !iterationId) return json(res, 400, { error: 'projectId and iterationId are required' });

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
    if (!iteration) return json(res, 404, { error: 'Iteration not found' });
    if (!iteration.intention?.trim()) return json(res, 400, { error: 'Set an intention before selecting pain points' });

    const approved = await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      bcPainPointScope(site.id),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));
    if (approved.length === 0) return json(res, 400, { error: 'No approved pain points — approve some first' });

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-selector'),
      inArray(appJobs.status, ['pending', 'running']),
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity selector job already active', jobId: existingJob.id, status: existingJob.status });

    const job = await enqueueAppJob(site.id, 'bc-selector', 'bc-selector', { siteId: site.id, projectId, iterationId });
    await db.update(bcIterations).set({ status: 'selecting' }).where(eq(bcIterations.id, iterationId));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status, approvedCount: approved.length });
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-cluster') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = body.iterationId ? Number(body.iterationId) : null;
    if (!projectId) return json(res, 400, { error: 'projectId is required' });

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (iterationId) {
      const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
      if (!iteration) return json(res, 404, { error: 'Iteration not found' });
    }

    const pointCount = iterationId
      ? (await db.select({ id: bcIterationSelections.id }).from(bcIterationSelections).where(eq(bcIterationSelections.iterationId, iterationId))).length
      : (await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
          eq(bcExtractedPainPoints.projectId, projectId),
          bcPainPointScope(site.id),
          eq(bcExtractedPainPoints.status, 'approved'),
        ))).length;
    if (pointCount < 2) return json(res, 400, { error: 'Need at least 2 pain points to cluster' });

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-cluster'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity cluster job already active for this project', jobId: existingJob.id, status: existingJob.status });

    const job = await enqueueAppJob(site.id, 'bc-cluster', 'bc-cluster', {
      siteId: site.id,
      projectId,
      ...(iterationId ? { iterationId } : {}),
    });
    if (iterationId) await db.update(bcIterations).set({ status: 'clustering' }).where(eq(bcIterations.id, iterationId));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status });
    return;
  }

  if (method === 'POST' && pathname === '/v1/jobs/bc-generate') {
    const body = await readJsonBody(req);
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
    if (!context) return;
    const { site } = context;
    const projectId = Number(body.projectId ?? 0);
    const iterationId = body.iterationId ? Number(body.iterationId) : null;
    if (!projectId) return json(res, 400, { error: 'projectId is required' });

    const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id))).limit(1);
    if (!project) return json(res, 404, { error: 'Project not found' });
    if (!project.lpStructureJson) return json(res, 400, { error: 'lpStructureJson missing — run LP parser first' });
    if (iterationId) {
      const [iteration] = await db.select().from(bcIterations).where(and(eq(bcIterations.id, iterationId), eq(bcIterations.projectId, projectId))).limit(1);
      if (!iteration) return json(res, 404, { error: 'Iteration not found' });
    }

    const approved = await db.select({ id: bcExtractedPainPoints.id }).from(bcExtractedPainPoints).where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      bcPainPointScope(site.id),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));
    if (approved.length === 0) return json(res, 400, { error: 'No approved pain points — approve pain points first' });

    const [existingJob] = await db.select({ id: appJobs.id, status: appJobs.status }).from(appJobs).where(and(
      eq(appJobs.siteId, site.id),
      eq(appJobs.topic, 'bc-generate'),
      inArray(appJobs.status, ['pending', 'running']),
      sql`${appJobs.payload}->>'projectId' = ${String(projectId)}`,
    )).limit(1);
    if (existingJob) return json(res, 409, { error: 'Brand Clarity generate job already active for this project', jobId: existingJob.id, status: existingJob.status });

    const job = await enqueueAppJob(site.id, 'bc-generate', 'bc-generate', {
      siteId: site.id,
      projectId,
      ...(iterationId ? { iterationId } : {}),
    });
    await db.update(bcProjects).set({ status: 'generating', updatedAt: new Date() }).where(and(eq(bcProjects.id, projectId), bcProjectScope(site.id)));
    if (iterationId) await db.update(bcIterations).set({ status: 'generating' }).where(eq(bcIterations.id, iterationId));
    json(res, 202, { jobId: job.id, projectId, iterationId, status: job.status });
    return;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'jobs' && segments[2]) {
    const session = await requireAuth(req, res);
    if (!session) return;
    const jobId = Number(segments[2]);
    if (!jobId) return json(res, 400, { error: 'Invalid job id' });
    const [job] = await db.select().from(appJobs).where(eq(appJobs.id, jobId)).limit(1);
    if (!job) return json(res, 404, { error: 'Job not found' });
    if (session.siteId && job.siteId && session.siteId !== job.siteId) return json(res, 403, { error: 'Forbidden for selected job' });
    json(res, 200, job);
    return;
  }

  if (method === 'GET' && pathname === '/v1/jobs/latest') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'GET' && pathname === '/v1/jobs/active') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
    return;
  }

  if (method === 'DELETE' && pathname === '/v1/jobs/active') {
    const context = await resolveAuthedSite(req, res, normalizeSiteSlug(firstQueryValue(url, 'siteSlug')));
    if (!context) return;
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
        }).where(inArray(contentGaps.id, gapIds));
      }
    }

    json(res, 200, {
      success: true,
      cancelledCount: cancelled.length,
      topic,
    });
    return;
  }

  json(res, 404, { error: 'Not found', method, pathname });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('[api] request failed', error);
    json(res, 500, { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) });
  });
});

server.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`);
});
