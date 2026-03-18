// @ts-nocheck
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../../src/db/client';
import {
  appJobs,
  articleGenerations,
  articles,
  bcExtractedPainPoints,
  bcProjects,
  bcPainClusters,
  bcSettings,
  bcTargetChannels,
  bcTargetVideos,
  contentGaps,
  geoRuns,
  knowledgeEntries,
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
  shSettings,
  shSocialAccounts,
  shTemplates,
  sites,
  ytComments,
  ytExtractedGaps,
  ytScrapeRuns,
  ytTargets,
} from '../../../src/db/schema';
import { getDefaultTemplates } from '../../../src/lib/sh-image-gen';
import { BC_SETTINGS_DEFAULTS, getBcSettings, saveBcSettings } from '../../../src/lib/bc-settings';
import { matchKbEntries } from '../../../src/lib/sh-kb-matcher';
import { loadSource } from '../../../src/lib/sh-source-loader';
import { SH_SETTINGS_DEFAULTS, getShSettings, normalizeShSettingsConfig, saveShSettings } from '../../../src/lib/sh-settings';
import { SOURCE_TYPES, isValidSourceType } from '../../../src/lib/sh-source-types';
import { findOffBrandMatch } from '../../../src/utils/brandFilter';
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
    const session = await requireAuth(req, res);
    if (!session) return;
    json(res, 200, await getShSettings());
    return;
  }

  if (method === 'PUT' && pathname === '/v1/social-hub/settings') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const config = normalizeShSettingsConfig(body);
    await saveShSettings(config);
    json(res, 200, { ok: true, config });
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/accounts') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const accounts = await db.select().from(shSocialAccounts).orderBy(asc(shSocialAccounts.platform), desc(shSocialAccounts.createdAt));
    json(res, 200, accounts);
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/accounts') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    if (!body.platform || !body.accountName) return json(res, 400, { error: 'platform and accountName are required' });
    const [created] = await db.insert(shSocialAccounts).values({
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
    const session = await requireAuth(req, res);
    if (!session) return;
    const accountId = Number(segments[3]);
    if (!accountId) return json(res, 400, { error: 'Invalid id' });
    if (method === 'DELETE') {
      const deleted = await db.delete(shSocialAccounts).where(eq(shSocialAccounts.id, accountId)).returning({ id: shSocialAccounts.id });
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
    const [updated] = await db.update(shSocialAccounts).set(patch).where(eq(shSocialAccounts.id, accountId)).returning();
    if (!updated) return json(res, 404, { error: 'Not found' });
    json(res, 200, updated);
    return;
  }

  if (method === 'GET' && pathname === '/v1/social-hub/templates') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(shTemplates);
    if ((total ?? 0) === 0) await db.insert(shTemplates).values(getDefaultTemplates());
    const templates = await db.select().from(shTemplates).where(eq(shTemplates.isActive, true)).orderBy(shTemplates.id);
    json(res, 200, templates);
    return;
  }

  if (method === 'POST' && pathname === '/v1/social-hub/templates') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const missing = SH_TEMPLATE_REQUIRED_FIELDS.filter((field) => !body[field]);
    if (missing.length > 0) return json(res, 400, { error: `Missing required fields: ${missing.join(', ')}` });
    try {
      const [created] = await db.insert(shTemplates).values({
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
    const session = await requireAuth(req, res);
    if (!session) return;
    const templateId = Number(segments[3]);
    if (!templateId) return json(res, 400, { error: 'Invalid id' });
    if (method === 'DELETE') {
      const deleted = await db.delete(shTemplates).where(eq(shTemplates.id, templateId)).returning({ id: shTemplates.id });
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
      const [updated] = await db.update(shTemplates).set(updates).where(eq(shTemplates.id, templateId)).returning();
      if (!updated) return json(res, 404, { error: 'Template not found' });
      json(res, 200, updated);
      return;
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('unique')) return json(res, 409, { error: `Template slug "${body.slug}" already exists` });
      throw error;
    }
  }

  if (method === 'GET' && pathname === '/v1/social-hub/briefs') {
    const session = await requireAuth(req, res);
    if (!session) return;
    const status = url.searchParams.get('status') || '';
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 10000);
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 200 });
    const conditions = status ? [eq(shContentBriefs.status, status)] : [];
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [briefs, countRows] = await Promise.all([
      db.select().from(shContentBriefs).where(whereClause).orderBy(desc(shContentBriefs.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(shContentBriefs).where(whereClause),
    ]);
    const briefIds = briefs.map((brief) => brief.id);
    const firstCopyByBriefId: Record<number, any> = {};
    if (briefIds.length > 0) {
      const copies = await db.select().from(shGeneratedCopy).where(inArray(shGeneratedCopy.briefId, briefIds)).orderBy(shGeneratedCopy.briefId, shGeneratedCopy.variantIndex);
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
    const session = await requireAuth(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
    const sourceId = Number(body.sourceId ?? 0);
    const outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : '';
    const targetPlatforms = Array.isArray(body.targetPlatforms) ? body.targetPlatforms.map((value) => String(value)) : [];
    const targetAccountIds = Array.isArray(body.targetAccountIds) ? body.targetAccountIds.map((value) => Number(value)).filter(Boolean) : [];
    if (!sourceType || !sourceId || !outputFormat) return json(res, 400, { error: 'Missing required fields: sourceType, sourceId, outputFormat' });
    if (!Array.isArray(body.targetPlatforms) || !Array.isArray(body.targetAccountIds)) return json(res, 400, { error: 'targetPlatforms and targetAccountIds must be arrays' });
    const source = await loadSource(sourceType, sourceId);
    if (!source) return json(res, 404, { error: `Source not found: ${sourceType} #${sourceId}` });
    const kbMatches = await matchKbEntries(source.content, 3);
    const kbEntriesUsed = kbMatches.map((entry: any) => entry.id);
    const viralEngine = normalizeShViralEnginePayload(body, outputFormat);
    const [created] = await db.insert(shContentBriefs).values({
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
    const session = await requireAuth(req, res);
    if (!session) return;
    const briefId = Number(segments[3]);
    if (!briefId) return json(res, 400, { error: 'Invalid brief id' });
    if (method === 'DELETE') {
      const [existing] = await db.select({ id: shContentBriefs.id }).from(shContentBriefs).where(eq(shContentBriefs.id, briefId)).limit(1);
      if (!existing) return json(res, 404, { error: 'Brief not found' });
      const publishLogRows = await db.select({ id: shPublishLog.id }).from(shPublishLog).where(eq(shPublishLog.briefId, briefId));
      if (publishLogRows.length > 0) await db.delete(shPostMetrics).where(inArray(shPostMetrics.publishLogId, publishLogRows.map((row) => row.id)));
      await db.delete(shPublishLog).where(eq(shPublishLog.briefId, briefId));
      await db.delete(shMediaAssets).where(eq(shMediaAssets.briefId, briefId));
      await db.delete(shGeneratedCopy).where(eq(shGeneratedCopy.briefId, briefId));
      await db.delete(shContentBriefs).where(eq(shContentBriefs.id, briefId));
      json(res, 200, { ok: true, id: briefId });
      return;
    }
    const [brief] = await db.select().from(shContentBriefs).where(eq(shContentBriefs.id, briefId)).limit(1);
    if (!brief) return json(res, 404, { error: 'Brief not found' });
    const [generatedCopy, mediaAssets, publishLogsRaw] = await Promise.all([
      db.select().from(shGeneratedCopy).where(eq(shGeneratedCopy.briefId, briefId)).orderBy(shGeneratedCopy.variantIndex),
      db.select().from(shMediaAssets).where(eq(shMediaAssets.briefId, briefId)).orderBy(shMediaAssets.createdAt),
      db.select({ log: shPublishLog, account: shSocialAccounts }).from(shPublishLog).leftJoin(shSocialAccounts, eq(shPublishLog.accountId, shSocialAccounts.id)).where(eq(shPublishLog.briefId, briefId)).orderBy(desc(shPublishLog.createdAt)),
    ]);
    const publishLogIds = publishLogsRaw.map((row) => row.log.id);
    const metricsByLogId: Record<number, any[]> = {};
    if (publishLogIds.length > 0) {
      const allMetrics = await db.select().from(shPostMetrics).where(inArray(shPostMetrics.publishLogId, publishLogIds)).orderBy(desc(shPostMetrics.fetchedAt));
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
    const session = await requireAuth(req, res);
    if (!session) return;
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number.parseInt(daysParam, 10) : null;
    const validDays = days && [7, 30, 90].includes(days) ? days : null;
    const cutoff = validDays ? new Date(Date.now() - validDays * 24 * 60 * 60 * 1000) : null;
    const publishedCondition = cutoff ? and(eq(shPublishLog.status, 'published'), gte(shPublishLog.publishedAt, cutoff)) : eq(shPublishLog.status, 'published');
    const metricsCondition = cutoff ? gte(shPostMetrics.fetchedAt, cutoff) : undefined;
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
      }).from(shContentBriefs).orderBy(desc(shContentBriefs.createdAt)).limit(20),
      db.select({ status: shContentBriefs.status, cnt: sql<number>`count(*)::int` }).from(shContentBriefs).groupBy(shContentBriefs.status),
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
      status: 'draft',
    }).returning();
    json(res, 201, { project, parsingStarted: false });
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
      status: 'draft',
      updatedAt: new Date(),
    }).where(and(eq(bcProjects.id, id), bcProjectScope(site.id))).returning();
    if (!updated) return json(res, 404, { error: 'Not found' });
    json(res, 200, { updated: true, parsingStarted: false });
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
