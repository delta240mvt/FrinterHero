import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { redditScrapeRuns, redditPosts, redditExtractedGaps, contentGaps } from '../src/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const SCRAPE_TARGETS = process.env.SCRAPE_TARGETS || '';
const SCRAPE_RUN_ID  = parseInt(process.env.SCRAPE_RUN_ID || '0', 10);
const MAX_ITEMS      = parseInt(process.env.REDDIT_MAX_ITEMS_PER_TARGET || '3', 10);
const CHUNK_SIZE     = parseInt(process.env.REDDIT_CHUNK_SIZE || '10', 10);
const MODEL          = process.env.REDDIT_ANALYSIS_MODEL || 'anthropic/claude-sonnet-4-6';

const sessionLogs: string[] = [];
function log(msg: string) {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg}`;
  console.log(formattedMsg);
  sessionLogs.push(formattedMsg);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function parseTargets(raw: string) {
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(v => ({
    value: v,
    type: v.startsWith('r/') ? 'subreddit' : 'keyword_search',
  }));
}

function buildApifyInput(target: { value: string; type: string }) {
  if (target.type === 'subreddit') {
    const name = target.value.replace(/^r\//, '');
    return {
      startUrls: [{ url: `https://www.reddit.com/r/${name}/hot` }],
      maxItems: MAX_ITEMS,
      maxPostCount: MAX_ITEMS,
      maxComments: 5,
    };
  }
  // keyword search — sort:new + time:month (confirmed working with trudax/reddit-scraper-lite)
  return {
    searches: [target.value],
    type: 'post',
    sort: 'new',
    time: 'month',
    maxItems: MAX_ITEMS,
    maxPostCount: MAX_ITEMS,
    maxComments: 5,
  };
}

function mapToDbPost(runId: number, item: any) {
  const comments: string[] = [];
  if (Array.isArray(item.comments)) {
    item.comments.slice(0, 5).forEach((c: any) => {
      const text = c.body || c.text || c.content || '';
      if (text) comments.push(String(text).substring(0, 300));
    });
  }
  return {
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

async function updateRunStats(runId: number, updates: Record<string, any>) {
  await db.update(redditScrapeRuns).set(updates).where(eq(redditScrapeRuns.id, runId));
}

interface ExtractedGap {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  suggestedArticleAngle: string | null;
  sourcePostIds: number[];
}

async function analyzePainPoints(posts: any[], dbPostIds: number[]): Promise<ExtractedGap[]> {
  const systemPrompt = `You are an expert in qualitative UX research and target persona analysis.
You analyze Reddit posts collected from productivity, deep work, and high-performance subreddits.

Your goal: extract unique "pain points" — deeply felt frustrations, blockers, and problems experienced by people pursuing high performance without burnout.

IMPORTANT CRITERIA:
- Look for EMOTIONALLY CHARGED problems (frustration, helplessness, desperation)
- Prefer problems RECURRING across multiple posts
- Ignore pure technical questions — focus on life and systemic problems
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
      "suggestedAngle": "Article angle suggestion"
    }
  ]
}

category must be one of: focus | energy | burnout | relationships | systems | tech
Return ONLY valid JSON, no markdown, no explanations.`;

  const userContent = `Analyze these ${posts.length} Reddit posts:\n\n` +
    posts.map((p, i) => `--- POST ${i + 1} [${p.subreddit || 'unknown'}] [${p.upvotes || 0} upvotes] ---\nTITLE: ${p.title || ''}\nBODY: ${String(p.body || '').substring(0, 500)}\nTOP COMMENTS: ${(p.topComments || []).slice(0, 3).join(' | ')}\n`).join('\n') +
    `\nExtract pain points. Focus on EMOTIONAL and SYSTEMIC problems, not technical questions.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
    });

    const raw = (response.choices[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    log(`[LLM] Raw response (200 chars): ${raw.substring(0, 200)}`);
    const parsed = JSON.parse(raw);
    const painPoints = parsed.painPoints || [];

    return painPoints.map((p: any, idx: number) => ({
      painPointTitle: String(p.title || '').substring(0, 255),
      painPointDescription: String(p.description || ''),
      emotionalIntensity: Math.min(10, Math.max(1, parseInt(String(p.emotionalIntensity || 5), 10))),
      frequency: Math.max(1, parseInt(String(p.frequency || 1), 10)),
      vocabularyQuotes: Array.isArray(p.vocabularyQuotes) ? p.vocabularyQuotes.slice(0, 5).map(String) : [],
      category: ['focus','energy','burnout','relationships','systems','tech'].includes(p.category) ? p.category : 'focus',
      suggestedArticleAngle: p.suggestedAngle ? String(p.suggestedAngle) : null,
      sourcePostIds: dbPostIds.slice(idx * 2, idx * 2 + 3), // associate nearby posts
    }));
  } catch (e: any) {
    log(`[WARN] LLM parse failed: ${e.message}`);
    return [];
  }
}

async function deduplicateAgainstExisting(gaps: ExtractedGap[]): Promise<ExtractedGap[]> {
  const unique: ExtractedGap[] = [];
  for (const gap of gaps) {
    try {
      const existing = await db.execute(
        sql`SELECT id FROM content_gaps WHERE to_tsvector('english', gap_title) @@ plainto_tsquery('english', ${gap.painPointTitle}) AND created_at > NOW() - INTERVAL '90 days' LIMIT 1`
      );
      const rows = (existing as unknown as any[]);
      if (rows.length > 0) {
        log(`[DEDUP] Skipped (similar exists): ${gap.painPointTitle}`);
        continue;
      }
    } catch {}
    unique.push(gap);
  }
  return unique;
}

async function run() {
  if (!SCRAPE_TARGETS || !SCRAPE_RUN_ID) {
    console.error('[ERROR] SCRAPE_TARGETS and SCRAPE_RUN_ID env vars required');
    process.exit(1);
  }

  const startedAt = Date.now();
  const targets = parseTargets(SCRAPE_TARGETS);
  log(`[START] Scraping ${targets.length} targets for run #${SCRAPE_RUN_ID}`);

  let allPosts: any[] = [];
  let allDbPostIds: number[] = [];

  // Get existing redditIds to avoid re-import
  let existingIds: Set<string> = new Set();
  try {
    const existing = await db.select({ redditId: redditPosts.redditId }).from(redditPosts);
    existingIds = new Set(existing.map(r => r.redditId));
  } catch {}

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (const target of targets) {
    log(`[SCRAPE] Target: ${target.value} (${target.type})`);
    try {
      const input = buildApifyInput(target);
      log(`[APIFY] Input: ${JSON.stringify(input)}`);
      const apifyRun = await apify.actor('trudax/reddit-scraper-lite').call(input);
      log(`[APIFY] Run ID: ${apifyRun.id} | status: ${apifyRun.status}`);

      // Fetch full actor log and append to sessionLogs
      try {
        const actorLog = await apify.run(apifyRun.id).log().get();
        if (actorLog) {
          actorLog.trim().split('\n').forEach((line: string) => {
            if (line.trim()) sessionLogs.push(line);
          });
        }
      } catch {}

      const { items } = await apify.dataset(apifyRun.defaultDatasetId).listItems();
      const rawItems = items as any[];
      log(`[APIFY] Raw items from dataset: ${rawItems.length}`);

      // Deduplicate and filter by date
      const newItems = rawItems.filter(item => {
        const id = String(item.id || item.redditId || '');
        if (!id || existingIds.has(id)) return false;
        // Reddit API uses created_utc (unix timestamp), Apify uses createdAt (ISO string)
        const createdAt = item.createdAt
          ? new Date(item.createdAt)
          : item.created_utc
            ? new Date(item.created_utc * 1000)
            : null;
        if (createdAt && createdAt < oneYearAgo) return false;
        return true;
      });

      log(`[FILTER] ${newItems.length} new items after dedup+date (skipped ${rawItems.length - newItems.length})`);

      if (newItems.length > 0) {
        const dbRows = newItems.map(item => mapToDbPost(SCRAPE_RUN_ID, item));
        const inserted = await db.insert(redditPosts).values(dbRows).returning({ id: redditPosts.id });
        const ids = inserted.map(r => r.id);
        allDbPostIds.push(...ids);

        // Normalize for LLM analysis
        const normalizedItems = newItems.map((item, i) => {
          // Apify: item.comments[] | Reddit API: no inline comments (skip)
          const comments: string[] = [];
          if (Array.isArray(item.comments)) {
            item.comments.slice(0, 5).forEach((c: any) => {
              const text = c.body || c.text || c.content || '';
              if (text) comments.push(String(text).substring(0, 300));
            });
          }
          return {
            _dbId: ids[i],
            subreddit: String(item.subreddit || item.community || 'unknown'),
            title: String(item.title || item.parsedTitle || ''),
            body: String(item.selftext || item.text || item.body || item.content || ''),
            upvotes: parseInt(String(item.score || item.upvotes || 0), 10) || 0,
            topComments: comments,
          };
        });
        allPosts.push(...normalizedItems);
        newItems.forEach(item => existingIds.add(String(item.id || '')));
      }

      await updateRunStats(SCRAPE_RUN_ID, { postsCollected: allPosts.length, targetsScraped: targets.map(t => t.value) });
      log(`postsCollected:${allPosts.length}`);
    } catch (e: any) {
      log(`[WARN] Failed scraping ${target.value}: ${e.message}`);
    }
  }

  log(`[ANALYSIS] Analyzing ${allPosts.length} posts in chunks of ${CHUNK_SIZE}`);

  const chunks = chunkArray(allPosts, CHUNK_SIZE);
  const allExtracted: ExtractedGap[] = [];

  for (let i = 0; i < chunks.length; i++) {
    log(`[LLM] Chunk ${i + 1}/${chunks.length}...`);
    const chunkDbIds = chunks[i].map((p: any) => p._dbId).filter(Boolean);
    const extracted = await analyzePainPoints(chunks[i], chunkDbIds);
    log(`[LLM] Chunk ${i + 1} → ${extracted.length} pain points`);
    allExtracted.push(...extracted);
  }

  log(`[DEDUP] Deduplicating ${allExtracted.length} pain points...`);
  const unique = await deduplicateAgainstExisting(allExtracted);
  log(`[DEDUP] ${unique.length} unique pain points`);

  if (unique.length > 0) {
    await db.insert(redditExtractedGaps).values(
      unique.map(gap => ({
        scrapeRunId: SCRAPE_RUN_ID,
        painPointTitle: gap.painPointTitle,
        painPointDescription: gap.painPointDescription,
        emotionalIntensity: gap.emotionalIntensity,
        frequency: gap.frequency,
        vocabularyQuotes: gap.vocabularyQuotes,
        sourcePostIds: gap.sourcePostIds,
        suggestedArticleAngle: gap.suggestedArticleAngle,
        category: gap.category,
        status: 'pending',
      }))
    );
  }

  const durationMs = Date.now() - startedAt;
  await updateRunStats(SCRAPE_RUN_ID, {
    status: 'completed',
    painPointsExtracted: unique.length,
    finishedAt: new Date(),
    durationMs,
    logs: sessionLogs,
  });

  log(`[DONE] Extracted ${unique.length} unique pain points. Awaiting admin review.`);
  log(`painPointsExtracted:${unique.length}`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ success: true, gapsExtracted: unique.length })}\n`);
}

run().catch(async (e) => {
  console.error('[FATAL]', e.message);
  log(`[FATAL] ${e.message}`);
  if (SCRAPE_RUN_ID) {
    try {
      await db.update(redditScrapeRuns).set({
        status: 'failed',
        errorMessage: String(e.message),
        finishedAt: new Date(),
        logs: sessionLogs,
      }).where(eq(redditScrapeRuns.id, SCRAPE_RUN_ID));
    } catch {}
  }
  process.exit(1);
});
