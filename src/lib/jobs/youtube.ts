import OpenAI from 'openai';
import { db as defaultDb } from '../../db/client';
import { ytComments, ytExtractedGaps, ytScrapeRuns, ytTargets } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export function extractYoutubeChannelIdentifier(url: string): string | null {
  try {
    if (/^@[\w.-]+$/.test(url.trim())) {
      return url.trim().replace(/^@/, '');
    }
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'channel') return parts[1] ?? null;
    if (parts[0]?.startsWith('@')) return parts[0].replace('@', '');
    if (parts[0] === 'c' || parts[0] === 'user') return parts[1] ?? null;
    return null;
  } catch {
    return null;
  }
}

export interface YoutubeScraperOptions {
  scrapeTargetIds: string;
  scrapeRunId: number;
  siteId: number | null;
  maxComments: number;
  chunkSize: number;
  model: string;
  youtubeApiKey: string;
  maxVideosPerChannel: number;
}

export interface YoutubeScraperResult {
  commentsCollected: number;
  painPointsExtracted: number;
  protocolLines: string[];
}

export interface YoutubeScraperDeps {
  db: typeof defaultDb;
  openai: OpenAI;
  fetchImpl: typeof fetch;
  logger?: Pick<Console, 'log'>;
}

interface RawComment {
  commentId: string;
  videoId: string;
  commentText: string;
  author: string | null;
  voteCount: number;
  replyCount: number;
}

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

function getDefaultYoutubeDeps(): YoutubeScraperDeps {
  return {
    db: defaultDb,
    openai: new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    }),
    fetchImpl: fetch,
    logger: console,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function ytGet(
  deps: YoutubeScraperDeps,
  youtubeApiKey: string,
  endpoint: string,
  params: Record<string, string>,
): Promise<any> {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  Object.entries({ ...params, key: youtubeApiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await deps.fetchImpl(url.toString());
  if (!response.ok) {
    const error: any = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message ?? `YouTube API ${response.status}`);
  }
  return response.json();
}

async function resolveChannelId(
  deps: YoutubeScraperDeps,
  youtubeApiKey: string,
  handleOrId: string,
  log: (message: string) => void,
): Promise<string | null> {
  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(handleOrId)) return handleOrId;
  try {
    const data = await ytGet(deps, youtubeApiKey, 'channels', { part: 'id', forHandle: handleOrId, maxResults: '1' });
    return data?.items?.[0]?.id ?? null;
  } catch (error: any) {
    log(`[WARN] resolveChannelId failed for "${handleOrId}": ${error.message}`);
    return null;
  }
}

async function getTopChannelVideos(
  deps: YoutubeScraperDeps,
  youtubeApiKey: string,
  channelId: string,
  maxVideos: number,
  log: (message: string) => void,
): Promise<Array<{ videoId: string; title: string }>> {
  try {
    const data = await ytGet(deps, youtubeApiKey, 'search', {
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
  } catch (error: any) {
    log(`[WARN] getTopChannelVideos failed for ${channelId}: ${error.message}`);
    return [];
  }
}

async function getVideoTitle(
  deps: YoutubeScraperDeps,
  youtubeApiKey: string,
  videoId: string,
): Promise<string> {
  try {
    const data = await ytGet(deps, youtubeApiKey, 'videos', { part: 'snippet', id: videoId });
    return data?.items?.[0]?.snippet?.title ?? videoId;
  } catch {
    return videoId;
  }
}

async function fetchVideoComments(
  deps: YoutubeScraperDeps,
  youtubeApiKey: string,
  videoId: string,
  maxComments: number,
  log: (message: string) => void,
): Promise<RawComment[]> {
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
      data = await ytGet(deps, youtubeApiKey, 'commentThreads', params);
    } catch (error: any) {
      if (error.message.includes('disabled') || error.message.includes('403') || error.message.includes('404')) {
        log(`[YT] Comments unavailable for ${videoId}: ${error.message}`);
      } else {
        log(`[WARN] commentThreads error for ${videoId}: ${error.message}`);
      }
      break;
    }

    for (const item of data?.items ?? []) {
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

async function analyzePainPoints(
  deps: YoutubeScraperDeps,
  options: YoutubeScraperOptions,
  comments: { id: number; commentText: string; voteCount: number; videoTitle: string | null }[],
  videoTitle: string,
  log: (message: string) => void,
): Promise<ExtractedGap[]> {
  const response = await deps.openai.chat.completions.create({
    model: options.model,
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content:
          'Return JSON with painPoints[]. Each pain point needs title, description, emotionalIntensity, frequency, vocabularyQuotes, category, suggestedAngle, and sourceCommentIndices.',
      },
      {
        role: 'user',
        content:
          `Video: "${videoTitle}"\n\nAnalyze these ${comments.length} YouTube comments:\n\n` +
          comments.map((comment, index) => `[${index + 1}] (likes:${comment.voteCount}) ${comment.commentText.substring(0, 400)}`).join('\n\n'),
      },
    ],
    max_tokens: 2000,
  });

  const raw = (response.choices[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  log(`[LLM] Raw response (200 chars): ${raw.substring(0, 200)}`);
  const parsed = JSON.parse(raw);

  return (parsed.painPoints || []).map((painPoint: any) => ({
    painPointTitle: String(painPoint.title || '').substring(0, 255),
    painPointDescription: String(painPoint.description || ''),
    emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(painPoint.emotionalIntensity || 5), 10))),
    frequency: Math.max(1, parseInt(String(painPoint.frequency || 1), 10)),
    vocabularyQuotes: Array.isArray(painPoint.vocabularyQuotes) ? painPoint.vocabularyQuotes.slice(0, 5).map(String) : [],
    category: ['focus', 'energy', 'burnout', 'relationships', 'systems', 'tech', 'mindset', 'health'].includes(
      painPoint.category,
    )
      ? painPoint.category
      : 'focus',
    suggestedArticleAngle: painPoint.suggestedAngle ? String(painPoint.suggestedAngle) : null,
    sourceCommentIds: Array.isArray(painPoint.sourceCommentIndices)
      ? painPoint.sourceCommentIndices.map((index: number) => comments[index - 1]?.id).filter(Boolean)
      : [],
  }));
}

async function processVideo(
  deps: YoutubeScraperDeps,
  options: YoutubeScraperOptions,
  videoId: string,
  videoTitle: string,
  existingCommentIds: Set<string>,
  runningComments: number,
  runningPainPoints: number,
  log: (message: string) => void,
  protocolLines: string[],
): Promise<{ comments: number; painPoints: number }> {
  const raw = await fetchVideoComments(deps, options.youtubeApiKey, videoId, options.maxComments, log);
  const newItems = raw.filter(
    (comment) => comment.commentId && !existingCommentIds.has(comment.commentId) && comment.commentText.length > 15,
  );
  if (!newItems.length) return { comments: 0, painPoints: 0 };

  const inserted = await deps.db
    .insert(ytComments)
    .values(
      newItems.map((comment) => ({
        siteId: options.siteId,
        scrapeRunId: options.scrapeRunId,
        commentId: comment.commentId.substring(0, 50),
        videoId: comment.videoId.substring(0, 20),
        videoUrl: `https://www.youtube.com/watch?v=${comment.videoId}`,
        videoTitle: videoTitle.substring(0, 255),
        commentText: comment.commentText,
        author: comment.author ? comment.author.substring(0, 100) : null,
        voteCount: comment.voteCount,
        replyCount: comment.replyCount,
        hasCreatorHeart: false,
        authorIsChannelOwner: false,
        replyToCid: null,
        totalCommentsCount: null,
      })),
    )
    .returning({
      id: ytComments.id,
      commentText: ytComments.commentText,
      voteCount: ytComments.voteCount,
      videoTitle: ytComments.videoTitle,
    });

  newItems.forEach((comment) => existingCommentIds.add(comment.commentId));
  protocolLines.push(`commentsCollected:${runningComments + inserted.length}`);

  const chunks = chunkArray(inserted, options.chunkSize);
  let newPainPoints = 0;
  for (let index = 0; index < chunks.length; index++) {
    const gaps = await analyzePainPoints(deps, options, chunks[index], videoTitle, log);
    if (gaps.length > 0) {
      await deps.db.insert(ytExtractedGaps).values(
        gaps.map((gap) => ({
          siteId: options.siteId,
          scrapeRunId: options.scrapeRunId,
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
        })),
      );
      newPainPoints += gaps.length;
      protocolLines.push(`painPointsExtracted:${runningPainPoints + newPainPoints}`);
    }
  }

  return { comments: inserted.length, painPoints: newPainPoints };
}

export async function runYoutubeScraperJob(
  options: YoutubeScraperOptions,
  overrides: Partial<YoutubeScraperDeps> = {},
): Promise<YoutubeScraperResult> {
  const deps = { ...getDefaultYoutubeDeps(), ...overrides };
  const protocolLines: string[] = [];
  const logger = deps.logger ?? console;
  const log = (message: string) => logger.log(`[${new Date().toISOString()}] ${message}`);

  if (!options.scrapeRunId) throw new Error('SCRAPE_RUN_ID required');
  if (!options.youtubeApiKey) throw new Error('YOUTUBE_API_KEY required');

  const targetIds = options.scrapeTargetIds
    ? options.scrapeTargetIds
        .split(',')
        .map(Number)
        .filter(Boolean)
    : [];
  const targets = targetIds.length
    ? await deps.db.select().from(ytTargets).where(inArray(ytTargets.id, targetIds))
    : await deps.db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  let existingCommentIds = new Set<string>();
  try {
    const existing = await deps.db.select({ commentId: ytComments.commentId }).from(ytComments);
    existingCommentIds = new Set(existing.map((row) => row.commentId));
  } catch {
    // Dedup preload is best effort.
  }

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const target of targets) {
    try {
      if (target.type === 'channel') {
        const identifier = target.channelHandle ?? extractYoutubeChannelIdentifier(target.url);
        if (!identifier) continue;
        const channelId = await resolveChannelId(deps, options.youtubeApiKey, identifier, log);
        if (!channelId) continue;
        const videos = await getTopChannelVideos(
          deps,
          options.youtubeApiKey,
          channelId,
          target.maxVideosPerChannel ?? options.maxVideosPerChannel,
          log,
        );
        for (const video of videos) {
          const result = await processVideo(
            deps,
            options,
            video.videoId,
            video.title,
            existingCommentIds,
            totalComments,
            totalPainPoints,
            log,
            protocolLines,
          );
          totalComments += result.comments;
          totalPainPoints += result.painPoints;
        }
      } else {
        const videoId = target.videoId ?? new URL(target.url).searchParams.get('v') ?? '';
        if (!videoId) continue;
        const title = await getVideoTitle(deps, options.youtubeApiKey, videoId);
        const result = await processVideo(
          deps,
          options,
          videoId,
          title,
          existingCommentIds,
          totalComments,
          totalPainPoints,
          log,
          protocolLines,
        );
        totalComments += result.comments;
        totalPainPoints += result.painPoints;
      }

      await deps.db.update(ytTargets).set({ lastScrapedAt: new Date() }).where(eq(ytTargets.id, target.id));
      await deps.db
        .update(ytScrapeRuns)
        .set({
          commentsCollected: totalComments,
          targetsScraped: targets.map((item) => item.label),
        })
        .where(eq(ytScrapeRuns.id, options.scrapeRunId));
    } catch (error: any) {
      log(`[WARN] Failed: "${target.label}": ${error.message}`);
    }
  }

  await deps.db
    .update(ytScrapeRuns)
    .set({
      status: 'completed',
      commentsCollected: totalComments,
      painPointsExtracted: totalPainPoints,
      finishedAt: new Date(),
    })
    .where(eq(ytScrapeRuns.id, options.scrapeRunId));

  protocolLines.push(`RESULT_JSON:${JSON.stringify({ commentsCollected: totalComments, painPointsExtracted: totalPainPoints })}`);

  return {
    commentsCollected: totalComments,
    painPointsExtracted: totalPainPoints,
    protocolLines,
  };
}
