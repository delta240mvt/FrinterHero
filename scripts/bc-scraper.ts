/**
 * bc-scraper.ts — Scrapes YouTube comments from bcTargetVideos and extracts pain points.
 *
 * Model: claude-haiku-4-5-20251001 (cost-optimized for bulk extraction)
 * Uses YouTube Data API v3 commentThreads endpoint (same as yt-scraper.ts).
 * Quota: ~1 unit/page of comments per video.
 *
 * Input env: BC_PROJECT_ID, YOUTUBE_API_KEY, OPENROUTER_API_KEY
 * Output: inserts bcComments + bcExtractedPainPoints, stdout protocol:
 *   commentsCollected:N
 *   painPointsExtracted:N
 *   RESULT_JSON:{...}
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcTargetVideos, bcComments, bcExtractedPainPoints } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { findOffBrandMatch } from '../src/utils/brandFilter';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const BC_PROJECT_ID  = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const YT_API_KEY     = process.env.YOUTUBE_API_KEY!;
const MAX_COMMENTS   = parseInt(process.env.BC_MAX_COMMENTS_PER_VIDEO || '100', 10);
const CHUNK_SIZE     = parseInt(process.env.BC_CHUNK_SIZE || '20', 10);
const MODEL          = process.env.BC_SCRAPER_MODEL || 'anthropic/claude-haiku-4-5-20251001';
const YT_BASE        = 'https://www.googleapis.com/youtube/v3';

const sessionLogs: string[] = [];

function log(msg: string) {
  const line = `[${new Date().toISOString()}] [BC-SCRAPER] ${msg}`;
  console.log(line);
  sessionLogs.push(line);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ytGet(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  Object.entries({ ...params, key: YT_API_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `YouTube API ${res.status}`;
    if (res.status === 403 && msg.toLowerCase().includes('quota')) {
      log('QUOTA_EXCEEDED — daily YouTube API quota reached');
      process.stdout.write('QUOTA_EXCEEDED\n');
      process.exit(1);
    }
    throw new Error(msg);
  }
  return res.json();
}

interface RawComment {
  commentId: string;
  commentText: string;
  author: string | null;
  voteCount: number;
  publishedAt: Date | null;
}

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
      if (e.message.includes('disabled') || e.message.includes('403') || e.message.includes('404')) {
        log(`Comments unavailable for ${videoId}: ${e.message}`);
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
        commentText: top.textDisplay,
        author: top.authorDisplayName ?? null,
        voteCount: top.likeCount ?? 0,
        publishedAt: top.publishedAt ? new Date(top.publishedAt) : null,
      });
    }

    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}

// ─── LLM pain-point extraction ────────────────────────────────────────────

interface ExtractedPainPoint {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  customerLanguage: string | null;
  desiredOutcome: string | null;
  sourceCommentIndices: number[];
}

async function extractPainPoints(
  comments: { id: number; commentText: string; voteCount: number }[],
  videoTitle: string,
  projectNiche: string,
): Promise<ExtractedPainPoint[]> {
  const systemPrompt = `You are an expert in qualitative UX research and landing page conversion.
You analyze YouTube comments to extract deeply felt customer pain points for a brand.

BRAND NICHE: ${projectNiche}

Your goal: extract unique pain points — frustrations, blockers, and desires expressed in comments.

CRITERIA:
- Look for EMOTIONALLY CHARGED problems (frustration, desire, urgency)
- Prefer problems RECURRING across multiple comments
- Preserve the LIVE LANGUAGE of users (direct quotes, exact phrases)
- Extract the DESIRED OUTCOME behind each pain point
- Extract what makes this person's language unique (customerLanguage)
- Ignore spam, noise, praise, or off-topic comments

RESPONSE FORMAT (JSON only, no markdown):
{
  "painPoints": [
    {
      "title": "Short pain point name (max 60 chars)",
      "description": "2-3 sentence problem description from user perspective",
      "emotionalIntensity": 8,
      "frequency": 3,
      "vocabularyQuotes": ["exact quote 1", "exact phrase 2"],
      "category": "focus",
      "customerLanguage": "1 sentence on HOW they talk about this problem — their exact phrases and mental model",
      "desiredOutcome": "1 sentence on what they ACTUALLY want to achieve",
      "sourceCommentIndices": [1, 3, 7]
    }
  ]
}

category must be one of: focus | energy | burnout | relationships | systems | tech | mindset | health
sourceCommentIndices: 1-based indices of supporting comments.
Return ONLY valid JSON. No markdown, no explanations.`;

  const userContent =
    `Video: "${videoTitle}"\n\nAnalyze these ${comments.length} YouTube comments:\n\n` +
    comments.map((c, i) => `[${i + 1}] (likes:${c.voteCount}) ${c.commentText.substring(0, 400)}`).join('\n\n') +
    `\n\nExtract 2–5 pain points with emotional intensity ≥ 7.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const raw = (response.choices[0]?.message?.content || '')
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    const parsed = JSON.parse(raw);

    return (parsed.painPoints || []).map((p: any) => ({
      painPointTitle: String(p.title || '').substring(0, 255),
      painPointDescription: String(p.description || ''),
      emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(p.emotionalIntensity || 5), 10))),
      frequency: Math.max(1, parseInt(String(p.frequency || 1), 10)),
      vocabularyQuotes: Array.isArray(p.vocabularyQuotes) ? p.vocabularyQuotes.slice(0, 5).map(String) : [],
      category: ['focus','energy','burnout','relationships','systems','tech','mindset','health'].includes(p.category)
        ? p.category : 'focus',
      customerLanguage: p.customerLanguage ? String(p.customerLanguage) : null,
      desiredOutcome: p.desiredOutcome ? String(p.desiredOutcome) : null,
      sourceCommentIndices: Array.isArray(p.sourceCommentIndices) ? p.sourceCommentIndices : [],
    }));
  } catch (e: any) {
    log(`[WARN] LLM parse failed: ${e.message}`);
    return [];
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function run() {
  if (!BC_PROJECT_ID) { console.error('[ERROR] BC_PROJECT_ID required'); process.exit(1); }
  if (!YT_API_KEY)    { console.error('[ERROR] YOUTUBE_API_KEY required'); process.exit(1); }

  const startedAt = Date.now();

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }

  const projectNiche = Array.isArray(project.nicheKeywords)
    ? (project.nicheKeywords as string[]).join(', ')
    : String(project.nicheKeywords || 'high performance, focus, productivity');

  const videos = await db.select().from(bcTargetVideos).where(eq(bcTargetVideos.projectId, BC_PROJECT_ID));

  if (!videos.length) {
    console.error('[ERROR] No target videos found — run video discovery first');
    process.exit(1);
  }

  log(`Starting scrape for project "${project.name}" — ${videos.length} videos`);
  log(`Model: ${MODEL}, max comments/video: ${MAX_COMMENTS}`);

  // Preload existing commentIds for dedup
  const existingRaw = await db.select({ commentId: bcComments.commentId })
    .from(bcComments).where(eq(bcComments.projectId, BC_PROJECT_ID));
  const existingCids = new Set(existingRaw.map(r => r.commentId));
  log(`Loaded ${existingCids.size} existing commentIds for dedup`);

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const video of videos) {
    log(`Video: ${video.videoId} — "${video.title}"`);

    try {
      const raw = await fetchVideoComments(video.videoId, MAX_COMMENTS);
      log(`  Fetched ${raw.length} comments`);

      const newItems = raw.filter(c =>
        c.commentId &&
        !existingCids.has(c.commentId) &&
        c.commentText.length > 15
      );
      log(`  ${newItems.length} new comments (${raw.length - newItems.length} skipped)`);

      if (!newItems.length) continue;

      // Insert comments
      const inserted = await db.insert(bcComments).values(
        newItems.map(c => ({
          projectId: BC_PROJECT_ID,
          videoId: video.id,
          commentId: c.commentId.substring(0, 100),
          commentText: c.commentText,
          author: c.author ? c.author.substring(0, 255) : null,
          voteCount: c.voteCount,
          publishedAt: c.publishedAt,
        }))
      ).returning({ id: bcComments.id, commentText: bcComments.commentText, voteCount: bcComments.voteCount });

      newItems.forEach(c => existingCids.add(c.commentId));
      totalComments += inserted.length;
      process.stdout.write(`commentsCollected:${totalComments}\n`);

      // LLM extraction in chunks
      const chunks = chunkArray(inserted, CHUNK_SIZE);

      for (let i = 0; i < chunks.length; i++) {
        log(`  LLM chunk ${i + 1}/${chunks.length} (${chunks[i].length} comments)`);
        const points = await extractPainPoints(chunks[i], video.title, projectNiche);
        log(`  Extracted ${points.length} pain point(s)`);

        for (const pp of points) {
          // Apply brand filter
          const offBrand = findOffBrandMatch(
            pp.painPointTitle,
            pp.painPointDescription,
            pp.vocabularyQuotes,
            pp.emotionalIntensity,
          );
          if (offBrand) {
            log(`  [FILTER] Skipped "${pp.painPointTitle}" — ${offBrand}`);
            continue;
          }

          await db.insert(bcExtractedPainPoints).values({
            projectId: BC_PROJECT_ID,
            painPointTitle: pp.painPointTitle,
            painPointDescription: pp.painPointDescription,
            emotionalIntensity: pp.emotionalIntensity,
            frequency: pp.frequency,
            vocabularyQuotes: pp.vocabularyQuotes,
            category: pp.category,
            customerLanguage: pp.customerLanguage,
            desiredOutcome: pp.desiredOutcome,
            status: 'pending',
            sourceVideoIds: [video.id],
          });
          totalPainPoints++;
          process.stdout.write(`painPointsExtracted:${totalPainPoints}\n`);
        }
      }
    } catch (e: any) {
      log(`[WARN] Failed for video ${video.videoId}: ${e.message}`);
    }
  }

  // Update project status
  await db.update(bcProjects).set({
    status: 'pain_points_pending',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, BC_PROJECT_ID));

  const durationMs = Date.now() - startedAt;
  log(`Done. ${totalComments} comments, ${totalPainPoints} pain points. ${durationMs}ms`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ commentsCollected: totalComments, painPointsExtracted: totalPainPoints })}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
