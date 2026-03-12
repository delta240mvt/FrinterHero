import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { ytScrapeRuns, ytTargets, ytComments, ytExtractedGaps } from '../src/db/schema';
import { eq, inArray } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const SCRAPE_TARGET_IDS  = process.env.SCRAPE_TARGET_IDS || '';
const SCRAPE_RUN_ID      = parseInt(process.env.SCRAPE_RUN_ID || '0', 10);
const MAX_COMMENTS       = parseInt(process.env.YT_MAX_COMMENTS_PER_TARGET || '300', 10);
const CHUNK_SIZE         = parseInt(process.env.YT_CHUNK_SIZE || '20', 10);
const MODEL              = process.env.YT_ANALYSIS_MODEL || 'anthropic/claude-sonnet-4-6';
const YT_API_KEY         = process.env.YOUTUBE_API_KEY!;
const MAX_VIDEOS_PER_CH  = parseInt(process.env.YT_MAX_VIDEOS_PER_CHANNEL || '5', 10);
const YT_BASE            = 'https://www.googleapis.com/youtube/v3';

const sessionLogs: string[] = [];

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  sessionLogs.push(line);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── YouTube Data API v3 helpers ───────────────────────────────────────────

async function ytGet(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  Object.entries({ ...params, key: YT_API_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `YouTube API ${res.status}`);
  }
  return res.json();
}

/** Resolve @handle or UCxxxx directly → confirmed channelId */
async function resolveChannelId(handleOrId: string): Promise<string | null> {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(handleOrId)) return handleOrId;
  try {
    const data = await ytGet('channels', { part: 'id', forHandle: handleOrId, maxResults: '1' });
    return data?.items?.[0]?.id ?? null;
  } catch (e: any) {
    log(`[WARN] resolveChannelId failed for "${handleOrId}": ${e.message}`);
    return null;
  }
}

interface VideoMeta { videoId: string; title: string; }

/** Top N videos from channel sorted by viewCount */
async function getTopChannelVideos(channelId: string, maxVideos: number): Promise<VideoMeta[]> {
  try {
    const data = await ytGet('search', {
      part: 'id,snippet',
      channelId,
      type: 'video',
      order: 'viewCount',
      maxResults: String(maxVideos),
    });
    return (data?.items ?? [])
      .filter((item: any) => item?.id?.videoId)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title ?? '',
      }));
  } catch (e: any) {
    log(`[WARN] getTopChannelVideos failed for ${channelId}: ${e.message}`);
    return [];
  }
}

/** Get video title for a single videoId */
async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const data = await ytGet('videos', { part: 'snippet', id: videoId });
    return data?.items?.[0]?.snippet?.title ?? videoId;
  } catch {
    return videoId;
  }
}

interface RawComment {
  commentId: string;
  videoId: string;
  commentText: string;
  author: string | null;
  voteCount: number;
  replyCount: number;
}

/**
 * Fetch up to maxComments top-level comments for a video.
 * Uses commentThreads.list with order=relevance (= YouTube "Top comments").
 * Paginates automatically.
 */
async function fetchVideoComments(videoId: string, maxComments: number): Promise<RawComment[]> {
  const results: RawComment[] = [];
  let pageToken: string | undefined;

  while (results.length < maxComments) {
    const remaining = maxComments - results.length;
    const pageSize = Math.min(100, remaining);

    const params: Record<string, string> = {
      part: 'snippet',
      videoId,
      order: 'relevance',
      maxResults: String(pageSize),
      textFormat: 'plainText',
    };
    if (pageToken) params.pageToken = pageToken;

    let data: any;
    try {
      data = await ytGet('commentThreads', params);
    } catch (e: any) {
      // Comments disabled or video unavailable — not a fatal error
      if (e.message.includes('disabled') || e.message.includes('403') || e.message.includes('404')) {
        log(`[YT] Comments unavailable for ${videoId}: ${e.message}`);
      } else {
        log(`[WARN] commentThreads error for ${videoId}: ${e.message}`);
      }
      break;
    }

    for (const item of (data?.items ?? [])) {
      const top = item?.snippet?.topLevelComment?.snippet;
      if (!top?.textDisplay?.trim()) continue;
      results.push({
        commentId: item.snippet.topLevelComment.id,
        videoId: item.snippet.videoId,
        commentText: top.textDisplay,
        author: top.authorDisplayName ?? null,
        voteCount: top.likeCount ?? 0,
        replyCount: item.snippet.totalReplyCount ?? 0,
      });
    }

    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}

// ─── LLM pain-point analysis ───────────────────────────────────────────────

interface ExtractedGap {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  suggestedArticleAngle: string | null;
  sourceCommentIds: number[];
}

async function analyzePainPoints(
  comments: { id: number; commentText: string; voteCount: number; videoTitle: string | null }[],
  videoTitle: string,
): Promise<ExtractedGap[]> {
  const systemPrompt = `You are an expert in qualitative UX research and target persona analysis.
You analyze YouTube comments from productivity, focus, and high-performance videos.

Your goal: extract unique "pain points" — deeply felt frustrations, blockers, and problems experienced by people pursuing high performance without burnout.

IMPORTANT CRITERIA:
- Look for EMOTIONALLY CHARGED problems (frustration, helplessness, desperation)
- Prefer problems RECURRING across multiple comments
- Ignore simple praise, spam, or off-topic comments — focus on life and systemic problems
- Preserve the LIVE LANGUAGE of users (direct quotes, phrases, vocabulary)
- Every pain point must have POTENTIAL for a solution-driven article

PRODUCT CONTEXT: Frinter is a WholeBeing platform for High Performers.
It measures and optimizes: Focus Sprints (Frints), energy, relationships, sleep.
Pain points must be RELEVANT to this niche.

RESPONSE FORMAT (JSON only, no markdown):
{
  "painPoints": [
    {
      "title": "Short pain point name (max 60 chars)",
      "description": "2-3 sentence problem description from the user perspective",
      "emotionalIntensity": 8,
      "frequency": 3,
      "vocabularyQuotes": ["direct quote 1", "phrase 2"],
      "category": "focus",
      "suggestedAngle": "Article angle suggestion",
      "sourceCommentIndices": [1, 3, 7]
    }
  ]
}

category must be one of: focus | energy | burnout | relationships | systems | tech | mindset | health
sourceCommentIndices: 1-based indices of comments supporting this pain point.
Return ONLY valid JSON, no markdown, no explanations.`;

  const userContent =
    `Video: "${videoTitle}"\n\nAnalyze these ${comments.length} YouTube comments:\n\n` +
    comments.map((c, i) => `[${i + 1}] (likes:${c.voteCount}) ${c.commentText.substring(0, 400)}`).join('\n\n') +
    `\n\nExtract 2–5 pain points. Focus on EMOTIONAL and SYSTEMIC problems.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
    });

    const raw = (response.choices[0]?.message?.content || '')
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    log(`[LLM] Raw response (200 chars): ${raw.substring(0, 200)}`);
    const parsed = JSON.parse(raw);

    return (parsed.painPoints || []).map((p: any) => ({
      painPointTitle: String(p.title || '').substring(0, 255),
      painPointDescription: String(p.description || ''),
      emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(p.emotionalIntensity || 5), 10))),
      frequency: Math.max(1, parseInt(String(p.frequency || 1), 10)),
      vocabularyQuotes: Array.isArray(p.vocabularyQuotes) ? p.vocabularyQuotes.slice(0, 5).map(String) : [],
      category: ['focus','energy','burnout','relationships','systems','tech','mindset','health'].includes(p.category)
        ? p.category : 'focus',
      suggestedArticleAngle: p.suggestedAngle ? String(p.suggestedAngle) : null,
      sourceCommentIds: Array.isArray(p.sourceCommentIndices)
        ? p.sourceCommentIndices.map((idx: number) => comments[idx - 1]?.id).filter(Boolean)
        : [],
    }));
  } catch (e: any) {
    log(`[WARN] LLM parse failed: ${e.message}`);
    return [];
  }
}

// ─── Process one video ─────────────────────────────────────────────────────

async function processVideo(
  videoId: string,
  videoTitle: string,
  maxComments: number,
  existingCids: Set<string>,
  runningComments: number,
  runningPainPoints: number,
): Promise<{ comments: number; painPoints: number }> {
  log(`[YT] Video: ${videoId} — "${videoTitle}"`);

  const raw = await fetchVideoComments(videoId, maxComments);
  log(`[YT] Fetched ${raw.length} comments from YouTube API`);

  // Dedup + filter meaningful length
  const newItems = raw.filter(c =>
    c.commentId &&
    !existingCids.has(c.commentId) &&
    c.commentText.length > 15
  );
  log(`[YT] ${newItems.length} new comments (${raw.length - newItems.length} skipped)`);

  if (!newItems.length) return { comments: 0, painPoints: 0 };

  // Insert into DB
  const inserted = await db.insert(ytComments).values(
    newItems.map(c => ({
      scrapeRunId: SCRAPE_RUN_ID,
      commentId: c.commentId.substring(0, 50),
      videoId: c.videoId.substring(0, 20),
      videoUrl: `https://www.youtube.com/watch?v=${c.videoId}`,
      videoTitle: videoTitle.substring(0, 255),
      commentText: c.commentText,
      author: c.author ? c.author.substring(0, 100) : null,
      voteCount: c.voteCount,
      replyCount: c.replyCount,
      hasCreatorHeart: false,
      authorIsChannelOwner: false,
      replyToCid: null,
      totalCommentsCount: null,
    }))
  ).returning({ id: ytComments.id, commentText: ytComments.commentText, voteCount: ytComments.voteCount, videoTitle: ytComments.videoTitle });

  newItems.forEach(c => existingCids.add(c.commentId));

  const newTotalComments = runningComments + inserted.length;
  process.stdout.write(`commentsCollected:${newTotalComments}\n`);

  // LLM analysis
  const chunks = chunkArray(inserted, CHUNK_SIZE);
  let newPainPoints = 0;

  for (let i = 0; i < chunks.length; i++) {
    log(`[LLM] Chunk ${i + 1}/${chunks.length} for "${videoTitle}" (${chunks[i].length} comments)`);
    const gaps = await analyzePainPoints(chunks[i], videoTitle);
    log(`[LLM] Extracted ${gaps.length} pain point(s)`);

    if (gaps.length > 0) {
      await db.insert(ytExtractedGaps).values(
        gaps.map(gap => ({
          scrapeRunId: SCRAPE_RUN_ID,
          painPointTitle: gap.painPointTitle,
          painPointDescription: gap.painPointDescription,
          emotionalIntensity: gap.emotionalIntensity,
          frequency: gap.frequency,
          vocabularyQuotes: gap.vocabularyQuotes,
          sourceCommentIds: gap.sourceCommentIds,
          sourceVideoId: videoId.substring(0, 20),
          sourceVideoTitle: videoTitle.substring(0, 255),
          suggestedArticleAngle: gap.suggestedArticleAngle,
          category: gap.category,
          status: 'pending',
        }))
      );
      newPainPoints += gaps.length;
      process.stdout.write(`painPointsExtracted:${runningPainPoints + newPainPoints}\n`);
    }
  }

  return { comments: inserted.length, painPoints: newPainPoints };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (!SCRAPE_RUN_ID) { console.error('[ERROR] SCRAPE_RUN_ID required'); process.exit(1); }
  if (!YT_API_KEY)    { console.error('[ERROR] YOUTUBE_API_KEY required'); process.exit(1); }

  const startedAt = Date.now();

  const targetIds = SCRAPE_TARGET_IDS
    ? SCRAPE_TARGET_IDS.split(',').map(Number).filter(Boolean)
    : [];

  const targets = targetIds.length
    ? await db.select().from(ytTargets).where(inArray(ytTargets.id, targetIds))
    : await db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  log(`[YT] Starting — ${targets.length} targets, run #${SCRAPE_RUN_ID}`);

  // Preload existing commentIds for global dedup
  let existingCids: Set<string> = new Set();
  try {
    const existing = await db.select({ commentId: ytComments.commentId }).from(ytComments);
    existingCids = new Set(existing.map(r => r.commentId));
    log(`[YT] Loaded ${existingCids.size} existing commentIds for dedup`);
  } catch {}

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const target of targets) {
    log(`[YT] Scraping: ${target.label} [${target.type}]`);

    try {
      if (target.type === 'channel') {
        // ── Channel: discover top videos, scrape each ──────────────────
        const identifier = target.channelHandle ?? extractChannelIdentifier(target.url);
        if (!identifier) { log(`[WARN] Cannot extract channel from: ${target.url}`); continue; }

        const channelId = await resolveChannelId(identifier);
        if (!channelId) { log(`[WARN] Could not resolve channelId for "${identifier}"`); continue; }

        const maxVideos = target.maxVideosPerChannel ?? MAX_VIDEOS_PER_CH;
        const videos = await getTopChannelVideos(channelId, maxVideos);
        log(`[YT] Channel ${channelId}: ${videos.length} videos to process`);

        for (const video of videos) {
          try {
            const { comments, painPoints } = await processVideo(
              video.videoId, video.title,
              target.maxComments ?? MAX_COMMENTS,
              existingCids, totalComments, totalPainPoints,
            );
            totalComments += comments;
            totalPainPoints += painPoints;
          } catch (e: any) {
            log(`[WARN] Video ${video.videoId} failed: ${e.message}`);
          }
        }

      } else {
        // ── Single video ───────────────────────────────────────────────
        const videoId = target.videoId ?? new URL(target.url).searchParams.get('v') ?? '';
        if (!videoId) { log(`[WARN] No videoId for target ${target.id}`); continue; }

        const title = await getVideoTitle(videoId);
        const { comments, painPoints } = await processVideo(
          videoId, title,
          target.maxComments ?? MAX_COMMENTS,
          existingCids, totalComments, totalPainPoints,
        );
        totalComments += comments;
        totalPainPoints += painPoints;
      }

      await db.update(ytTargets).set({ lastScrapedAt: new Date() }).where(eq(ytTargets.id, target.id));
      await db.update(ytScrapeRuns).set({
        commentsCollected: totalComments,
        targetsScraped: targets.map(t => t.label),
      }).where(eq(ytScrapeRuns.id, SCRAPE_RUN_ID));

    } catch (e: any) {
      log(`[WARN] Failed: "${target.label}": ${e.message}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  await db.update(ytScrapeRuns).set({
    status: 'completed',
    commentsCollected: totalComments,
    painPointsExtracted: totalPainPoints,
    finishedAt: new Date(),
    durationMs,
    logs: sessionLogs,
  }).where(eq(ytScrapeRuns.id, SCRAPE_RUN_ID));

  log(`[YT] Done. ${totalComments} comments, ${totalPainPoints} pain points.`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ commentsCollected: totalComments, painPointsExtracted: totalPainPoints })}\n`);
}

function extractChannelIdentifier(url: string): string | null {
  try {
    if (/^@[\w.-]+$/.test(url.trim())) return url.trim().replace(/^@/, '');
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel') return parts[1] ?? null;
    if (parts[0]?.startsWith('@')) return parts[0].replace('@', '');
    if (parts[0] === 'c' || parts[0] === 'user') return parts[1] ?? null;
    return null;
  } catch { return null; }
}

run().catch(async (e) => {
  console.error('[FATAL]', e.message);
  log(`[FATAL] ${e.message}`);
  if (SCRAPE_RUN_ID) {
    try {
      await db.update(ytScrapeRuns).set({
        status: 'failed', errorMessage: String(e.message),
        finishedAt: new Date(), logs: sessionLogs,
      }).where(eq(ytScrapeRuns.id, SCRAPE_RUN_ID));
    } catch {}
  }
  process.exit(1);
});
