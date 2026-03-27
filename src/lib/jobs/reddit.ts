import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import { db as defaultDb } from '../../db/client';
import { redditExtractedGaps, redditPosts, redditScrapeRuns } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

const NICHE_SUBREDDITS = [
  'productivity',
  'Entrepreneur',
  'selfimprovement',
  'getdisciplined',
  'DecidingToBeBetter',
  'digitalminimalism',
  'deepwork',
  'meditation',
  'nosurf',
  'ADHD_Programmers',
  'cogsci',
  'neuroscience',
].join('+');

export interface RedditTarget {
  value: string;
  type: 'subreddit' | 'keyword_search';
}

export interface RedditScraperOptions {
  scrapeTargets: string;
  scrapeRunId: number;
  siteId: number | null;
  maxItems: number;
  chunkSize: number;
  model: string;
}

interface RedditPainPoint {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  suggestedArticleAngle: string | null;
  sourcePostIds: number[];
}

export interface RedditScraperResult {
  postsCollected: number;
  painPointsExtracted: number;
  protocolLines: string[];
}

export interface RedditScraperDeps {
  db: typeof defaultDb;
  apify: ApifyClient;
  openai: OpenAI;
  logger?: Pick<Console, 'log'>;
}

export function parseRedditTargets(raw: string): RedditTarget[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({
      value,
      type: value.startsWith('r/') ? 'subreddit' : 'keyword_search',
    }));
}

export function buildRedditApifyInput(target: RedditTarget, maxItems: number): Record<string, unknown> {
  if (target.type === 'subreddit') {
    const name = target.value.replace(/^r\//, '');
    return {
      startUrls: [{ url: `https://www.reddit.com/r/${name}/hot` }],
      maxItems,
      maxPostCount: maxItems,
      maxComments: 5,
    };
  }

  const query = encodeURIComponent(target.value);
  return {
    startUrls: [
      {
        url: `https://www.reddit.com/r/${NICHE_SUBREDDITS}/search/?q=${query}&sort=new&restrict_sr=1&t=month`,
      },
    ],
    maxItems,
    maxPostCount: maxItems,
    maxComments: 5,
  };
}

function getDefaultRedditDeps(): RedditScraperDeps {
  return {
    db: defaultDb,
    apify: new ApifyClient({ token: process.env.APIFY_API_TOKEN }),
    openai: new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    }),
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

function mapToDbPost(siteId: number | null, runId: number, item: any) {
  const comments: string[] = [];
  if (Array.isArray(item.comments)) {
    item.comments.slice(0, 5).forEach((comment: any) => {
      const text = comment.body || comment.text || comment.content || '';
      if (text) comments.push(String(text).substring(0, 300));
    });
  }

  return {
    siteId,
    scrapeRunId: runId,
    redditId: String(item.id || item.redditId || '').substring(0, 20) || `unknown_${Date.now()}`,
    subreddit: String(item.subreddit || item.community || '').substring(0, 100),
    title: String(item.title || item.parsedTitle || 'No title').substring(0, 2000),
    body: item.selftext || item.text || item.body || item.content || null,
    url: item.url ? String(item.url).substring(0, 500) : null,
    upvotes: parseInt(String(item.score || item.upvotes || 0), 10) || 0,
    commentCount: parseInt(String(item.num_comments || item.commentCount || item.numComments || 0), 10) || 0,
    topComments: comments,
    postedAt: item.created_utc ? new Date(item.created_utc * 1000) : item.createdAt ? new Date(item.createdAt) : null,
  };
}

async function analyzePainPoints(
  deps: RedditScraperDeps,
  options: RedditScraperOptions,
  posts: any[],
  dbPostIds: number[],
  log: (message: string) => void,
): Promise<RedditPainPoint[]> {
  const response = await deps.openai.chat.completions.create({
    model: options.model,
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content:
          'Return JSON with painPoints[]. Each pain point needs title, description, emotionalIntensity, frequency, vocabularyQuotes, category, and suggestedAngle.',
      },
      {
        role: 'user',
        content:
          `Analyze these ${posts.length} Reddit posts:\n\n` +
          posts.map((post, index) => `POST ${index + 1}: ${post.title}\n${String(post.body || '').substring(0, 200)}`).join('\n\n'),
      },
    ],
    max_tokens: 2000,
  });

  const raw = (response.choices[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  log(`[LLM] Raw response (200 chars): ${raw.substring(0, 200)}`);
  const parsed = JSON.parse(raw);

  return (parsed.painPoints || []).map((painPoint: any, index: number) => ({
    painPointTitle: String(painPoint.title || '').substring(0, 255),
    painPointDescription: String(painPoint.description || ''),
    emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(painPoint.emotionalIntensity || 5), 10))),
    frequency: Math.max(1, parseInt(String(painPoint.frequency || 1), 10)),
    vocabularyQuotes: Array.isArray(painPoint.vocabularyQuotes) ? painPoint.vocabularyQuotes.slice(0, 5).map(String) : [],
    category: ['focus', 'energy', 'burnout', 'relationships', 'systems', 'tech'].includes(painPoint.category)
      ? painPoint.category
      : 'focus',
    suggestedArticleAngle: painPoint.suggestedAngle ? String(painPoint.suggestedAngle) : null,
    sourcePostIds: dbPostIds.slice(index * 2, index * 2 + 3),
  }));
}

async function deduplicateAgainstExisting(
  db: typeof defaultDb,
  gaps: RedditPainPoint[],
  log: (message: string) => void,
): Promise<RedditPainPoint[]> {
  const unique: RedditPainPoint[] = [];
  for (const gap of gaps) {
    try {
      const existing = await db.execute(
        sql`SELECT id FROM content_gaps WHERE to_tsvector('english', gap_title) @@ plainto_tsquery('english', ${gap.painPointTitle}) AND created_at > NOW() - INTERVAL '90 days' LIMIT 1`,
      );
      const rows = existing as unknown as any[];
      if (rows.length > 0) {
        log(`[DEDUP] Skipped (similar exists): ${gap.painPointTitle}`);
        continue;
      }
    } catch {
      // Best effort only.
    }
    unique.push(gap);
  }
  return unique;
}

export async function runRedditScraperJob(
  options: RedditScraperOptions,
  overrides: Partial<RedditScraperDeps> = {},
): Promise<RedditScraperResult> {
  const deps = { ...getDefaultRedditDeps(), ...overrides };
  const protocolLines: string[] = [];
  const logger = deps.logger ?? console;
  const log = (message: string) => logger.log(`[${new Date().toISOString()}] ${message}`);

  if (!options.scrapeTargets || !options.scrapeRunId) {
    throw new Error('SCRAPE_TARGETS and SCRAPE_RUN_ID env vars required');
  }

  const targets = parseRedditTargets(options.scrapeTargets);
  let allPosts: any[] = [];
  let allDbPostIds: number[] = [];

  let existingIds = new Set<string>();
  try {
    const existing = await deps.db.select({ redditId: redditPosts.redditId }).from(redditPosts);
    existingIds = new Set(existing.map((row) => row.redditId));
  } catch {
    // Startup preload is best effort.
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (const target of targets) {
    const input = buildRedditApifyInput(target, options.maxItems);
    const apifyRun = await deps.apify.actor('trudax/reddit-scraper-lite').call(input);
    const { items } = await deps.apify.dataset(apifyRun.defaultDatasetId).listItems();
    const rawItems = items as any[];
    const newItems = rawItems.filter((item) => {
      const id = String(item.id || item.redditId || '');
      if (!id || existingIds.has(id)) return false;
      const createdAt = item.createdAt ? new Date(item.createdAt) : item.created_utc ? new Date(item.created_utc * 1000) : null;
      return !createdAt || createdAt >= oneYearAgo;
    });

    if (newItems.length > 0) {
      const dbRows = newItems.map((item) => mapToDbPost(options.siteId, options.scrapeRunId, item));
      const inserted = await deps.db.insert(redditPosts).values(dbRows).returning({ id: redditPosts.id });
      const ids = inserted.map((row) => row.id);
      allDbPostIds.push(...ids);
      allPosts.push(
        ...newItems.map((item, index) => ({
          _dbId: ids[index],
          subreddit: String(item.subreddit || item.community || 'unknown'),
          title: String(item.title || item.parsedTitle || ''),
          body: String(item.selftext || item.text || item.body || item.content || ''),
          upvotes: parseInt(String(item.score || item.upvotes || 0), 10) || 0,
          topComments: Array.isArray(item.comments)
            ? item.comments.slice(0, 5).map((comment: any) => String(comment.body || comment.text || comment.content || '').substring(0, 300))
            : [],
        })),
      );
      newItems.forEach((item) => existingIds.add(String(item.id || '')));
    }
  }

  const chunks = chunkArray(allPosts, options.chunkSize);
  const allExtracted: RedditPainPoint[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const extracted = await analyzePainPoints(deps, options, chunks[index], chunks[index].map((post) => post._dbId), log);
    allExtracted.push(...extracted);
  }

  const unique = await deduplicateAgainstExisting(deps.db, allExtracted, log);
  if (unique.length > 0) {
    await deps.db.insert(redditExtractedGaps).values(
      unique.map((gap) => ({
        scrapeRunId: options.scrapeRunId,
        siteId: options.siteId,
        painPointTitle: gap.painPointTitle,
        painPointDescription: gap.painPointDescription,
        emotionalIntensity: gap.emotionalIntensity,
        frequency: gap.frequency,
        vocabularyQuotes: gap.vocabularyQuotes,
        sourcePostIds: gap.sourcePostIds,
        suggestedArticleAngle: gap.suggestedArticleAngle,
        category: gap.category,
        status: 'pending',
      })),
    );
  }

  await deps.db
    .update(redditScrapeRuns)
    .set({
      status: 'completed',
      postsCollected: allPosts.length,
      painPointsExtracted: unique.length,
      finishedAt: new Date(),
    })
    .where(eq(redditScrapeRuns.id, options.scrapeRunId));

  protocolLines.push(`painPointsExtracted:${unique.length}`);
  protocolLines.push(`RESULT_JSON:${JSON.stringify({ success: true, gapsExtracted: unique.length })}`);

  return {
    postsCollected: allPosts.length,
    painPointsExtracted: unique.length,
    protocolLines,
  };
}
