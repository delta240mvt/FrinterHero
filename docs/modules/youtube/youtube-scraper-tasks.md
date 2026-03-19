# YouTube Comments Scraper — Atomic Task List for Autonomous Agents

> **Module:** YouTube Intelligence (Stage 0, parallel to Reddit Intelligence)
> **Goal:** Scrape YouTube video comments via Apify, extract pain points with LLM, route approved gaps into the existing Stage 3 Draft Generator — without touching any existing module.
> **Full spec:** `docs/youtube-comments-scraper-implementation.md`
> **Mirror pattern:** Reddit module (read these files before implementing anything)

---

## How to Use This Document

Each task is:
- **Atomic** — one file, one responsibility, completable independently
- **Self-contained** — includes the exact code to write, the file to mirror, and gotchas
- **Verifiable** — acceptance criteria are explicit and testable

**Checkboxes** (`- [x]`) mark individual sub-steps within each task. Check them off as you complete them. The task is done only when all sub-steps are checked and the acceptance test passes.

**Dependency rule:** Never start a task before its listed dependencies are completed.

---

## Architecture Recap

```
YouTube video URLs (ytTargets)
    │
    ▼  POST /api/youtube/start
yt-scrape-job.ts (singleton, spawns child process)
    │
    ▼  scripts/yt-scraper.ts
         ├─ Apify: streamers/youtube-comments-scraper
         │   → raw comments → ytComments
         └─ OpenRouter (Claude Sonnet)
             → pain points → ytExtractedGaps [status: pending]
    │
    ▼  Admin: /admin/youtube
         └─ Approve gap → contentGaps [status: new]
                              │
                              ▼  (unchanged pipeline)
                         Stage 3: Draft Generator → published article
```

The module introduces **4 new DB tables**, **19 new files**, and modifies **4 existing files**. Nothing in the existing Reddit or GEO modules changes.

---

## PHASE 0 — Read Before You Code

> **Context:** Before writing a single line, the agent must fully read and understand the existing Reddit module. YouTube is a mirror — every deviation from the pattern must be intentional and documented here.

### TASK-YT-00 · Read existing module files

- [x] Read `src/db/schema.ts` — understand how `redditTargets`, `redditScrapeRuns`, `redditPosts`, `redditExtractedGaps`, and `contentGaps` are defined. Note the FK references and index patterns.
- [x] Read `scripts/reddit-scraper.ts` — understand the full flow: env var parsing → Apify call → field normalization → dedup → DB insert → LLM chunking → gap insert → stdout metric format → `RESULT_JSON` protocol.
- [x] Read `src/lib/reddit-scrape-job.ts` — understand the singleton EventEmitter pattern, child process spawn, log line parsing, metric extraction, globalThis persistence across HMR.
- [x] Read `src/pages/api/reddit/start.ts` — understand auth check, job guard, run record creation, job start call.
- [x] Read `src/pages/api/reddit/gaps/[id]/approve.ts` — understand the Stage 0→3 bridge: how a `redditExtractedGap` becomes a `contentGap`.
- [x] Read `src/pages/admin/reddit/index.astro` — understand the full page layout: stats banner, target sidebar, tab system, SSE log console, gap cards.
- [x] Read `src/components/admin/RedditGapCard.astro` — understand gap card props, expand/collapse pattern, approve/reject button logic.

**Acceptance:** You can describe from memory: (1) what `RESULT_JSON` is and when it's emitted, (2) exactly which fields get copied when a gap is approved into `contentGaps`, (3) what the `globalThis` key prevents.

---

## PHASE 1 — Database Schema

> **Context:** Four new tables appended to `src/db/schema.ts` after the Reddit block. They follow identical patterns: `ytScrapeRuns` is the parent, `ytComments` and `ytExtractedGaps` both cascade-delete when their parent run is deleted. `ytExtractedGaps` has a nullable FK to `contentGaps` (populated on approval).
>
> **Critical:** The `contentGaps` table already exists. Do NOT redefine it. Only reference it via FK in `ytExtractedGaps`.
>
> After all 4 tasks: run `npm run db:push` once to apply all tables together.

---

### TASK-YT-01 · Add `ytTargets` table

**Depends on:** YT-00
**Modifies:** `src/db/schema.ts`

- [x] Open `src/db/schema.ts`. Find the last Reddit table definition (`redditExtractedGaps`). Append below it.
- [x] Add `ytTargets` table:

```typescript
export const ytTargets = pgTable('yt_targets', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 20 }).notNull().default('video'), // v1: 'video' only
  url: varchar('url', { length: 500 }).notNull(),                   // Full YouTube video URL
  label: varchar('label', { length: 100 }).notNull(),              // Human display name
  videoId: varchar('video_id', { length: 20 }),                    // Extracted from ?v= param, used for dedup
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(50),             // 0–100, higher = scraped first
  maxComments: integer('max_comments').notNull().default(300),     // Per-video Apify limit
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [x] Verify no duplicate column names or import errors (`npx tsc --noEmit`).

**Acceptance:** TypeScript compiles. After `db:push`, table `yt_targets` exists in the database.

---

### TASK-YT-02 · Add `ytScrapeRuns` table

**Depends on:** YT-01
**Modifies:** `src/db/schema.ts`

- [x] Append after `ytTargets`:

```typescript
export const ytScrapeRuns = pgTable('yt_scrape_runs', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull(),             // 'running' | 'completed' | 'failed'
  targetsScraped: text('targets_scraped').array(),                 // Labels of scraped targets
  commentsCollected: integer('comments_collected').notNull().default(0),
  painPointsExtracted: integer('pain_points_extracted').notNull().default(0),
  gapsCreated: integer('gaps_created').notNull().default(0),       // Counter incremented on approval
  errorMessage: text('error_message'),
  logs: text('logs').array().notNull().default([]),                // Full stdout log lines (ring buffer)
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});
```

- [x] Note: `logs` stores individual log lines as a text array, same as `redditScrapeRuns.logs`. The job manager writes logs here via DB update at the end of the run (not streaming — streaming is via SSE in memory).

**Acceptance:** Table `yt_scrape_runs` in DB. No FK issues (this table is referenced by the next two).

---

### TASK-YT-03 · Add `ytComments` table

**Depends on:** YT-02
**Modifies:** `src/db/schema.ts`

- [x] Check if `uniqueIndex` is already imported from `drizzle-orm/pg-core`. If not, add it.
- [x] Append after `ytScrapeRuns`:

```typescript
export const ytComments = pgTable('yt_comments', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull()
    .references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  commentId: varchar('comment_id', { length: 50 }).notNull(),      // Apify 'cid' field — globally unique
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
  commentIdUniq: uniqueIndex('yt_comments_cid_uniq').on(table.commentId),
}));
```

- [x] The `uniqueIndex` on `commentId` is the dedup mechanism — inserting a known `cid` will throw a unique constraint error. The scraper filters before insert, but the constraint is the safety net.

**Acceptance:** Table `yt_comments` with 2 regular indexes and 1 unique index in DB.

---

### TASK-YT-04 · Add `ytExtractedGaps` table

**Depends on:** YT-02, YT-03
**Modifies:** `src/db/schema.ts`

- [x] Append after `ytComments`:

```typescript
export const ytExtractedGaps = pgTable('yt_extracted_gaps', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull()
    .references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1–10, used for sort order
  frequency: integer('frequency').notNull().default(1),          // # comments that mention this pain point
  vocabularyQuotes: text('vocabulary_quotes').array(),           // Exact short quotes from comments
  sourceCommentIds: integer('source_comment_ids').array(),       // IDs from ytComments (for approval context)
  sourceVideoId: varchar('source_video_id', { length: 20 }),
  sourceVideoTitle: varchar('source_video_title', { length: 255 }),
  suggestedArticleAngle: text('suggested_article_angle'),        // LLM-proposed framing for Stage 3
  category: varchar('category', { length: 50 }),                 // 'focus'|'energy'|'burnout'|'relationships'|'systems'|'tech'|'mindset'|'health'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending'|'approved'|'rejected'
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  contentGapId: integer('content_gap_id')
    .references(() => contentGaps.id),                           // Populated when admin approves → Stage 3
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('yt_gaps_status_idx').on(table.status),
  intensityIdx: index('yt_gaps_intensity_idx').on(table.emotionalIntensity),
  runIdx: index('yt_gaps_run_idx').on(table.scrapeRunId),
}));
```

- [x] `contentGaps` is already defined earlier in `schema.ts`. Make sure the reference `() => contentGaps.id` points to the existing table, not a redefinition.
- [x] Run `npm run db:push` after all 4 schema tasks are done to apply changes in one migration.

**Acceptance:** All 4 tables exist in DB. `yt_extracted_gaps.content_gap_id` FK points to `content_gaps.id`. `npm run db:push` exits 0.

---

## PHASE 2 — Core Scraper Engine

> **Context:** Two files form the engine. The scraper script (`yt-scraper.ts`) runs as a detached child process — it has no access to Astro's request context. It communicates with the parent process exclusively via stdout lines. The job manager (`yt-scrape-job.ts`) is a singleton that spawns and monitors that child process.
>
> **stdout protocol** (critical — must match exactly what the job manager parses):
> - Regular logs: `[YYYY-MM-DDTHH:mm:ss.sssZ] [YT] message text\n`
> - Metric updates: `commentsCollected:42\n` and `painPointsExtracted:7\n`
> - Current target: `[YT] Scraping: Label Name\n` (job manager extracts "Label Name" as `currentTarget`)
> - End signal: `RESULT_JSON:{"commentsCollected":42,"painPointsExtracted":7}\n`

---

### TASK-YT-05 · Create `scripts/yt-scraper.ts`

**Depends on:** YT-01, YT-02, YT-03, YT-04
**Creates:** `scripts/yt-scraper.ts`
**Mirror:** `scripts/reddit-scraper.ts` (read it fully before writing)

- [x] Create file. Start with env var parsing block at top:
  ```typescript
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN!;
  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;
  const MAX_COMMENTS = parseInt(process.env.YT_MAX_COMMENTS_PER_TARGET ?? '300');
  const CHUNK_SIZE = parseInt(process.env.YT_CHUNK_SIZE ?? '20');
  const ANALYSIS_MODEL = process.env.YT_ANALYSIS_MODEL ?? 'anthropic/claude-sonnet-4-6';
  const RUN_ID = parseInt(process.env.SCRAPE_RUN_ID!);
  const TARGET_IDS_RAW = process.env.SCRAPE_TARGET_IDS ?? '';
  ```

- [x] Implement `log(msg)` and `metric(key, value)` helpers that write to stdout in the exact format the job manager expects.

- [x] Define `ApifyComment` interface matching the `streamers/youtube-comments-scraper` output schema:
  ```typescript
  interface ApifyComment {
    cid: string; comment: string; author: string; videoId: string;
    pageUrl: string; commentsCount: number; replyCount: number;
    voteCount: number; authorIsChannelOwner: boolean;
    hasCreatorHeart: boolean; type: string; replyToCid: string | null;
    title: string;
  }
  ```

- [x] Implement `mapToDbComment(item: ApifyComment, runId: number)` — maps Apify fields to `ytComments` insert shape.

- [x] Define `ExtractedGap` interface and implement `extractPainPoints(comments, videoTitle)` async function:
  - Calls OpenRouter with `ANALYSIS_MODEL`
  - Returns 2–5 pain points per chunk
  - Prompt must specify: output only JSON array, no markdown
  - Maps `sourceCommentIndices` (1-based from LLM) to actual DB IDs

- [x] Implement `main()` async function:
  - [x] Load targets from DB (filtered by `TARGET_IDS_RAW` or all active)
  - [x] For each target: call Apify actor, fetch logs, fetch dataset items
  - [x] Dedup: query existing `commentId` values, filter new items
  - [x] Filter: `!item.replyToCid && item.comment.length > 15` (top-level, meaningful length)
  - [x] Batch insert into `ytComments`, capture returned IDs
  - [x] Update `ytTargets.lastScrapedAt` for the target
  - [x] Split inserted comments into chunks of `CHUNK_SIZE`, call `extractPainPoints` for each
  - [x] Insert pain points into `ytExtractedGaps` (status: 'pending')
  - [x] Write `commentsCollected:N` and `painPointsExtracted:N` metrics after each target
  - [x] After all targets: update `ytScrapeRuns` status to 'completed', write `RESULT_JSON`
  - [x] Wrap in try/catch: on error, update run status to 'failed', `process.exit(1)`

- [x] Verify the script compiles: `npx tsc --noEmit` (or `npx tsx --check scripts/yt-scraper.ts`).

**Gotcha:** The Apify actor name is `streamers/youtube-comments-scraper` (not `trudax/...`). The input key is `startUrls` (array of `{url, method}`), not a plain URL string.

**Acceptance:** `SCRAPE_RUN_ID=1 SCRAPE_TARGET_IDS=1 APIFY_API_TOKEN=test npx tsx scripts/yt-scraper.ts` starts, logs at least the initial `[YT] Starting YouTube Comments Scraper` line, and fails gracefully at the Apify call (expected without a real token).

---

### TASK-YT-06 · Create `src/lib/yt-scrape-job.ts`

**Depends on:** YT-05
**Creates:** `src/lib/yt-scrape-job.ts`
**Mirror:** `src/lib/reddit-scrape-job.ts` (copy as base, apply substitutions)

- [x] Copy `reddit-scrape-job.ts` content into the new file.
- [x] Apply substitutions:
  - `RedditScrapeJobManager` → `YtScrapeJobManager`
  - `redditScrapeJob` → `ytScrapeJob`
  - `'reddit-scrape-job'` (globalThis key) → `'yt-scrape-job'`
  - `scripts/reddit-scraper.ts` → `scripts/yt-scraper.ts`
  - `SCRAPE_TARGETS` (env var passed to child) → `SCRAPE_TARGET_IDS`
  - `postsCollected` (metric field + snapshot field) → `commentsCollected`
  - `painPointsExtracted` stays the same
  - `[REDDIT]` log prefix → `[YT]` (for `currentTarget` line parsing)
  - Update exported types: `RedditJobStatus` → `YtJobStatus`, `RedditScrapeSnapshot` → `YtScrapeSnapshot`

- [x] Update `YtScrapeSnapshot` interface:
  ```typescript
  export interface YtScrapeSnapshot {
    status: YtJobStatus;
    startedAt: number | null;
    finishedAt: number | null;
    exitCode: number | null;
    commentsCollected: number;   // was: postsCollected
    painPointsExtracted: number;
    currentTarget: string | null;
    lines: { line: string; ts: number }[];
    result: any | null;
  }
  ```

- [x] Verify `ytScrapeJob.isRunning()` works on a fresh import.
- [x] Verify `ytScrapeJob.start(['1', '2'], 99)` returns `{ ok: true }` (does not throw).

**Gotcha:** The `globalThis` singleton pattern prevents duplicate instances during Vite HMR. Do not remove it. The key string `'yt-scrape-job'` must be unique — do not reuse the Reddit key.

**Acceptance:** `import { ytScrapeJob } from './yt-scrape-job.js'` compiles cleanly. No TS errors.

---

## PHASE 3 — API: Job Control

> **Context:** Three endpoints control the scraping job lifecycle: `start` (creates DB run + spawns process), `status` (polling snapshot), `stream` (SSE live logs). All three are stateless wrappers around the `ytScrapeJob` singleton.
>
> All API routes require admin session auth — check how `requireSession` is used in the Reddit equivalents and use it identically.

---

### TASK-YT-07 · Create `POST /api/youtube/start`

**Depends on:** YT-02, YT-06
**Creates:** `src/pages/api/youtube/start.ts`
**Mirror:** `src/pages/api/reddit/start.ts`

- [x] Copy Reddit start route. Replace imports: `redditScrapeJob` → `ytScrapeJob`, `redditScrapeRuns` → `ytScrapeRuns`, `redditTargets` → `ytTargets`.
- [x] Change body shape: Reddit uses `{ targets: string[] }` (values). YouTube uses `{ targetIds: number[] }` (IDs) — because YT targets are identified by ID, not by subreddit string.
- [x] When `targetIds` is provided: `WHERE id IN (targetIds)`. When empty: `WHERE is_active = true`.
- [x] Pass `targets.map(t => String(t.id))` as the first arg to `ytScrapeJob.start()` — these become the `SCRAPE_TARGET_IDS` env var.
- [x] `targetsScraped` field on the run record: `targets.map(t => t.label)` (human-readable).
- [x] Response shape: `{ runId, status: 'started', targetsCount }`.

**Acceptance:** `POST /api/youtube/start` with empty body and at least 1 active target in DB returns 200 with `{ runId: N, status: 'started' }`. Second call while running returns 409.

---

### TASK-YT-08 · Create `GET /api/youtube/status`

**Depends on:** YT-06
**Creates:** `src/pages/api/youtube/status.ts`
**Mirror:** `src/pages/api/reddit/status.ts`

- [x] Copy Reddit status route verbatim.
- [x] Replace `redditScrapeJob` with `ytScrapeJob`.
- [x] Ensure `Cache-Control: no-store` header is set (already in the Reddit version).

**Acceptance:** `GET /api/youtube/status` returns `{ status: 'idle', commentsCollected: 0, ... }` when no job running.

---

### TASK-YT-09 · Create `GET /api/youtube/stream`

**Depends on:** YT-06
**Creates:** `src/pages/api/youtube/stream.ts`
**Mirror:** `src/pages/api/reddit/stream.ts`

- [x] Copy Reddit stream route verbatim.
- [x] Replace `redditScrapeJob` with `ytScrapeJob`.
- [x] SSE event format stays identical: `data: ${JSON.stringify({ line })}\n\n` and `data: ${JSON.stringify({ done: true, code })}\n\n`.
- [x] The `?from=N` query param allows the admin UI to resume streaming after page reload without restarting the job.

**Acceptance:** Opening `GET /api/youtube/stream` in a browser while a job runs emits a stream of `data: {...}` lines. Closing the connection does not crash the server.

---

## PHASE 4 — API: Run Management

> **Context:** Two endpoints manage completed run records. Cascade delete is handled by FK `ON DELETE CASCADE` in the schema (YT-02, YT-03, YT-04), so deleting a run automatically removes its comments and extracted gaps from the DB.

---

### TASK-YT-10 · Create `GET /api/youtube/runs`

**Depends on:** YT-02
**Creates:** `src/pages/api/youtube/runs/index.ts`
**Mirror:** `src/pages/api/reddit/runs/index.ts`

- [x] Copy Reddit runs list route. Replace `redditScrapeRuns` with `ytScrapeRuns`.
- [x] Query params: `page` (default 1), `limit` (default 20, max 50).
- [x] Order by: `runAt DESC`.
- [x] Response: `{ runs, total, page, limit }`.

**Acceptance:** `GET /api/youtube/runs` returns `{ runs: [], total: 0, page: 1, limit: 20 }` on empty table.

---

### TASK-YT-11 · Create `DELETE /api/youtube/runs/[id]`

**Depends on:** YT-02, YT-03, YT-04
**Creates:** `src/pages/api/youtube/runs/[id].ts`
**Mirror:** `src/pages/api/reddit/runs/[id].ts`

- [x] Copy Reddit delete route. Replace `redditScrapeRuns` with `ytScrapeRuns`.
- [x] Deleting the run cascades to `ytComments` and `ytExtractedGaps` via FK (no manual delete needed).
- [x] Return 404 if run not found. Return 204 on success.
- [x] Guard: do not allow deleting a run while it's `status = 'running'` (return 409).

**Acceptance:** `DELETE /api/youtube/runs/1` removes run and all associated rows. Second call returns 404.

---

## PHASE 5 — API: Gap Review

> **Context:** This is the editorial heart of Stage 0. The gaps list endpoint serves the admin review queue. The approve endpoint is the Stage 0 → Stage 3 bridge — it converts a `ytExtractedGap` into a `contentGap` that feeds the existing Draft Generator pipeline.
>
> **Critical:** The `contentGaps` table is shared with Reddit Intelligence and the GEO Monitor. The `sourceModels` field is what distinguishes the origin: use `['youtube-apify', 'claude-sonnet']` for YouTube gaps.

---

### TASK-YT-12 · Create `GET /api/youtube/gaps`

**Depends on:** YT-03, YT-04
**Creates:** `src/pages/api/youtube/gaps/index.ts`
**Mirror:** `src/pages/api/reddit/gaps/index.ts`

- [x] Copy Reddit gaps list route. Replace `redditExtractedGaps` with `ytExtractedGaps`.
- [x] Replace the `redditPosts` join with a `ytComments` join on `sourceCommentIds` (up to 3 source comments per gap).
- [x] Keep all filter params: `status` ('pending'|'approved'|'rejected'), `category`, `runId`, `page`, `limit`.
- [x] Order: `emotionalIntensity DESC`, then `createdAt DESC`.
- [x] Each gap in the response should include a `sourceComments` array with fields: `commentText`, `author`, `voteCount`, `videoTitle`.

**Acceptance:** `GET /api/youtube/gaps?status=pending` returns array (empty if no gaps yet). Each gap has `sourceComments` populated.

---

### TASK-YT-13 · Create `POST /api/youtube/gaps/[id]/approve` _(Stage 0 → Stage 3 bridge)_

**Depends on:** YT-03, YT-04, YT-12
**Creates:** `src/pages/api/youtube/gaps/[id]/approve.ts`
**Mirror:** `src/pages/api/reddit/gaps/[id]/approve.ts`

This is the most critical endpoint. Study `reddit/gaps/[id]/approve.ts` carefully before implementing.

- [x] Auth check (same pattern as Reddit version).
- [x] Load gap by ID from `ytExtractedGaps`. Return 404 if not found.
- [x] Guard: if `gap.status === 'approved'` return 409 (idempotency).
- [x] Parse optional `authorNotes` from request body.
- [x] Fetch source comments from `ytComments` by `gap.sourceCommentIds` (max 5 comments for context).
- [x] Build `gapDescription` string — assemble in this order:
  1. `gap.painPointDescription`
  2. `\nSource video: "{gap.sourceVideoTitle}"`
  3. Source comments block: each `"${comment.commentText.slice(0, 150)}" (${comment.voteCount} votes)`
  4. Voice of customer block: `gap.vocabularyQuotes` as bullet list
  5. `authorNotes` if provided
- [x] `INSERT INTO contentGaps`:
  ```typescript
  {
    gapTitle: gap.painPointTitle,
    gapDescription,                                  // assembled above
    suggestedAngle: gap.suggestedArticleAngle ?? '',
    sourceModels: ['youtube-apify', 'claude-sonnet'], // identifies YouTube origin
    status: 'new',
  }
  ```
- [x] `UPDATE ytExtractedGaps SET status='approved', contentGapId=N, approvedAt=now()`.
- [x] Return `{ ok: true, contentGapId: N }`.

**Gotcha:** The `contentGaps.sourceModels` column is a text array. Do not pass a JSON string — pass the actual array `['youtube-apify', 'claude-sonnet']`.

**Acceptance:** After calling this endpoint: (1) `contentGaps` has a new row with `status='new'` and `source_models = '{youtube-apify,claude-sonnet}'`, (2) `yt_extracted_gaps` row has `status='approved'` and `content_gap_id` set.

---

### TASK-YT-14 · Create `POST /api/youtube/gaps/[id]/reject`

**Depends on:** YT-04
**Creates:** `src/pages/api/youtube/gaps/[id]/reject.ts`
**Mirror:** `src/pages/api/reddit/gaps/[id]/reject.ts`

- [x] Copy Reddit reject route. Replace `redditExtractedGaps` with `ytExtractedGaps`.
- [x] Set `status='rejected'`, `rejectedAt=new Date()`.
- [x] Return `{ ok: true }`.

**Acceptance:** Gap status becomes `'rejected'` with `rejected_at` timestamp set. Subsequent approve call returns 404-style error or re-opens (match Reddit behavior).

---

## PHASE 6 — API: Target Management

> **Context:** Targets are the YouTube video URLs the admin wants to monitor. In contrast to Reddit (where targets are subreddit names or keyword strings), YouTube targets are URLs. The `videoId` field is auto-extracted from the URL `?v=` param — no need for the admin to enter it manually.

---

### TASK-YT-15 · Create `GET/POST /api/youtube/targets`

**Depends on:** YT-01
**Creates:** `src/pages/api/youtube/targets/index.ts`
**Mirror:** `src/pages/api/reddit/targets/index.ts`

- [x] `GET`: Return all targets ordered by `priority DESC`. Response: `{ targets }`.
- [x] `POST`: Accept `{ url, label, type?, priority?, maxComments?, isActive? }`.
- [x] Auto-extract `videoId` from URL:
  ```typescript
  function extractVideoId(url: string): string | null {
    try {
      return new URL(url).searchParams.get('v') ?? null;
    } catch {
      return null;
    }
  }
  ```
- [x] Set `videoId` before insert. If `extractVideoId` returns null, still insert (videoId is nullable).
- [x] Return 201 with created target.

**Acceptance:** `POST /api/youtube/targets` with `{ url: "https://www.youtube.com/watch?v=ABC123", label: "Test" }` creates target with `video_id = 'ABC123'`.

---

### TASK-YT-16 · Create `PUT/DELETE /api/youtube/targets/[id]`

**Depends on:** YT-01
**Creates:** `src/pages/api/youtube/targets/[id].ts`
**Mirror:** `src/pages/api/reddit/targets/[id].ts`

- [x] `PUT`: Accept `{ isActive?, priority?, label?, maxComments? }`. Partial update — only set provided fields.
- [x] `DELETE`: Hard delete. Return 204. (If the target has runs associated, Drizzle will error on FK violation — this is expected: runs must be deleted first.)
- [x] Return 404 if target not found.

**Acceptance:** Toggle `isActive` via PUT. Delete target with no associated runs succeeds with 204.

---

## PHASE 7 — Admin UI Components

> **Context:** Two reusable Astro components. Both are pure display + JS interaction — no server-side data fetching. They receive props from the parent page and make fetch calls to the API routes created in Phases 3–6.
>
> Astro components in this project use plain `<script>` tags with vanilla JS (no framework). Keep the same pattern — no React, no Svelte.

---

### TASK-YT-17 · Create `YtRunsTable.astro`

**Depends on:** YT-10, YT-11
**Creates:** `src/components/admin/YtRunsTable.astro`
**Mirror:** `src/components/admin/RedditRunsTable.astro`

- [x] Copy `RedditRunsTable.astro`. Apply changes:
  - Title: "Recent YouTube Scrape Runs"
  - Column header: "Posts" → "Comments"
  - Data field: `run.postsCollected` → `run.commentsCollected`
  - Row click link: `/admin/youtube/run/${run.id}`
  - Delete fetch URL: `/api/youtube/runs/${run.id}`
- [x] Props interface:
  ```typescript
  interface Props {
    runs: Array<{
      id: number; runAt: Date; status: string;
      targetsScraped: string[] | null; commentsCollected: number;
      painPointsExtracted: number; gapsCreated: number;
      finishedAt: Date | null; durationMs: number | null;
    }>;
  }
  ```
- [x] Status badge colors: 'running' → gold, 'completed' → teal, 'failed' → red. (Match Reddit pattern.)

**Acceptance:** Component renders a table with correct columns. Delete button triggers `DELETE /api/youtube/runs/{id}` and reloads the row.

---

### TASK-YT-18 · Create `YtGapCard.astro`

**Depends on:** YT-12, YT-13, YT-14
**Creates:** `src/components/admin/YtGapCard.astro`
**Mirror:** `src/components/admin/RedditGapCard.astro`

- [x] Copy `RedditGapCard.astro`. Apply changes:
  - API fetch paths: `/api/reddit/gaps/` → `/api/youtube/gaps/`
  - Replace "Source Posts" block with "Source Comments" block:
    - Show `comment.commentText` truncated to 150 chars
    - Show `comment.voteCount` vote count
    - No subreddit label — show `sourceVideoTitle` chip instead
  - Add "Source Video" field in the expanded section:
    ```html
    <a href={`https://youtube.com/watch?v=${gap.sourceVideoId}`} target="_blank">
      {gap.sourceVideoTitle}
    </a>
    ```
  - Keep: intensity badge, category badge, vocabularyQuotes chips, author notes textarea, approve/reject buttons.

- [x] Props interface:
  ```typescript
  interface Props {
    gap: {
      id: number; painPointTitle: string; painPointDescription: string;
      emotionalIntensity: number; frequency: number;
      vocabularyQuotes: string[] | null;
      sourceComments: { commentText: string; author: string | null; voteCount: number }[];
      sourceVideoId: string | null; sourceVideoTitle: string | null;
      suggestedArticleAngle: string | null; category: string | null;
      status: string; scrapeRunId: number; createdAt: Date;
    };
  }
  ```

- [x] The approve button must pass `authorNotes` from the textarea: `body: JSON.stringify({ authorNotes })`.

**Acceptance:** Card renders collapsed. Expanding shows pain point description, source comments, vocabulary quotes, and source video link. Approve/reject buttons call the correct YouTube API endpoints.

---

## PHASE 8 — Admin Pages

> **Context:** Three Astro pages with server-side data loading (`getStaticPaths` / frontmatter `Astro.request`). They use the components from Phase 7 and call the API routes from Phases 3–6. The overall layout (dark sidebar, stats banner, tab system, SSE log console) mirrors the Reddit admin pages exactly.
>
> **Important:** Astro pages in SSR mode use the frontmatter (between `---`) for server-side code. JavaScript inside `<script>` tags runs client-side. Do not mix them.

---

### TASK-YT-19 · Create `/admin/youtube/index.astro`

**Depends on:** YT-07..YT-14, YT-17, YT-18
**Creates:** `src/pages/admin/youtube/index.astro`
**Mirror:** `src/pages/admin/reddit/index.astro`

- [x] In the frontmatter: load targets (`ytTargets`), gap counts by status (`ytExtractedGaps`), and recent runs (`ytScrapeRuns`, last 5).
- [x] Left sidebar: list targets as checkboxes. Each checkbox value = target `id` (number). "Select All / Deselect All" buttons.
- [x] "▶ Start Scraping" button: collect checked target IDs, POST to `/api/youtube/start` with `{ targetIds: [...] }`.
- [x] Stats banner: 4 counters — Pending / Approved / Rejected / Total Runs.
- [x] Main area: 3 tabs (Pending, Approved, Rejected). Each tab renders `YtGapCard` components filtered by status.
- [x] Runs section: `YtRunsTable` component with recent runs.
- [x] SSE log console (hidden div, shown when job starts): `EventSource('/api/youtube/stream')`, append lines.
- [x] Status polling: after job starts, poll `/api/youtube/status` every 2s to update live counters. Stop polling when `status === 'done'` or `'error'`.
- [x] Auto-reload page 1.5s after job completes (to refresh gap counts).
- [x] Cross-link in breadcrumb: `← Reddit Intelligence` → `/admin/reddit`.

**Gotcha:** Target checkboxes use `id` (integer) not subreddit string. The POST body must be `{ targetIds: [1, 2, 3] }` — not `{ targets: ['label'] }`.

**Acceptance:** Page loads without errors. "Start Scraping" with targets selected triggers a job. Gaps appear in Pending tab after run completes. Approve button moves gap to Approved tab on reload.

---

### TASK-YT-20 · Create `/admin/youtube/targets.astro`

**Depends on:** YT-15, YT-16
**Creates:** `src/pages/admin/youtube/targets.astro`
**Mirror:** `src/pages/admin/reddit/targets.astro`

- [x] Frontmatter: load all targets from `ytTargets` ordered by `priority DESC`.
- [x] "Add Target" form fields: `url` (text, required), `label` (text, required), `maxComments` (number, default 300), `priority` (0–100, default 50). Hidden field: `type = 'video'`.
- [x] Form submit: `POST /api/youtube/targets`, then reload page.
- [x] Quick-add preset buttons (5 buttons, each pre-fills the URL + label fields):
  - "Ali Abdaal: Time Management"
  - "Huberman Lab: Focus"
  - "Andrew Huberman: Morning Routine"
  - "Cal Newport: Deep Work"
  - "Thomas Frank: Productivity"
- [x] Targets table columns: Label | Video URL (truncated to 50 chars + link icon) | Max Comments | Priority | Active (toggle) | Delete.
- [x] Active toggle: `PUT /api/youtube/targets/{id}` with `{ isActive: !current }`.
- [x] Delete button: `DELETE /api/youtube/targets/{id}`.

**Acceptance:** Can add a new target with a YouTube URL and see `videoId` auto-extracted (verify in DB). Toggle active/inactive. Delete target with no runs.

---

### TASK-YT-21 · Create `/admin/youtube/run/[id].astro`

**Depends on:** YT-04, YT-17, YT-18
**Creates:** `src/pages/admin/youtube/run/[id].astro`
**Mirror:** `src/pages/admin/reddit/run/[id].astro`

- [x] Frontmatter: load `ytScrapeRuns` by ID. If not found, redirect to `/admin/youtube`.
- [x] Load `ytExtractedGaps` for this run, grouped by status.
- [x] Stats header: Comments Collected / Pain Points Extracted / Gaps Created / Pending Review.
- [x] Targets scraped: render as chips from `run.targetsScraped` array.
- [x] Error message block: show `run.errorMessage` if `status === 'failed'`.
- [x] Gaps sections: Pending → Approved → Rejected, each using `YtGapCard`.
- [x] Full logs section: show `run.logs` array (one entry per line). "Download Logs" button generates `.txt` file client-side.
- [x] Breadcrumb: `Admin > YouTube Intelligence > Run #${run.id}`.

**Acceptance:** Page loads for an existing run ID. Gaps grouped by status. Log download works.

---

## PHASE 9 — Wiring, Config & Seed

> **Context:** Final integration phase. These tasks connect the YouTube module into the rest of the application (navigation, environment documentation) and provide development-time shortcuts (seed data).

---

### TASK-YT-22 · Add YouTube Intelligence to admin navigation

**Depends on:** YT-19
**Modifies:** Admin nav component or layout (find it: check `src/layouts/`, `src/components/admin/`, or look for where the Reddit Intelligence nav link is defined)

- [x] Find the file that renders the admin sidebar/nav links. Search for `/admin/reddit` or "Reddit Intelligence" to locate it.
- [x] Add a new nav entry immediately after the Reddit Intelligence link:
  - Label: "YouTube Intelligence"
  - Icon: use a simple video/play symbol consistent with the existing icon style (no emoji unless the nav already uses emoji)
  - Href: `/admin/youtube`
- [x] Active state: highlight the link when `Astro.url.pathname.startsWith('/admin/youtube')`.

**Acceptance:** `/admin/youtube` nav link appears in the sidebar. Active state works on all YouTube admin pages.

---

### TASK-YT-23 · Add cross-link from Reddit dashboard to YouTube dashboard

**Depends on:** YT-19
**Modifies:** `src/pages/admin/reddit/index.astro`

- [x] Find the breadcrumb or header area at the top of the Reddit admin page.
- [x] Add a secondary link: "YouTube Intelligence →" pointing to `/admin/youtube`.
- [x] Style it as a muted secondary link (not a primary action button).

**Acceptance:** Reddit dashboard has a visible link to YouTube Intelligence. Clicking it navigates correctly.

---

### TASK-YT-24 · Update `.env.example` with YouTube variables

**Depends on:** YT-05
**Modifies:** `.env.example`

- [x] Find the `# Reddit scraping engine` block in `.env.example`.
- [x] Append immediately after it:
  ```ini
  # YouTube scraping engine (reuses APIFY_API_TOKEN and OPENROUTER_API_KEY from above)
  YT_MAX_COMMENTS_PER_TARGET=300     # Max comments scraped per video target
  YT_CHUNK_SIZE=20                   # Comments per LLM pain-point extraction batch
  YT_ANALYSIS_MODEL=anthropic/claude-sonnet-4-6
  ```

**Acceptance:** `.env.example` contains the YouTube block. A developer following the setup guide sees all required variables.

---

### TASK-YT-25 · Create `scripts/seed-yt-targets.ts`

**Depends on:** YT-01
**Creates:** `scripts/seed-yt-targets.ts`

- [x] Import `db` and `ytTargets` from schema.
- [x] Define 5 seed targets (high-signal productivity/focus YouTube videos):

```typescript
const seeds = [
  { type: 'video' as const, url: 'https://www.youtube.com/watch?v=JDqMpJi4LNA',
    videoId: 'JDqMpJi4LNA', label: 'Ali Abdaal: How I Manage My Time',
    priority: 90, maxComments: 300 },
  { type: 'video' as const, url: 'https://www.youtube.com/watch?v=KSHU_7MIc1M',
    videoId: 'KSHU_7MIc1M', label: 'Huberman Lab: Focus & Concentration',
    priority: 95, maxComments: 500 },
  { type: 'video' as const, url: 'https://www.youtube.com/watch?v=J5vlPPpVIJU',
    videoId: 'J5vlPPpVIJU', label: 'Deep Work: Cal Newport Method',
    priority: 85, maxComments: 300 },
  { type: 'video' as const, url: 'https://www.youtube.com/watch?v=dABmkdRvN-A',
    videoId: 'dABmkdRvN-A', label: 'Thomas Frank: Productivity System',
    priority: 80, maxComments: 300 },
  { type: 'video' as const, url: 'https://www.youtube.com/watch?v=wfKv4qPBqZc',
    videoId: 'wfKv4qPBqZc', label: 'Andrew Huberman: Morning Routine',
    priority: 88, maxComments: 400 },
];
```

- [x] Use `.onConflictDoNothing()` so re-running the seed is safe.
- [x] `process.exit(0)` on success.

- [x] **Run it:** `npx tsx scripts/seed-yt-targets.ts`

**Acceptance:** 5 rows inserted in `yt_targets`. Running again does not duplicate them.

---

## PHASE 10 — Documentation

### TASK-YT-26 · Update `README.md` — Stage 0 now covers Reddit + YouTube

**Depends on:** all previous tasks (do this last)
**Modifies:** `README.md`

- [x] In the "How It Works" ASCII diagram, update Stage 0 label:
  ```
  │  STAGE 0 · SOCIAL INTELLIGENCE (Reddit + YouTube)
  ```

- [x] In the Stage 0 box description, add a second bullet:
  ```
  │  Apify scrapes Reddit (trudax/reddit-scraper-lite)              │
  │  Apify scrapes YouTube comments (streamers/youtube-comments-scraper) │
  ```

- [x] After the "Reddit Intelligence — How It Works" section, add a parallel "YouTube Intelligence — How It Works" section:

  ```markdown
  ### YouTube Intelligence — How It Works

  Targets high-signal competitor/niche YouTube videos via [Apify](https://apify.com) (`streamers/youtube-comments-scraper`):

  | Target Type | Example | How Apify Fetches |
  |---|---|---|
  | **Video** | `youtube.com/watch?v=ABC` | Full comment thread, top-level only, up to N comments |

  Post-processing pipeline:
  1. **Deduplication** — `commentId` (Apify `cid`) checked against existing DB records
  2. **Top-level filter** — replies excluded; minimum 15-character comment length
  3. **LLM analysis** — Claude extracts pain points in batches of 20 comments
  4. **Admin queue** — pending gaps appear in `/admin/youtube` for review
  ```

- [x] In the Features comparison table, add a row:
  ```
  | YouTube comment intelligence (Apify) | YES | NO | NO |
  ```

- [x] In the Configuration > AI Integration table, YouTube does not need new keys (reuses Apify + OpenRouter). Add a note under the table:
  > YouTube Intelligence reuses `APIFY_API_TOKEN` and `OPENROUTER_API_KEY`. No additional keys required.

**Acceptance:** README accurately describes YouTube alongside Reddit as a Stage 0 source. No broken formatting.

---

## Progress Tracker

| Phase | Task | Status | File |
|---|---|:---:|---|
| 0 · Read | YT-00 | `[x]` | _(read only)_ |
| 1 · Schema | YT-01 | `[x]` | `src/db/schema.ts` |
| 1 · Schema | YT-02 | `[x]` | `src/db/schema.ts` |
| 1 · Schema | YT-03 | `[x]` | `src/db/schema.ts` |
| 1 · Schema | YT-04 | `[x]` | `src/db/schema.ts` → **`db:push`** |
| 2 · Engine | YT-05 | `[x]` | `scripts/yt-scraper.ts` _(new)_ |
| 2 · Engine | YT-06 | `[x]` | `src/lib/yt-scrape-job.ts` _(new)_ |
| 3 · API Job | YT-07 | `[x]` | `src/pages/api/youtube/start.ts` _(new)_ |
| 3 · API Job | YT-08 | `[x]` | `src/pages/api/youtube/status.ts` _(new)_ |
| 3 · API Job | YT-09 | `[x]` | `src/pages/api/youtube/stream.ts` _(new)_ |
| 4 · API Runs | YT-10 | `[x]` | `src/pages/api/youtube/runs/index.ts` _(new)_ |
| 4 · API Runs | YT-11 | `[x]` | `src/pages/api/youtube/runs/[id].ts` _(new)_ |
| 5 · API Gaps | YT-12 | `[x]` | `src/pages/api/youtube/gaps/index.ts` _(new)_ |
| 5 · API Gaps | YT-13 | `[x]` | `src/pages/api/youtube/gaps/[id]/approve.ts` _(new)_ **← bridge** |
| 5 · API Gaps | YT-14 | `[x]` | `src/pages/api/youtube/gaps/[id]/reject.ts` _(new)_ |
| 6 · API Targets | YT-15 | `[x]` | `src/pages/api/youtube/targets/index.ts` _(new)_ |
| 6 · API Targets | YT-16 | `[x]` | `src/pages/api/youtube/targets/[id].ts` _(new)_ |
| 7 · Components | YT-17 | `[x]` | `src/components/admin/YtRunsTable.astro` _(new)_ |
| 7 · Components | YT-18 | `[x]` | `src/components/admin/YtGapCard.astro` _(new)_ |
| 8 · Pages | YT-19 | `[x]` | `src/pages/admin/youtube/index.astro` _(new)_ |
| 8 · Pages | YT-20 | `[x]` | `src/pages/admin/youtube/targets.astro` _(new)_ |
| 8 · Pages | YT-21 | `[x]` | `src/pages/admin/youtube/run/[id].astro` _(new)_ |
| 9 · Wiring | YT-22 | `[x]` | admin nav component _(modified)_ |
| 9 · Wiring | YT-23 | `[x]` | `src/pages/admin/reddit/index.astro` _(modified)_ |
| 9 · Config | YT-24 | `[x]` | `.env.example` _(modified)_ |
| 9 · Config | YT-25 | `[x]` | `scripts/seed-yt-targets.ts` _(new)_ |
| 10 · Docs | YT-26 | `[x]` | `README.md` _(modified)_ |

**Total: 27 tasks (including YT-00) · 19 new files · 4 modified files**

---

## Execution Order (dependency-aware parallelism)

```
YT-00 (read existing code)
    │
    ▼
[PARALLEL] YT-01, YT-02, YT-03, YT-04  →  npm run db:push
    │
    ▼
[PARALLEL] YT-05, YT-06
    │
    ▼
[PARALLEL] YT-07, YT-08, YT-09         (job control — all depend on YT-06)
[PARALLEL] YT-10, YT-11                (run management — depend on YT-02)
[PARALLEL] YT-12, YT-13, YT-14        (gap review — depend on YT-03, YT-04)
[PARALLEL] YT-15, YT-16               (targets — depend on YT-01)
    │
    ▼
[PARALLEL] YT-17, YT-18               (components — depend on API routes)
    │
    ▼
[PARALLEL] YT-19, YT-20, YT-21        (pages — depend on components)
    │
    ▼
[PARALLEL] YT-22, YT-23, YT-24, YT-25, YT-26
```
