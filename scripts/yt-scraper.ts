import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { ytScrapeRuns, ytTargets, ytComments, ytExtractedGaps } from '../src/db/schema';
import { eq, inArray } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const SCRAPE_TARGET_IDS    = process.env.SCRAPE_TARGET_IDS || '';
const SCRAPE_RUN_ID        = parseInt(process.env.SCRAPE_RUN_ID || '0', 10);
const MAX_COMMENTS         = parseInt(process.env.YT_MAX_COMMENTS_PER_TARGET || '300', 10);
const CHUNK_SIZE           = parseInt(process.env.YT_CHUNK_SIZE || '20', 10);
const MODEL                = process.env.YT_ANALYSIS_MODEL || 'anthropic/claude-sonnet-4-6';
const YOUTUBE_API_KEY      = process.env.YOUTUBE_API_KEY || '';
const MAX_VIDEOS_PER_CH    = parseInt(process.env.YT_MAX_VIDEOS_PER_CHANNEL || '5', 10);

const sessionLogs: string[] = [];

function log(msg: string) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);
  sessionLogs.push(formatted);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── YouTube Data API v3 helpers ───────────────────────────────────────────

/**
 * Resolves a channel handle (e.g. "calnewport") or channel ID (UCxxxx)
 * to a confirmed channelId string. Returns null on failure.
 */
async function resolveChannelId(handleOrId: string): Promise<string | null> {
  if (!YOUTUBE_API_KEY) {
    log('[WARN] YOUTUBE_API_KEY not set — cannot resolve channel');
    return null;
  }

  // Already a channel ID (UCxxxx format)
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(handleOrId)) return handleOrId;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handleOrId)}&key=${YOUTUBE_API_KEY}`
    );
    const data: any = await res.json();
    return data?.items?.[0]?.id ?? null;
  } catch (e: any) {
    log(`[WARN] Channel ID resolution failed for "${handleOrId}": ${e.message}`);
    return null;
  }
}

/**
 * Returns top N video URLs from a channelId, sorted by viewCount.
 */
async function getTopChannelVideos(channelId: string, maxVideos: number): Promise<string[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&type=video&order=viewCount&maxResults=${maxVideos}&key=${YOUTUBE_API_KEY}`
    );
    const data: any = await res.json();
    const videoIds: string[] = (data?.items ?? [])
      .map((item: any) => item?.id?.videoId)
      .filter(Boolean);

    log(`[YT] Channel ${channelId}: discovered ${videoIds.length} top videos`);
    return videoIds.map(id => `https://www.youtube.com/watch?v=${id}`);
  } catch (e: any) {
    log(`[WARN] Failed to fetch channel videos for ${channelId}: ${e.message}`);
    return [];
  }
}

/**
 * Extracts channel handle or ID from a YouTube channel URL.
 * Supports:
 *   https://www.youtube.com/@calnewport  → "calnewport"
 *   https://www.youtube.com/channel/UCxxxx → "UCxxxx"
 *   https://www.youtube.com/c/CalNewport → "CalNewport"
 *   @calnewport (plain)                  → "calnewport"
 */
function extractChannelIdentifier(url: string): string | null {
  try {
    // Plain @handle
    if (/^@[\w.-]+$/.test(url.trim())) return url.trim().replace(/^@/, '');

    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts[0] === 'channel') return parts[1] ?? null;           // /channel/UCxxxx
    if (parts[0]?.startsWith('@')) return parts[0].replace('@', ''); // /@handle
    if (parts[0] === 'c' || parts[0] === 'user') return parts[1] ?? null; // /c/name

    return null;
  } catch {
    return null;
  }
}

// ─── Apify comment scraping ────────────────────────────────────────────────

interface ApifyComment {
  cid: string;
  comment: string;
  author: string;
  videoId: string;
  pageUrl: string;
  commentsCount: number;
  replyCount: number;
  voteCount: number;
  authorIsChannelOwner: boolean;
  hasCreatorHeart: boolean;
  type: string;
  replyToCid: string | null;
  title: string;
}

function mapToDbComment(item: ApifyComment, runId: number) {
  return {
    scrapeRunId: runId,
    commentId: String(item.cid || '').substring(0, 50),
    videoId: String(item.videoId || '').substring(0, 20),
    videoUrl: item.pageUrl ? String(item.pageUrl).substring(0, 500) : null,
    videoTitle: item.title ? String(item.title).substring(0, 255) : null,
    commentText: String(item.comment || ''),
    author: item.author ? String(item.author).substring(0, 100) : null,
    voteCount: parseInt(String(item.voteCount || 0), 10) || 0,
    replyCount: parseInt(String(item.replyCount || 0), 10) || 0,
    hasCreatorHeart: Boolean(item.hasCreatorHeart),
    authorIsChannelOwner: Boolean(item.authorIsChannelOwner),
    replyToCid: item.replyToCid ? String(item.replyToCid).substring(0, 50) : null,
    totalCommentsCount: item.commentsCount ? parseInt(String(item.commentsCount), 10) || null : null,
  };
}

/**
 * Scrapes comments from a single video URL via Apify.
 * Returns raw items (unfiltered).
 */
async function scrapeVideoComments(videoUrl: string, maxComments: number): Promise<ApifyComment[]> {
  const apifyRun = await apify.actor('streamers/youtube-comments-scraper').call({
    maxComments,
    startUrls: [{ url: videoUrl, method: 'GET' }],
  });

  log(`[YT] Apify run ID: ${apifyRun.id} | status: ${apifyRun.status}`);

  try {
    const actorLog = await apify.run(apifyRun.id).log().get();
    if (actorLog) {
      actorLog.trim().split('\n').slice(0, 100).forEach((line: string) => {
        if (line.trim()) sessionLogs.push(`[APIFY] ${line}`);
      });
    }
  } catch {}

  const { items } = await apify.dataset(apifyRun.defaultDatasetId).listItems();
  return items as unknown as ApifyComment[];
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
  videoTitle: string
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
sourceCommentIndices: 1-based indices of the comments that support this pain point.
Return ONLY valid JSON, no markdown, no explanations.`;

  const userContent = `Video: "${videoTitle}"\n\nAnalyze these ${comments.length} YouTube comments:\n\n` +
    comments.map((c, i) => `[${i + 1}] (votes:${c.voteCount}) ${c.commentText.substring(0, 400)}`).join('\n\n') +
    `\n\nExtract 2–5 pain points. Focus on EMOTIONAL and SYSTEMIC problems, not technical questions.`;

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
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    log(`[LLM] Raw response (200 chars): ${raw.substring(0, 200)}`);
    const parsed = JSON.parse(raw);
    const painPoints = parsed.painPoints || [];

    return painPoints.map((p: any) => ({
      painPointTitle: String(p.title || '').substring(0, 255),
      painPointDescription: String(p.description || ''),
      emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(p.emotionalIntensity || 5), 10))),
      frequency: Math.max(1, parseInt(String(p.frequency || 1), 10)),
      vocabularyQuotes: Array.isArray(p.vocabularyQuotes)
        ? p.vocabularyQuotes.slice(0, 5).map(String)
        : [],
      category: ['focus','energy','burnout','relationships','systems','tech','mindset','health'].includes(p.category)
        ? p.category
        : 'focus',
      suggestedArticleAngle: p.suggestedAngle ? String(p.suggestedAngle) : null,
      sourceCommentIds: Array.isArray(p.sourceCommentIndices)
        ? p.sourceCommentIndices
            .map((idx: number) => comments[idx - 1]?.id)
            .filter(Boolean)
        : [],
    }));
  } catch (e: any) {
    log(`[WARN] LLM parse failed: ${e.message}`);
    return [];
  }
}

// ─── Process one video URL (shared by both target types) ──────────────────

async function processVideoUrl(
  videoUrl: string,
  targetLabel: string,
  targetVideoId: string | null,
  maxComments: number,
  existingCids: Set<string>,
  totalComments: number,
  totalPainPoints: number,
): Promise<{ comments: number; painPoints: number }> {
  log(`[YT] Processing video: ${videoUrl}`);

  const rawItems = await scrapeVideoComments(videoUrl, maxComments);
  log(`[YT] Fetched ${rawItems.length} raw items from Apify`);

  const newItems = rawItems.filter(item =>
    item.cid &&
    !existingCids.has(item.cid) &&
    !item.replyToCid &&
    item.comment &&
    item.comment.length > 15
  );
  log(`[YT] ${newItems.length} new top-level comments (${rawItems.length - newItems.length} skipped)`);

  if (!newItems.length) return { comments: 0, painPoints: 0 };

  const dbRows = newItems.map(c => mapToDbComment(c, SCRAPE_RUN_ID));
  const inserted = await db.insert(ytComments).values(dbRows).returning({
    id: ytComments.id,
    commentText: ytComments.commentText,
    voteCount: ytComments.voteCount,
    videoTitle: ytComments.videoTitle,
  });

  newItems.forEach(item => existingCids.add(item.cid));

  const newTotalComments = totalComments + inserted.length;
  process.stdout.write(`commentsCollected:${newTotalComments}\n`);

  const videoTitle = newItems[0]?.title ?? targetLabel;
  const videoId = targetVideoId ?? (newItems[0]?.videoId ? String(newItems[0].videoId).substring(0, 20) : null);
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
          sourceVideoId: videoId,
          sourceVideoTitle: videoTitle.substring(0, 255),
          suggestedArticleAngle: gap.suggestedArticleAngle,
          category: gap.category,
          status: 'pending',
        }))
      );
      newPainPoints += gaps.length;
      process.stdout.write(`painPointsExtracted:${totalPainPoints + newPainPoints}\n`);
    }
  }

  return { comments: inserted.length, painPoints: newPainPoints };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (!SCRAPE_RUN_ID) {
    console.error('[ERROR] SCRAPE_RUN_ID env var required');
    process.exit(1);
  }

  const startedAt = Date.now();

  const targetIds = SCRAPE_TARGET_IDS
    ? SCRAPE_TARGET_IDS.split(',').map(Number).filter(Boolean)
    : [];

  const targets = targetIds.length
    ? await db.select().from(ytTargets).where(inArray(ytTargets.id, targetIds))
    : await db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  log(`[YT] Starting YouTube Comments Scraper — ${targets.length} targets, run #${SCRAPE_RUN_ID}`);

  if (!YOUTUBE_API_KEY) {
    log('[WARN] YOUTUBE_API_KEY not set — channel targets will be skipped');
  }

  // Preload existing commentIds for dedup
  let existingCids: Set<string> = new Set();
  try {
    const existing = await db.select({ commentId: ytComments.commentId }).from(ytComments);
    existingCids = new Set(existing.map(r => r.commentId));
  } catch {}

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const target of targets) {
    log(`[YT] Scraping: ${target.label} [${target.type}]`);

    try {
      if (target.type === 'channel') {
        // ── Channel mode: discover top videos, then scrape each ──────────
        const identifier = target.channelHandle ?? extractChannelIdentifier(target.url);
        if (!identifier) {
          log(`[WARN] Cannot extract channel identifier from: ${target.url}`);
          continue;
        }

        const channelId = await resolveChannelId(identifier);
        if (!channelId) {
          log(`[WARN] Could not resolve channelId for "${identifier}" — check YOUTUBE_API_KEY`);
          continue;
        }

        const maxVideos = target.maxVideosPerChannel ?? MAX_VIDEOS_PER_CH;
        const videoUrls = await getTopChannelVideos(channelId, maxVideos);

        if (!videoUrls.length) {
          log(`[WARN] No videos found for channel ${channelId}`);
          continue;
        }

        for (const videoUrl of videoUrls) {
          try {
            const { comments, painPoints } = await processVideoUrl(
              videoUrl,
              target.label,
              null,
              target.maxComments ?? MAX_COMMENTS,
              existingCids,
              totalComments,
              totalPainPoints,
            );
            totalComments += comments;
            totalPainPoints += painPoints;
          } catch (e: any) {
            log(`[WARN] Video ${videoUrl} failed: ${e.message}`);
          }
        }

      } else {
        // ── Video mode: single URL ────────────────────────────────────────
        const { comments, painPoints } = await processVideoUrl(
          target.url,
          target.label,
          target.videoId,
          target.maxComments ?? MAX_COMMENTS,
          existingCids,
          totalComments,
          totalPainPoints,
        );
        totalComments += comments;
        totalPainPoints += painPoints;
      }

      await db.update(ytTargets)
        .set({ lastScrapedAt: new Date() })
        .where(eq(ytTargets.id, target.id));

      await db.update(ytScrapeRuns).set({
        commentsCollected: totalComments,
        targetsScraped: targets.map(t => t.label),
      }).where(eq(ytScrapeRuns.id, SCRAPE_RUN_ID));

    } catch (e: any) {
      log(`[WARN] Failed scraping "${target.label}": ${e.message}`);
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

  log(`[YT] Done. ${totalComments} comments collected, ${totalPainPoints} pain points extracted.`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ commentsCollected: totalComments, painPointsExtracted: totalPainPoints })}\n`);
}

run().catch(async (e) => {
  console.error('[FATAL]', e.message);
  log(`[FATAL] ${e.message}`);
  if (SCRAPE_RUN_ID) {
    try {
      await db.update(ytScrapeRuns).set({
        status: 'failed',
        errorMessage: String(e.message),
        finishedAt: new Date(),
        logs: sessionLogs,
      }).where(eq(ytScrapeRuns.id, SCRAPE_RUN_ID));
    } catch {}
  }
  process.exit(1);
});
