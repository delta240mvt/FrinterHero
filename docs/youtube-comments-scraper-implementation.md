# YouTube Comments Scraper — Full Implementation Plan

> **Stage 0 · YouTube Intelligence** — parallel module to Reddit Intelligence.
> Scrapes YouTube video comments via Apify, extracts pain points with LLM, routes approved gaps into the existing Stage 3 Draft Generator pipeline.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 0 · YOUTUBE INTELLIGENCE                                 │
│                                                                 │
│  Apify scrapes video comments (streamers/youtube-comments-scraper) │
│  → comments filtered to relevant/high-engagement               │
│  → Claude extracts pain points: title · intensity · quotes      │
│  → pending gaps queue in admin panel → approve → Stage 3        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼ (approve gap)
             contentGaps table
                        │
                        ▼ (same as Reddit/GEO paths)
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3 · DRAFT GENERATOR (unchanged)                          │
│  gap + author notes + llms-full.txt + Knowledge Base            │
│  → 7-section mega-prompt → OpenRouter → full article → published│
└─────────────────────────────────────────────────────────────────┘
```

**Key design principle:** YouTube Intelligence feeds the SAME `contentGaps` table as Reddit Intelligence and the GEO Monitor. Downstream stages are source-agnostic.

---

## Apify Actor: `streamers/youtube-comments-scraper`

### Input Schema

```json
{
  "maxComments": 300,
  "startUrls": [
    {
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "method": "GET"
    }
  ]
}
```

### Output Schema (per comment)

```json
{
  "comment": "This is the full comment text.",
  "cid": "UgxRn0_LUxzRP2MybPR4AaABAg",
  "author": "@Nonie_Jay",
  "videoId": "bJTjJtRPqYE",
  "pageUrl": "https://www.youtube.com/watch?v=bJTjJtRPqYE",
  "commentsCount": 171,
  "replyCount": 0,
  "voteCount": 2,
  "authorIsChannelOwner": false,
  "hasCreatorHeart": false,
  "type": "comment",
  "replyToCid": null,
  "title": "Halestorm - Unapologetic [Official Audio]"
}
```

### Pricing
- `$0.90 / 1,000 comments`
- Actor ID: `streamers/youtube-comments-scraper`
- Requires **residential proxies** (included in Apify Starter plan)

---

## Target Types

| Type | Example | Apify Input |
|---|---|---|
| `video` | `https://youtube.com/watch?v=ABC` | Single URL → up to `maxComments` comments |
| `playlist` | `https://youtube.com/playlist?list=XYZ` | Future scope — not in v1 |

**v1 scope: `video` targets only.**
Admin manually adds video URLs for high-signal competitor/niche content (e.g., Huberman Lab, Andrew Tate, Ali Abdaal productivity videos).

---

## Database Schema

Four new tables in `src/db/schema.ts`, appended after the Reddit tables:

### `ytTargets`

```typescript
export const ytTargets = pgTable('yt_targets', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 20 }).notNull().default('video'), // 'video' (v1 only)
  url: varchar('url', { length: 500 }).notNull(),                   // Full YouTube video URL
  label: varchar('label', { length: 100 }).notNull(),              // Display name, e.g. "Huberman: Focus"
  videoId: varchar('video_id', { length: 20 }),                    // Extracted from URL for dedup
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(50),             // 0–100
  maxComments: integer('max_comments').notNull().default(300),     // Per-target comment limit
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### `ytScrapeRuns`

```typescript
export const ytScrapeRuns = pgTable('yt_scrape_runs', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull(),             // 'running' | 'completed' | 'failed'
  targetsScraped: text('targets_scraped').array(),                 // Array of video URLs/labels
  commentsCollected: integer('comments_collected').notNull().default(0),
  painPointsExtracted: integer('pain_points_extracted').notNull().default(0),
  gapsCreated: integer('gaps_created').notNull().default(0),       // Approved → contentGaps count
  errorMessage: text('error_message'),
  logs: text('logs').array().notNull().default([]),                // Full run logs
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});
```

### `ytComments`

```typescript
export const ytComments = pgTable('yt_comments', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull()
    .references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  commentId: varchar('comment_id', { length: 50 }).notNull(),      // Apify 'cid' field
  videoId: varchar('video_id', { length: 20 }).notNull(),
  videoUrl: varchar('video_url', { length: 500 }),
  videoTitle: varchar('video_title', { length: 255 }),
  commentText: text('comment_text').notNull(),
  author: varchar('author', { length: 100 }),
  voteCount: integer('vote_count').notNull().default(0),
  replyCount: integer('reply_count').notNull().default(0),
  hasCreatorHeart: boolean('has_creator_heart').notNull().default(false),
  authorIsChannelOwner: boolean('author_is_channel_owner').notNull().default(false),
  replyToCid: varchar('reply_to_cid', { length: 50 }),             // null = top-level comment
  totalCommentsCount: integer('total_comments_count'),             // Video's total comment count
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (table) => ({
  scrapeRunIdx: index('yt_comments_run_idx').on(table.scrapeRunId),
  videoIdx: index('yt_comments_video_idx').on(table.videoId),
  commentIdIdx: uniqueIndex('yt_comments_cid_uniq').on(table.commentId),
}));
```

### `ytExtractedGaps`

```typescript
export const ytExtractedGaps = pgTable('yt_extracted_gaps', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull()
    .references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1–10
  frequency: integer('frequency').notNull().default(1),          // # comments mentioning it
  vocabularyQuotes: text('vocabulary_quotes').array(),           // Direct comment quotes
  sourceCommentIds: integer('source_comment_ids').array(),       // FK: ytComments.id
  sourceVideoId: varchar('source_video_id', { length: 20 }),    // Which video the gap came from
  sourceVideoTitle: varchar('source_video_title', { length: 255 }),
  suggestedArticleAngle: text('suggested_article_angle'),
  category: varchar('category', { length: 50 }),                 // 'focus'|'energy'|'burnout'|...
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending'|'approved'|'rejected'
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  contentGapId: integer('content_gap_id')
    .references(() => contentGaps.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('yt_gaps_status_idx').on(table.status),
  intensityIdx: index('yt_gaps_intensity_idx').on(table.emotionalIntensity),
  runIdx: index('yt_gaps_run_idx').on(table.scrapeRunId),
}));
```

---

## File Structure

```
FrinterHero/
├── scripts/
│   └── yt-scraper.ts                         ← Main scraper script (child process)
├── src/
│   ├── db/
│   │   └── schema.ts                         ← ADD 4 new tables (ytTargets, ytScrapeRuns, ytComments, ytExtractedGaps)
│   ├── lib/
│   │   └── yt-scrape-job.ts                  ← Singleton job manager (mirrors reddit-scrape-job.ts)
│   ├── pages/
│   │   ├── admin/
│   │   │   └── youtube/
│   │   │       ├── index.astro               ← Main YT Intelligence dashboard
│   │   │       ├── targets.astro             ← Target management UI
│   │   │       └── run/[id].astro            ← Run details + logs
│   │   └── api/
│   │       └── youtube/
│   │           ├── start.ts                  ← POST: start scraping job
│   │           ├── status.ts                 ← GET: live snapshot
│   │           ├── stream.ts                 ← GET: SSE log streaming
│   │           ├── runs/
│   │           │   ├── index.ts              ← GET: paginated run list
│   │           │   └── [id].ts               ← DELETE: cascade run
│   │           ├── gaps/
│   │           │   ├── index.ts              ← GET: gaps list (filtered)
│   │           │   └── [id]/
│   │           │       ├── approve.ts        ← POST: gap → contentGaps (STAGE 0→3 BRIDGE)
│   │           │       └── reject.ts         ← POST: mark rejected
│   │           └── targets/
│   │               ├── index.ts              ← GET/POST targets
│   │               └── [id].ts               ← PUT/DELETE target
│   └── components/admin/
│       ├── YtGapCard.astro                   ← Expandable gap card
│       └── YtRunsTable.astro                 ← Run history table
└── docs/
    └── youtube-comments-scraper-implementation.md   ← THIS FILE
```

---

## `scripts/yt-scraper.ts` — Implementation

```typescript
import { ApifyClient } from 'apify-client';
import { db } from '../src/db/index.js';
import {
  ytTargets, ytScrapeRuns, ytComments, ytExtractedGaps, contentGaps
} from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

// ── Environment ──────────────────────────────────────────────────────────────
const APIFY_TOKEN = process.env.APIFY_API_TOKEN!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
const MAX_COMMENTS = parseInt(process.env.YT_MAX_COMMENTS_PER_TARGET ?? '300');
const CHUNK_SIZE = parseInt(process.env.YT_CHUNK_SIZE ?? '20');
const ANALYSIS_MODEL = process.env.YT_ANALYSIS_MODEL ?? 'anthropic/claude-sonnet-4-6';
const RUN_ID = parseInt(process.env.SCRAPE_RUN_ID!);
const TARGET_IDS_RAW = process.env.SCRAPE_TARGET_IDS ?? '';

// ── Logging helpers ───────────────────────────────────────────────────────────
function log(msg: string) {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] ${msg}\n`);
}
function metric(key: string, value: number) {
  process.stdout.write(`${key}:${value}\n`);
}

// ── Apify field normalization ─────────────────────────────────────────────────
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
    commentId: item.cid,
    videoId: item.videoId,
    videoUrl: item.pageUrl,
    videoTitle: item.title ?? null,
    commentText: item.comment,
    author: item.author ?? null,
    voteCount: item.voteCount ?? 0,
    replyCount: item.replyCount ?? 0,
    hasCreatorHeart: item.hasCreatorHeart ?? false,
    authorIsChannelOwner: item.authorIsChannelOwner ?? false,
    replyToCid: item.replyToCid ?? null,
    totalCommentsCount: item.commentsCount ?? null,
  };
}

// ── LLM: Pain point extraction ───────────────────────────────────────────────
interface ExtractedGap {
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;       // 1–10
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  suggestedArticleAngle: string | null;
  sourceCommentIds: number[];
}

async function extractPainPoints(
  comments: { id: number; commentText: string; voteCount: number; videoTitle: string | null }[],
  videoTitle: string
): Promise<ExtractedGap[]> {
  const commentBlock = comments
    .map((c, i) => `[${i + 1}] (votes:${c.voteCount}) ${c.commentText}`)
    .join('\n');

  const prompt = `You are an expert at extracting pain points from YouTube comment sections.

VIDEO: "${videoTitle}"

COMMENTS (${comments.length} total):
${commentBlock}

Extract 2–5 distinct pain points or struggles that appear across multiple comments.
Focus on: unresolved frustrations, repeated questions, emotional struggles, workflow failures.
Ignore: spam, off-topic, simple praise.

For each pain point return a JSON object:
{
  "painPointTitle": "short title (max 8 words)",
  "painPointDescription": "2–3 sentences describing the struggle",
  "emotionalIntensity": <1-10>,
  "frequency": <number of comments mentioning it>,
  "vocabularyQuotes": ["exact short quote 1", "exact short quote 2"],
  "category": "focus|energy|burnout|relationships|systems|tech|mindset|health",
  "suggestedArticleAngle": "one sentence article angle that positions frinter.app as the solution",
  "sourceCommentIndices": [1, 3, 7]
}

Return ONLY a JSON array. No markdown, no prose.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? '[]';

  try {
    const parsed = JSON.parse(raw);
    return parsed.map((gap: any) => ({
      ...gap,
      sourceCommentIds: (gap.sourceCommentIndices ?? [])
        .map((i: number) => comments[i - 1]?.id)
        .filter(Boolean),
    }));
  } catch {
    log(`[WARN] Failed to parse LLM response for video "${videoTitle}"`);
    return [];
  }
}

// ── Main scraper logic ────────────────────────────────────────────────────────
async function main() {
  log('[YT] Starting YouTube Comments Scraper');

  const apify = new ApifyClient({ token: APIFY_TOKEN });

  // Load targets
  const targetIds = TARGET_IDS_RAW
    ? TARGET_IDS_RAW.split(',').map(Number).filter(Boolean)
    : [];

  const targets = targetIds.length
    ? await db.select().from(ytTargets).where(inArray(ytTargets.id, targetIds))
    : await db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  log(`[YT] Loaded ${targets.length} target(s)`);

  let totalComments = 0;
  let totalPainPoints = 0;

  for (const target of targets) {
    log(`[YT] Scraping: ${target.label} (${target.url})`);

    try {
      // Run Apify actor
      const run = await apify.actor('streamers/youtube-comments-scraper').call({
        maxComments: target.maxComments ?? MAX_COMMENTS,
        startUrls: [{ url: target.url, method: 'GET' }],
      });

      // Fetch Apify actor logs
      try {
        const actorLog = await apify.log(run.id).get();
        if (actorLog) {
          const logLines = actorLog.split('\n').slice(0, 100);
          for (const line of logLines) {
            log(`[APIFY] ${line}`);
          }
        }
      } catch {
        log('[APIFY] Could not fetch actor log');
      }

      // Fetch dataset items
      const { items } = await apify.dataset(run.defaultDatasetId).listItems();
      log(`[YT] Fetched ${items.length} comments from Apify`);

      if (!items.length) {
        log(`[YT] No comments returned for ${target.label}, skipping`);
        continue;
      }

      // Dedup by commentId
      const existingIds = await db
        .select({ commentId: ytComments.commentId })
        .from(ytComments);
      const existingSet = new Set(existingIds.map((r) => r.commentId));

      const newItems = (items as ApifyComment[]).filter(
        (item) => item.cid && !existingSet.has(item.cid)
      );
      log(`[YT] ${newItems.length} new (${items.length - newItems.length} dupes skipped)`);

      // Filter: only top-level comments (replyToCid === null) with some votes or text length
      const topLevel = newItems.filter(
        (c) => !c.replyToCid && c.comment && c.comment.length > 15
      );
      log(`[YT] ${topLevel.length} top-level comments after filter`);

      if (!topLevel.length) continue;

      // Insert into DB
      const dbRows = topLevel.map((c) => mapToDbComment(c, RUN_ID));
      const inserted = await db.insert(ytComments).values(dbRows).returning({ id: ytComments.id, commentText: ytComments.commentText, voteCount: ytComments.voteCount, videoTitle: ytComments.videoTitle });

      totalComments += inserted.length;
      metric('commentsCollected', totalComments);

      // Update lastScrapedAt
      await db.update(ytTargets)
        .set({ lastScrapedAt: new Date() })
        .where(eq(ytTargets.id, target.id));

      // LLM pain point extraction in chunks
      const videoTitle = topLevel[0]?.title ?? target.label;
      const chunks: typeof inserted[] = [];
      for (let i = 0; i < inserted.length; i += CHUNK_SIZE) {
        chunks.push(inserted.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        log(`[YT] Analyzing chunk of ${chunk.length} comments for "${videoTitle}"`);
        const gaps = await extractPainPoints(chunk, videoTitle);
        log(`[YT] Extracted ${gaps.length} pain point(s) from chunk`);

        for (const gap of gaps) {
          await db.insert(ytExtractedGaps).values({
            scrapeRunId: RUN_ID,
            painPointTitle: gap.painPointTitle,
            painPointDescription: gap.painPointDescription,
            emotionalIntensity: gap.emotionalIntensity,
            frequency: gap.frequency,
            vocabularyQuotes: gap.vocabularyQuotes,
            sourceCommentIds: gap.sourceCommentIds,
            sourceVideoId: target.videoId ?? topLevel[0]?.videoId ?? null,
            sourceVideoTitle: videoTitle,
            suggestedArticleAngle: gap.suggestedArticleAngle,
            category: gap.category,
            status: 'pending',
          });
          totalPainPoints++;
          metric('painPointsExtracted', totalPainPoints);
        }
      }

    } catch (err: any) {
      log(`[YT][ERROR] Target "${target.label}" failed: ${err.message}`);
    }
  }

  // Update run record
  await db.update(ytScrapeRuns)
    .set({
      status: 'completed',
      commentsCollected: totalComments,
      painPointsExtracted: totalPainPoints,
      finishedAt: new Date(),
    })
    .where(eq(ytScrapeRuns.id, RUN_ID));

  const resultJson = { commentsCollected: totalComments, painPointsExtracted: totalPainPoints };
  process.stdout.write(`RESULT_JSON:${JSON.stringify(resultJson)}\n`);
  log('[YT] Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[YT][FATAL]', err);
  process.exit(1);
});
```

---

## `src/lib/yt-scrape-job.ts` — Job Manager

Mirrors `src/lib/reddit-scrape-job.ts` exactly, with:

- Class name: `YtScrapeJobManager`
- Export: `ytScrapeJob`
- Child process: `npx tsx scripts/yt-scraper.ts`
- Env vars: `SCRAPE_TARGET_IDS`, `SCRAPE_RUN_ID`
- Metric parsers: `commentsCollected:N`, `painPointsExtracted:N`
- Log prefix detection: `[YT] Scraping:` → `currentTarget`

```typescript
export type YtJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface YtScrapeSnapshot {
  status: YtJobStatus;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  commentsCollected: number;
  painPointsExtracted: number;
  currentTarget: string | null;
  lines: { line: string; ts: number }[];
  result: any | null;
}
```

Full implementation: copy `reddit-scrape-job.ts`, replace all `reddit`/`Reddit` references with `yt`/`Yt`/`YouTube`, update metric field names (`postsCollected` → `commentsCollected`).

---

## API Routes

### `/src/pages/api/youtube/start.ts`

```typescript
// POST /api/youtube/start
// Body (optional): { targetIds: number[] }
// Creates ytScrapeRuns record, spawns yt-scrape-job singleton

import type { APIRoute } from 'astro';
import { db } from '../../../db/index.js';
import { ytScrapeRuns, ytTargets } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { ytScrapeJob } from '../../../lib/yt-scrape-job.js';
import { requireSession } from '../../../lib/auth.js';

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await requireSession(cookies);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (ytScrapeJob.isRunning()) {
    return new Response(JSON.stringify({ error: 'Job already running' }), { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const targetIds: number[] = body.targetIds ?? [];

  // Resolve targets
  const targets = targetIds.length
    ? await db.select().from(ytTargets).where(/* inArray */)
    : await db.select().from(ytTargets).where(eq(ytTargets.isActive, true));

  if (!targets.length) {
    return new Response(JSON.stringify({ error: 'No active targets' }), { status: 400 });
  }

  // Create run record
  const [run] = await db.insert(ytScrapeRuns).values({
    status: 'running',
    targetsScraped: targets.map((t) => t.label),
  }).returning({ id: ytScrapeRuns.id });

  const started = ytScrapeJob.start(targets.map((t) => String(t.id)), run.id);
  if (!started.ok) {
    return new Response(JSON.stringify({ error: started.reason }), { status: 500 });
  }

  return new Response(JSON.stringify({ runId: run.id, status: 'started', targetsCount: targets.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

### `/src/pages/api/youtube/gaps/[id]/approve.ts`

**Stage 0 → Stage 3 Bridge** (mirrors `reddit/gaps/[id]/approve.ts`):

```typescript
// POST /api/youtube/gaps/[id]/approve
// Body (optional): { authorNotes: string }
// Creates contentGap from ytExtractedGap

import type { APIRoute } from 'astro';
import { db } from '../../../../../db/index.js';
import { ytExtractedGaps, ytComments, contentGaps } from '../../../../../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { requireSession } from '../../../../../lib/auth.js';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const session = await requireSession(cookies);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const gapId = Number(params.id);
  const body = await request.json().catch(() => ({}));
  const authorNotes: string = body.authorNotes ?? '';

  const [gap] = await db.select().from(ytExtractedGaps).where(eq(ytExtractedGaps.id, gapId));
  if (!gap) return new Response('Not found', { status: 404 });
  if (gap.status === 'approved') return new Response('Already approved', { status: 409 });

  // Fetch source comments for context
  const sourceComments = gap.sourceCommentIds?.length
    ? await db.select({
        commentText: ytComments.commentText,
        author: ytComments.author,
        voteCount: ytComments.voteCount,
        videoTitle: ytComments.videoTitle,
      })
      .from(ytComments)
      .where(inArray(ytComments.id, gap.sourceCommentIds))
    : [];

  // Build gap description
  const voiceOfCustomer = (gap.vocabularyQuotes ?? [])
    .map((q) => `• "${q}"`)
    .join('\n');

  const sourceBlock = sourceComments.length
    ? `\nSource comments (${sourceComments.length}):\n` +
      sourceComments.map((c) => `- "${c.commentText.slice(0, 150)}" (${c.voteCount} votes)`).join('\n')
    : '';

  const gapDescription = [
    gap.painPointDescription,
    `\nVideo source: "${gap.sourceVideoTitle ?? 'unknown'}"`,
    sourceBlock,
    voiceOfCustomer ? `\nVoice of customer:\n${voiceOfCustomer}` : '',
    authorNotes ? `\nAuthor notes: ${authorNotes}` : '',
  ].filter(Boolean).join('\n');

  // Create contentGap (feeds Stage 3)
  const [contentGap] = await db.insert(contentGaps).values({
    gapTitle: gap.painPointTitle,
    gapDescription,
    suggestedAngle: gap.suggestedArticleAngle ?? '',
    sourceModels: ['youtube-apify', 'claude-sonnet'],
    status: 'new',
  }).returning({ id: contentGaps.id });

  // Update ytExtractedGap
  await db.update(ytExtractedGaps)
    .set({ status: 'approved', contentGapId: contentGap.id, approvedAt: new Date() })
    .where(eq(ytExtractedGaps.id, gapId));

  // Increment gapsCreated on run
  // (optional: db.update(ytScrapeRuns).set({ gapsCreated: sql`gaps_created + 1` }) ...)

  return new Response(JSON.stringify({ ok: true, contentGapId: contentGap.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

---

## Admin UI — `/src/pages/admin/youtube/index.astro`

Mirrors `admin/reddit/index.astro` with the following changes:

| Element | Reddit | YouTube |
|---|---|---|
| Page title | "Reddit Intelligence" | "YouTube Intelligence" |
| Stat labels | Posts collected / Pain points | Comments collected / Pain points |
| Target input | r/subreddit or keyword | YouTube video URL + title |
| Run metric label | `postsCollected` | `commentsCollected` |
| API base path | `/api/reddit/` | `/api/youtube/` |
| Log prefix | `[YT]` | `[YT]` |
| Icon/color | Reddit orange | YouTube red (`#ff0000`) |

**Add breadcrumb navigation link** in Reddit dashboard pointing to YouTube Intelligence and vice versa: "← Reddit | YouTube →"

---

## `src/components/admin/YtGapCard.astro`

Mirrors `RedditGapCard.astro` with:
- Extra field: **Source Video** (title + link to YouTube URL)
- Replace "Source Posts" block with "Source Comments" (comment text + vote count)
- `sourceVideoTitle` shown in header chip alongside category

---

## Environment Variables

Add to `.env.local` and `.env.example`:

```ini
# YouTube scraping engine
YT_MAX_COMMENTS_PER_TARGET=300     # Max comments per video target
YT_CHUNK_SIZE=20                   # Comments per LLM analysis batch
YT_ANALYSIS_MODEL=anthropic/claude-sonnet-4-6
```

(Reuses `APIFY_API_TOKEN` and `OPENROUTER_API_KEY` from Reddit config — no new keys needed.)

---

## Stage 0 → Stage 3 Data Flow (Detailed)

```
ytTargets (video URLs)
    │
    ▼  POST /api/youtube/start
ytScrapeRuns (status: 'running')
    │
    ▼  scripts/yt-scraper.ts (child process)
         │
         ├─ Apify: streamers/youtube-comments-scraper
         │   Input: { startUrls: [{url}], maxComments: N }
         │   Output: [{ cid, comment, author, voteCount, ... }]
         │
         ├─ Dedup by commentId
         ├─ Filter: top-level, length > 15 chars
         ├─ INSERT → ytComments
         │
         ├─ LLM chunks: Claude extracts pain points
         │   Prompt: comments → pain point JSON array
         │
         └─ INSERT → ytExtractedGaps (status: 'pending')

Admin reviews /admin/youtube
    │
    ▼  POST /api/youtube/gaps/{id}/approve
         │
         ├─ Fetch source ytComments
         ├─ Build gapDescription (pain point + voice of customer + video source)
         │
         └─ INSERT → contentGaps (status: 'new')
                  ↓
         SAME PIPELINE as GEO Monitor + Reddit Intelligence
                  ↓
         Stage 2: Gap Analysis + Proposal
                  ↓
         Stage 3: Draft Generator → published article
```

---

## Key Differences vs. Reddit Module

| Aspect | Reddit | YouTube |
|---|---|---|
| Apify actor | `trudax/reddit-scraper-lite` | `streamers/youtube-comments-scraper` |
| Target types | `subreddit` \| `keyword_search` | `video` (v1) |
| Primary content unit | Reddit post (title + body + comments) | YouTube comment (text + votes) |
| Dedup field | `redditId` | `cid` (Apify comment ID) |
| Date filtering | Posts older than 12 months discarded | No date on comments — filter by low vote count instead |
| LLM chunk size | 10 posts | 20 comments |
| Signal strength field | `upvotes` | `voteCount` + `hasCreatorHeart` |
| Niche targeting | Hardcoded subreddit list for keyword searches | Admin manually selects high-signal competitor videos |
| DB env var | `REDDIT_MAX_ITEMS_PER_TARGET` | `YT_MAX_COMMENTS_PER_TARGET` |

---

## Atomic Implementation Tasks

See `/docs/youtube-scraper-tasks.md` for the full autonomous agent task list.

---

## Testing Checklist

- [ ] `db:push` applies 4 new tables without errors
- [ ] `/api/youtube/targets` CRUD works (create, read, update, delete)
- [ ] `/api/youtube/start` creates run record, spawns child process
- [ ] `/api/youtube/stream` SSE streams live logs to browser
- [ ] `scripts/yt-scraper.ts` runs standalone: `SCRAPE_RUN_ID=1 SCRAPE_TARGET_IDS=1 npx tsx scripts/yt-scraper.ts`
- [ ] Comments are deduplicated on re-run
- [ ] LLM returns valid JSON array (test with 5-comment stub)
- [ ] `/api/youtube/gaps/{id}/approve` creates `contentGaps` record
- [ ] Approved gap appears in `/admin/content-gaps` for Stage 3
- [ ] `/admin/youtube` renders without errors
- [ ] Run details page shows correct stats

---

## Seed Data (for development)

High-signal video targets to pre-populate `ytTargets`:

```typescript
// scripts/seed-yt-targets.ts
const seedTargets = [
  {
    type: 'video',
    url: 'https://www.youtube.com/watch?v=JDqMpJi4LNA', // Ali Abdaal: How I Manage My Time
    label: 'Ali Abdaal: Time Management',
    videoId: 'JDqMpJi4LNA',
    priority: 90,
    maxComments: 300,
  },
  {
    type: 'video',
    url: 'https://www.youtube.com/watch?v=KSHU_7MIc1M', // Huberman: Focus
    label: 'Huberman Lab: Focus & Concentration',
    videoId: 'KSHU_7MIc1M',
    priority: 95,
    maxComments: 500,
  },
  {
    type: 'video',
    url: 'https://www.youtube.com/watch?v=J5vlPPpVIJU', // Deep Work productivity
    label: 'Deep Work: Cal Newport Method',
    videoId: 'J5vlPPpVIJU',
    priority: 85,
    maxComments: 300,
  },
];
```
