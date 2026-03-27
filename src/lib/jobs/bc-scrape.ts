import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { bcComments, bcExtractedPainPoints, bcProjects, bcTargetVideos } from '../../db/schema';
import { callBcLlm, getBcScraperMaxTokens, getBcScraperModel, getBcThinkingBudget } from '../bc-llm-client';
import { findOffBrandMatch } from '../../utils/brandFilter';

export interface BcScrapePainPoint {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  customerLanguage: string | null;
  desiredOutcome: string | null;
  sourceCommentIndices: number[];
  vocData: {
    problemLabel: string;
    dominantEmotion: string;
    failedSolutions: string[];
    triggerMoment: string;
    successVision: string;
  } | null;
}

export function normalizeBcScrapePainPoints(raw: string): BcScrapePainPoint[] {
  let parsed: any;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    let recovered = false;
    for (const suffix of [']}', '"]}', '"}]}', '"]}']) {
      try {
        parsed = JSON.parse(cleaned + suffix);
        recovered = true;
        break;
      } catch {
        // Keep trying.
      }
    }
    if (!recovered) throw new Error('Unexpected end of JSON input');
  }

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
    customerLanguage: painPoint.customerLanguage ? String(painPoint.customerLanguage) : null,
    desiredOutcome: painPoint.desiredOutcome ? String(painPoint.desiredOutcome) : null,
    sourceCommentIndices: Array.isArray(painPoint.sourceCommentIndices) ? painPoint.sourceCommentIndices : [],
    vocData: painPoint.vocData
      ? {
          problemLabel: String(painPoint.vocData.problemLabel || ''),
          dominantEmotion: String(painPoint.vocData.dominantEmotion || 'frustration'),
          failedSolutions: Array.isArray(painPoint.vocData.failedSolutions)
            ? painPoint.vocData.failedSolutions.map(String)
            : [],
          triggerMoment: String(painPoint.vocData.triggerMoment || ''),
          successVision: String(painPoint.vocData.successVision || ''),
        }
      : null,
  }));
}

export interface BcScrapeOptions {
  projectId: number;
  videoId: number;
  youtubeApiKey: string;
  maxComments: number;
  chunkSize: number;
}

export interface BcScrapeResult {
  commentsCollected: number;
  painPointsExtracted: number;
  protocolLines: string[];
}

export interface BcScrapeDeps {
  db: typeof defaultDb;
  fetchImpl: typeof fetch;
  logger?: Pick<Console, 'log'>;
  callLlm?: typeof callBcLlm;
}

interface RawComment {
  commentId: string;
  commentText: string;
  author: string | null;
  voteCount: number;
  publishedAt: Date | null;
}

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function getDefaultBcScrapeDeps(): BcScrapeDeps {
  return {
    db: defaultDb,
    fetchImpl: fetch,
    logger: console,
    callLlm: callBcLlm,
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
  deps: BcScrapeDeps,
  youtubeApiKey: string,
  endpoint: string,
  params: Record<string, string>,
  log: (message: string) => void,
): Promise<any> {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  Object.entries({ ...params, key: youtubeApiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await deps.fetchImpl(url.toString());
  if (!response.ok) {
    const error: any = await response.json().catch(() => ({}));
    const message = error?.error?.message ?? `YouTube API ${response.status}`;
    if (response.status === 403 && message.toLowerCase().includes('quota')) {
      log('QUOTA_EXCEEDED - daily YouTube API quota reached');
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchVideoComments(
  deps: BcScrapeDeps,
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
      data = await ytGet(deps, youtubeApiKey, 'commentThreads', params, log);
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        throw error;
      }
      if (error.message.includes('disabled') || error.message.includes('403') || error.message.includes('404')) {
        log(`Comments unavailable for ${videoId}: ${error.message}`);
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

async function extractPainPoints(
  deps: BcScrapeDeps,
  comments: { id: number; commentText: string; voteCount: number }[],
  videoTitle: string,
  projectNiche: string,
  log: (message: string) => void,
): Promise<BcScrapePainPoint[]> {
  const response = await (deps.callLlm ?? callBcLlm)({
    model: getBcScraperModel(),
    maxTokens: getBcScraperMaxTokens(),
    messages: [
      {
        role: 'user',
        content:
          `BRAND NICHE: ${projectNiche}\nVideo: "${videoTitle}"\n\n` +
          comments.map((comment, index) => `[${index + 1}] likes:${comment.voteCount} ${comment.commentText.substring(0, 400)}`).join('\n\n') +
          '\n\nReturn JSON with painPoints[].',
      },
    ],
    thinkingBudget: getBcThinkingBudget('scraper'),
  });

  try {
    return normalizeBcScrapePainPoints(response.content);
  } catch (error: any) {
    log(`[WARN] LLM parse failed: ${error.message}`);
    return [];
  }
}

export async function runBcScrapeJob(
  options: BcScrapeOptions,
  overrides: Partial<BcScrapeDeps> = {},
): Promise<BcScrapeResult> {
  const deps = { ...getDefaultBcScrapeDeps(), ...overrides };
  const protocolLines: string[] = [];
  const logger = deps.logger ?? console;
  const log = (message: string) => logger.log(`[${new Date().toISOString()}] [BC-SCRAPER] ${message}`);

  if (!options.projectId) throw new Error('BC_PROJECT_ID required');
  if (!options.youtubeApiKey) throw new Error('YOUTUBE_API_KEY required');

  const [project] = await deps.db.select().from(bcProjects).where(eq(bcProjects.id, options.projectId));
  if (!project) throw new Error(`Project ${options.projectId} not found`);

  const projectNiche = Array.isArray(project.nicheKeywords)
    ? (project.nicheKeywords as string[]).join(', ')
    : String(project.nicheKeywords || 'high performance, focus, productivity');
  const videoFilter = options.videoId
    ? and(eq(bcTargetVideos.projectId, options.projectId), eq(bcTargetVideos.isSelected, true), eq(bcTargetVideos.id, options.videoId))
    : and(eq(bcTargetVideos.projectId, options.projectId), eq(bcTargetVideos.isSelected, true));
  const videos = await deps.db.select().from(bcTargetVideos).where(videoFilter);
  if (!videos.length) throw new Error('No matching videos - select at least one video in the Videos step');

  const existingRaw = await deps.db
    .select({ commentId: bcComments.commentId })
    .from(bcComments)
    .where(eq(bcComments.projectId, options.projectId));
  const existingCommentIds = new Set(existingRaw.map((row) => row.commentId));
  const extractedTitles = new Set<string>();

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const video of videos) {
    try {
      const rawComments = await fetchVideoComments(deps, options.youtubeApiKey, video.videoId, options.maxComments, log);
      const newItems = rawComments.filter(
        (comment) => comment.commentId && !existingCommentIds.has(comment.commentId) && comment.commentText.length > 15,
      );
      if (!newItems.length) continue;

      const inserted = await deps.db
        .insert(bcComments)
        .values(
          newItems.map((comment) => ({
            siteId: project.siteId ?? null,
            projectId: options.projectId,
            videoId: video.id,
            commentId: comment.commentId.substring(0, 100),
            commentText: comment.commentText,
            author: comment.author ? comment.author.substring(0, 255) : null,
            voteCount: comment.voteCount,
            publishedAt: comment.publishedAt,
          })),
        )
        .returning({ id: bcComments.id, commentText: bcComments.commentText, voteCount: bcComments.voteCount });

      newItems.forEach((comment) => existingCommentIds.add(comment.commentId));
      totalComments += inserted.length;
      protocolLines.push(`commentsCollected:${totalComments}`);

      const chunks = chunkArray(inserted, options.chunkSize);
      for (const chunk of chunks) {
        const points = await extractPainPoints(deps, chunk, video.title, projectNiche, log);
        const averageVoteCount = chunk.reduce((sum, comment) => sum + (comment.voteCount || 0), 0) / Math.max(chunk.length, 1);

        for (const point of points) {
          if (averageVoteCount > 200) point.emotionalIntensity = Math.min(10, Math.round(point.emotionalIntensity * 1.5));
          else if (averageVoteCount > 50) point.emotionalIntensity = Math.min(10, Math.round(point.emotionalIntensity * 1.3));

          const offBrand = findOffBrandMatch(
            point.painPointTitle,
            point.painPointDescription,
            point.vocabularyQuotes,
            point.emotionalIntensity,
          );
          if (offBrand) continue;

          const titleKey = point.painPointTitle.toLowerCase().substring(0, 30);
          if (extractedTitles.has(titleKey)) continue;
          extractedTitles.add(titleKey);

          await deps.db.insert(bcExtractedPainPoints).values({
            siteId: project.siteId ?? null,
            projectId: options.projectId,
            painPointTitle: point.painPointTitle,
            painPointDescription: point.painPointDescription,
            emotionalIntensity: point.emotionalIntensity,
            frequency: point.frequency,
            vocabularyQuotes: point.vocabularyQuotes,
            category: point.category,
            customerLanguage: point.customerLanguage,
            desiredOutcome: point.desiredOutcome,
            vocData: point.vocData,
            status: 'pending',
            sourceVideoIds: [video.id],
          });
          totalPainPoints++;
          protocolLines.push(`painPointsExtracted:${totalPainPoints}`);
        }
      }

      await deps.db.update(bcTargetVideos).set({ isScraped: true }).where(eq(bcTargetVideos.id, video.id));
      protocolLines.push(`VIDEO_SCRAPED:${video.id}`);
    } catch (error: any) {
      if (error.message === 'QUOTA_EXCEEDED') {
        protocolLines.push('QUOTA_EXCEEDED');
        break;
      }
      log(`[WARN] Failed for video ${video.videoId}: ${error.message}`);
    }
  }

  await deps.db.update(bcProjects).set({ status: 'pain_points_pending', updatedAt: new Date() }).where(eq(bcProjects.id, options.projectId));
  protocolLines.push(`RESULT_JSON:${JSON.stringify({ commentsCollected: totalComments, painPointsExtracted: totalPainPoints })}`);

  return {
    commentsCollected: totalComments,
    painPointsExtracted: totalPainPoints,
    protocolLines,
  };
}
