# Reddit WebScraping Pipeline — Full Implementation Plan
## FrinterHero Admin Panel · New Module: Reddit Intelligence (parallel to GEO Monitor)

**Date:** 2026-03-11
**Status:** READY FOR IMPLEMENTATION
**Priority:** HIGH

---

## CRITICAL ARCHITECTURAL NOTE

> **The GEO Monitor is NOT being replaced. It stays exactly as-is and continues to work.**
>
> This document describes a **brand-new, separate admin module**: Reddit Intelligence.
> Both pipelines are independent sources feeding the same downstream stages:
> - **GEO Monitor** → asks: *"Do AI models already know Frinter?"*
> - **Reddit Intelligence** → asks: *"What does my niche actually suffer from?"*
>
> Both produce `contentGaps`. From Stage 2 onward the pipeline is identical —
> the same Gap Analysis, the same Knowledge Base, the same author notes, the same Draft Generator.

---

## 1. EXECUTIVE SUMMARY

Reddit Intelligence is a new admin module that scrapes niche subreddits via Apify, extracts real human pain points using an LLM, and routes approved pain points into the existing `contentGaps` table — the same table that GEO Monitor writes to. From that point, Stage 2 (Gap Analysis + Proposal) and Stage 3 (Draft Generator) run without any modification.

**What changes:**
- New DB tables: `reddit_targets`, `reddit_scrape_runs`, `reddit_posts`, `reddit_extracted_gaps`
- New admin module: `/admin/reddit/`
- New API routes: `/api/reddit/*`
- New job manager: `src/lib/reddit-scrape-job.ts`
- New script: `scripts/reddit-scraper.ts` (DB-integrated version of existing `scrape-reddit.ts`)

**What does NOT change:**
- `geo-job.ts`, `geo-monitor.ts`, all GEO Monitor scripts
- `/admin/content-gaps/` — gaps from Reddit appear here alongside GEO Monitor gaps
- `contentGaps` table schema
- Stage 2: Gap Analysis + Proposal
- Stage 3: Draft Generator (Knowledge Base, author notes, mega-prompt, OpenRouter)
- Article generation audit trail
- Any existing API routes

---

## 2. NICHE ANALYSIS — WHO WE ARE TARGETING AND WHAT HURTS THEM

### 2.1 Frinter Target Audience Profile

Frinter targets **High Performers** — people who:
- Work in intensive knowledge-work mode (founders, premium freelancers, managers, content creators)
- Have ambitious goals but feel the friction between output and personal life
- Want a system, not another todo-list app
- Already understand concepts like Deep Work, Flow State, and Recovery
- Will invest in premium tools when they see ROI

### 2.2 Top Subreddits to Monitor

| Subreddit | Size | Relevance | Dominant pain areas |
|---|---|---|---|
| r/productivity | 2M+ | ★★★★★ | focus, systems, tools |
| r/getdisciplined | 900K+ | ★★★★★ | procrastination, motivation, burnout |
| r/deepwork | 50K+ | ★★★★★ | flow state, distraction, measuring depth |
| r/Entrepreneur | 800K+ | ★★★★☆ | work-life balance, scaling, exhaustion |
| r/selfimprovement | 400K+ | ★★★★☆ | habits, energy, relationships |
| r/nosurf | 100K+ | ★★★★☆ | digital addiction, reclaiming focus |
| r/ADHD | 1M+ | ★★★★☆ | focus, hyperfocus, energy regulation |
| r/biohacking | 200K+ | ★★★☆☆ | sleep, energy, biological optimization |
| r/sleep | 300K+ | ★★★☆☆ | recovery, sleep-performance correlation |
| r/startups | 500K+ | ★★★☆☆ | burnout, priorities, time |
| r/meditation | 200K+ | ★★★☆☆ | inner balance, emotional regulation |
| r/timemanagement | 100K+ | ★★★☆☆ | prioritization, planning |

### 2.3 Niche Pain Point Map

The following categories are **confirmed archetypes** of this audience. Each is a potential `contentGap` and article:

#### CATEGORY: FOCUS & DEEP WORK
- *"I can't get into flow state — I get distracted every 5 minutes"*
- *"Open office / remote work destroys my deep work capacity"*
- *"I'm always context-switching, I never finish anything"*
- *"I don't know how many genuinely productive hours I actually have per day"*
- *"I answer emails and think I'm working but I'm actually accomplishing nothing"*
- *"I keep buying focus apps but none of them work"*

#### CATEGORY: ENERGY & RECOVERY
- *"After lunch I'm useless, I don't know how to fix it"*
- *"I sleep 5 hours because otherwise I can't keep up with work"*
- *"I wake up exhausted even after 8 hours of sleep"*
- *"How do you actually measure recovery? My subjective feeling doesn't match hard data"*
- *"I train hard and it tanks my cognitive performance the next day"*

#### CATEGORY: BURNOUT & OVERWORK
- *"I work 12–14h/day but my output is dropping — how do I fix this?"*
- *"I can't stop working even in the evenings"*
- *"My goal is 10 deep work hours/day but I only hit 2–3"*
- *"I feel guilty when I rest"*
- *"I'm in survival mode, there's no room for actual development"*

#### CATEGORY: RELATIONSHIPS VS WORK
- *"My partner says I'm 'physically present but mentally at work'"*
- *"I'm losing friends because I have no time or mental bandwidth for relationships"*
- *"How do you combine ambitious goals with being a good parent/partner?"*
- *"My relationships are falling apart because I'm obsessively focused on my career"*

#### CATEGORY: MEASUREMENT & SYSTEMS
- *"I've tried Notion, Obsidian, Todoist — I abandon everything after 2 weeks"*
- *"I have no idea whether my productivity system actually works"*
- *"I want data, not another blog post with tips"*
- *"How do you measure not just time, but the quality and depth of work?"*
- *"GTD, Time Blocking, Pomodoro — what actually works for a knowledge worker?"*

#### CATEGORY: TECHNOLOGY & DISTRACTION
- *"My smartphone is permanently damaging my ability to concentrate"*
- *"Notifications are my biggest enemy but I can't turn them off for work"*
- *"Social media: how do you use it professionally without getting addicted?"*
- *"Working remotely = working 24/7, there's no boundary"*

### 2.4 Live Vocabulary to Extract from Scrape

The LLM agent should hunt for and extract **raw phrases** such as:
- "I can't focus", "brain fog", "context switching hell"
- "burned out", "depleted", "running on empty"
- "fake productivity", "busy but not productive"
- "flow state", "deep work", "time blocking doesn't work for me"
- "my relationship is suffering", "I'm always distracted"
- "I track everything but nothing improves"
- "which app actually works", "tried everything"

---

## 3. SYSTEM ARCHITECTURE — OVERVIEW

```
╔═══════════════════════════════════════════════════════════════════╗
║  EXISTING — GEO MONITOR (unchanged, stays exactly as-is)          ║
╠═══════════════════════════════════════════════════════════════════╣
║  46 queries → 3–4 AI models → checks Frinter brand mentions       ║
║  → detects visibility gaps → writes to contentGaps (status='new') ║
╚═══════════════════════════════════════════════════════════════════╝
                              │
                              │ (feeds contentGaps — unchanged)
                              │
╔═══════════════════════════════════════════════════════════════════╗
║  NEW — REDDIT INTELLIGENCE MODULE (parallel source)               ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Admin Panel: "Reddit Intelligence" module                        ║
║  ┌─────────────────────────────────────────────────────────────┐  ║
║  │  Configuration:                                             │  ║
║  │  • Manage subreddit targets (presets + custom)              │  ║
║  │  • Enter niche keywords for search mode                     │  ║
║  │  • Select mode: search_keywords | scrape_subreddit          │  ║
║  │  • Click "Start Scraping Job"                               │  ║
║  └───────────────────────────┬─────────────────────────────────┘  ║
║                              │ POST /api/reddit/start             ║
║  ┌───────────────────────────▼─────────────────────────────────┐  ║
║  │  Backend: reddit-scrape-job.ts (Singleton EventEmitter)     │  ║
║  │  • Spawns: npx tsx scripts/reddit-scraper.ts                │  ║
║  │  • Streams logs via SSE: GET /api/reddit/stream             │  ║
║  │  • Saves results to: reddit_scrape_runs + reddit_posts      │  ║
║  └───────────────────────────┬─────────────────────────────────┘  ║
║                              │                                    ║
║  ┌───────────────────────────▼─────────────────────────────────┐  ║
║  │  scripts/reddit-scraper.ts (DB-integrated, new file)        │  ║
║  │                                                             │  ║
║  │  1. Apify Actor: trudax/reddit-scraper                       │  ║
║  │     • input: searches[] | startUrls[] (subreddit URL)       │  ║
║  │     • sort: "hot" + "new"                                   │  ║
║  │     • time: "month"                                         │  ║
║  │     • maxItems: 50 per target                               │  ║
║  │     • includeComments: true (top 5 comments per post)       │  ║
║  │                                                             │  ║
║  │  2. Raw Posts → DB: INSERT INTO reddit_posts                │  ║
║  │     • title, body, upvotes, url, subreddit, comments[]      │  ║
║  │                                                             │  ║
║  │  3. Batch LLM analysis via OpenRouter (Claude Sonnet):      │  ║
║  │     • Chunk: 10 posts per request                           │  ║
║  │     • Prompt: Pain Point Extraction (see Section 7)         │  ║
║  │     • Output: structured JSON { painPoints[], vocabulary,   │  ║
║  │               articleAngles[], emotionalIntensity }         │  ║
║  │                                                             │  ║
║  │  4. Deduplicate against existing contentGaps                │  ║
║  │                                                             │  ║
║  │  5. INSERT INTO reddit_extracted_gaps (status='pending')    │  ║
║  └───────────────────────────┬─────────────────────────────────┘  ║
║                              │                                    ║
║  Admin Review UI:                                                  ║
║  ┌───────────────────────────▼─────────────────────────────────┐  ║
║  │  List of reddit_extracted_gaps (status='pending')           │  ║
║  │  • Pain point preview + source post examples                │  ║
║  │  • Emotional intensity score (1–10)                         │  ║
║  │  • Frequency count (how many posts mention this pain)       │  ║
║  │  • Action: APPROVE → creates contentGap (status='new')      │  ║
║  │  • Action: REJECT  → status='rejected'                      │  ║
║  └─────────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════════╝
                              │
                              │ (feeds contentGaps — same table as GEO Monitor)
                              ▼
╔═══════════════════════════════════════════════════════════════════╗
║  STAGE 2 · GAP ANALYSIS + PROPOSAL (unchanged)                    ║
╠═══════════════════════════════════════════════════════════════════╣
║  contentGap (status='new') — regardless of source                 ║
║  → Claude reads gap description + KB context                      ║
║  → generates short article proposal (title + angle + headers)     ║
║  → saved as suggestedAngle in DB                                  ║
╚═══════════════════════════════════════════════════════════════════╝
                              │
                              ▼
╔═══════════════════════════════════════════════════════════════════╗
║  STAGE 3 · DRAFT GENERATOR (unchanged + optional enrichment)      ║
╠═══════════════════════════════════════════════════════════════════╣
║  gap + authorNotes + llms-full.txt + Knowledge Base               ║
║  + [OPTIONAL] top 5 Reddit quotes as "Voice of Customer"          ║
║  → 7-section mega-prompt → OpenRouter (model of choice)           ║
║  → full article JSON → validated → saved to DB → published        ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 4. DATABASE CHANGES

### 4.1 New tables to add in `src/db/schema.ts`

These 4 tables are additive — no existing table is modified.

```typescript
// ========================================
// Reddit Intelligence: New WebScraping Module
// ========================================

// Subreddit/keyword target configuration — admin manages this list
export const redditTargets = pgTable('reddit_targets', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 20 }).notNull(), // 'subreddit' | 'keyword_search'
  value: varchar('value', { length: 255 }).notNull(), // 'r/productivity' | 'deep work burnout'
  label: varchar('label', { length: 100 }).notNull(), // display name
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(50), // 0–100, higher = scraped more often
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// One record per scraping job execution
export const redditScrapeRuns = pgTable('reddit_scrape_runs', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('running'), // 'running' | 'completed' | 'failed'
  targetsScraped: text('targets_scraped').array().notNull().default([]),
  postsCollected: integer('posts_collected').notNull().default(0),
  painPointsExtracted: integer('pain_points_extracted').notNull().default(0),
  gapsCreated: integer('gaps_created').notNull().default(0),
  errorMessage: text('error_message'),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});

// Raw posts fetched from Reddit via Apify
export const redditPosts = pgTable('reddit_posts', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => redditScrapeRuns.id),
  redditId: varchar('reddit_id', { length: 20 }).notNull(), // e.g. "t3_xyz123"
  subreddit: varchar('subreddit', { length: 100 }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  url: varchar('url', { length: 500 }),
  upvotes: integer('upvotes').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  topComments: text('top_comments').array().notNull().default([]), // top 5 comments as string[]
  postedAt: timestamp('posted_at'),
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (table) => ({
  scrapeRunIdx: index('idx_reddit_posts_run').on(table.scrapeRunId),
  subredditIdx: index('idx_reddit_posts_subreddit').on(table.subreddit),
  redditIdIdx: index('idx_reddit_posts_reddit_id').on(table.redditId),
}));

// Pain points extracted by LLM from posts — awaiting admin review before becoming contentGaps
export const redditExtractedGaps = pgTable('reddit_extracted_gaps', {
  id: serial('id').primaryKey(),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => redditScrapeRuns.id),

  // AI-extracted fields
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1–10
  frequency: integer('frequency').notNull().default(1), // how many posts mention this
  vocabularyQuotes: text('vocabulary_quotes').array().notNull().default([]), // live phrases
  sourcePostIds: integer('source_post_ids').array().notNull().default([]), // FK to reddit_posts
  suggestedArticleAngle: text('suggested_article_angle'),
  category: varchar('category', { length: 50 }), // 'focus' | 'energy' | 'burnout' | 'relationships' | 'systems' | 'tech'

  // Review workflow status
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),

  // Link to contentGap after approval
  contentGapId: integer('content_gap_id').references(() => contentGaps.id),

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_reddit_gaps_status').on(table.status),
  intensityIdx: index('idx_reddit_gaps_intensity').on(table.emotionalIntensity),
  runIdx: index('idx_reddit_gaps_run').on(table.scrapeRunId),
}));
```

### 4.2 Migration

```bash
npm run db:push
# or: npx drizzle-kit generate && npx drizzle-kit migrate
```

Migration file: `migrations/0001_reddit_intelligence.sql`

---

## 5. NEW SCRIPT: `scripts/reddit-scraper.ts`

This is a new file — a DB-integrated evolution of the existing `scripts/scrape-reddit.ts`.
**The original `scrape-reddit.ts` is kept as a CLI tool for quick manual terminal tests.**

### 5.1 Input (ENV vars passed by job manager)

```
SCRAPE_TARGETS=r/productivity,r/deepwork,deep work burnout
SCRAPE_RUN_ID=42
MAX_ITEMS_PER_TARGET=50
INCLUDE_COMMENTS=true
ANALYSIS_CHUNK_SIZE=10
OPENROUTER_API_KEY=...
APIFY_API_TOKEN=...
DATABASE_URL=...
```

### 5.2 Flow Pseudocode

```typescript
async function run() {
  const targets = parseTargets(process.env.SCRAPE_TARGETS);
  const runId = Number(process.env.SCRAPE_RUN_ID);

  log(`[START] Scraping ${targets.length} targets`);

  let allPosts: RedditPost[] = [];

  for (const target of targets) {
    log(`[APIFY] Scraping: ${target.value}`);

    const input = buildApifyInput(target);
    // - type='subreddit' → startUrls: [{url: 'https://reddit.com/r/productivity'}]
    // - type='keyword'   → searches: [target.value]
    // sort: 'hot', time: 'month', maxItems: 50, includeComments: true

    const run = await apify.actor("trudax/reddit-scraper").call(input);
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    log(`[APIFY] Got ${items.length} posts from ${target.value}`);

    // Deduplicate by redditId (avoid re-importing posts from previous runs)
    const newPosts = items.filter(item => !existingRedditIds.has(item.id));

    // Save raw posts to DB
    await db.insert(redditPosts).values(newPosts.map(mapToDbPost(runId)));
    allPosts.push(...newPosts);

    await updateRunStats(runId, { postsCollected: allPosts.length });
  }

  log(`[ANALYSIS] Analyzing ${allPosts.length} posts in chunks of ${CHUNK_SIZE}`);

  const chunks = chunkArray(allPosts, CHUNK_SIZE);
  const allExtractedGaps: ExtractedGap[] = [];

  for (let i = 0; i < chunks.length; i++) {
    log(`[LLM] Chunk ${i + 1}/${chunks.length}...`);
    const extracted = await analyzePainPoints(chunks[i]);
    allExtractedGaps.push(...extracted);
  }

  log(`[DEDUP] Deduplicating ${allExtractedGaps.length} pain points...`);

  // Deduplicate against existing contentGaps via pg full-text search
  const unique = await deduplicateAgainstExisting(allExtractedGaps);

  // Save to reddit_extracted_gaps — pending admin review
  await db.insert(redditExtractedGaps).values(
    unique.map(gap => ({ ...gap, scrapeRunId: runId, status: 'pending' }))
  );

  await updateRunStats(runId, {
    status: 'completed',
    painPointsExtracted: unique.length,
    finishedAt: new Date(),
  });

  log(`[DONE] Extracted ${unique.length} unique pain points. Awaiting admin review.`);
  process.stdout.write(`RESULT_JSON:${JSON.stringify({ success: true, gapsExtracted: unique.length })}\n`);
}
```

---

## 6. JOB MANAGER: `src/lib/reddit-scrape-job.ts`

Modelled on the existing `src/lib/geo-job.ts`. Architecture is identical — Singleton EventEmitter spawning a child process with SSE-streamed stdout.

### 6.1 Interface

```typescript
interface RedditScrapeJobState {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt: Date | null;
  finishedAt: Date | null;
  exitCode: number | null;
  postsCollected: number;
  painPointsExtracted: number;
  lines: string[];        // max 8,000 entries (same cap as geo-job)
  currentTarget: string | null;
}

class RedditScrapeJob extends EventEmitter {
  start(targets: string[], runId: number): void;
  stop(): void;
  getSnapshot(): RedditScrapeJobState;
  isRunning(): boolean;
}

export const redditScrapeJob = new RedditScrapeJob();
```

### 6.2 Key differences vs geo-job.ts

| | geo-job.ts | reddit-scrape-job.ts |
|---|---|---|
| Child process | `scripts/geo-monitor.ts` | `scripts/reddit-scraper.ts` |
| Progress unit | `queryCount` / `totalSteps` (45) | `postsCollected` + `painPointsExtracted` |
| Env vars | query list inline | `SCRAPE_TARGETS`, `SCRAPE_RUN_ID` |
| Pre-spawn | nothing | `INSERT INTO reddit_scrape_runs` → get `runId` |
| RESULT_JSON | not used | parsed from stdout (like `draft-job.ts`) |

---

## 7. PAIN POINT EXTRACTION PROMPT

### 7.1 System Prompt (per chunk of 10 posts)

```
You are an expert in qualitative UX research and target persona analysis.
You analyze Reddit posts collected from productivity, deep work, and high-performance
subreddits (r/productivity, r/deepwork, r/getdisciplined, etc.).

Your goal: extract unique "pain points" — deeply felt frustrations, blockers, and
problems experienced by people pursuing high performance without burnout.

IMPORTANT CRITERIA:
- Look for EMOTIONALLY CHARGED problems (frustration, helplessness, desperation)
- Prefer problems RECURRING across multiple posts
- Ignore pure technical questions (how to configure X) — focus on life problems
- Preserve the LIVE LANGUAGE of users (direct quotes, phrases, vocabulary)
- Every pain point must have POTENTIAL for a solution-driven article

PRODUCT CONTEXT: Frinter is a WholeBeing platform for High Performers.
It measures and optimizes: Focus Sprints (Frints), energy, relationships, sleep.
Pain points must be RELEVANT to this niche.

RESPONSE FORMAT (JSON only):
{
  "painPoints": [
    {
      "title": "Short pain point name (max 60 chars)",
      "description": "2–3 sentence problem description from the user's perspective",
      "emotionalIntensity": 8,  // 1–10, 10 = crisis/desperation
      "frequency": 3,           // how many posts in this chunk mention it
      "vocabularyQuotes": [     // max 5 direct quotes/phrases
        "I feel like I'm always busy but never productive",
        "can't get into flow no matter what I try"
      ],
      "category": "focus",      // focus | energy | burnout | relationships | systems | tech
      "suggestedAngle": "How to measure QUALITY of work, not just time — Frint Score system"
    }
  ]
}

Return ONLY valid JSON, no markdown, no explanations.
```

### 7.2 User Prompt Template

```
Analyze these ${posts.length} Reddit posts:

${posts.map((p, i) => `
--- POST ${i + 1} [${p.subreddit}] [${p.upvotes} upvotes] ---
TITLE: ${p.title}
BODY: ${p.body?.substring(0, 500) || '(no body)'}
TOP COMMENTS: ${p.topComments.slice(0, 3).join(' | ')}
`).join('\n')}

Extract pain points. Remember: we are looking for deep human frustrations,
not technical questions. Focus on EMOTIONAL and SYSTEMIC problems.
```

### 7.3 Deduplication Logic (on approve)

Before creating a `contentGap` from an approved `redditExtractedGap`, check for similarity:

```typescript
// Simple deduplication — check if a gap with a similar title exists in last 90 days
// Use pg full-text search: plainto_tsquery on contentGaps.gap_title
// If similarity > 70% → flag as potential duplicate, but do NOT block (let admin decide)
```

---

## 8. API ENDPOINTS TO BUILD

### 8.1 New endpoints (all under `/api/reddit/`)

```
POST   /api/reddit/start              → Start scraping job
                                        body: { targets?: string[] }
                                        (defaults to all active redditTargets if omitted)
                                        returns: { runId, status } | 409 if already running

GET    /api/reddit/status             → Current job state snapshot
                                        returns: RedditScrapeJobState

GET    /api/reddit/stream?from=N      → SSE log stream (identical mechanism to /api/geo/stream)

GET    /api/reddit/runs               → Paginated list of historical runs
                                        query: page, limit
                                        returns: { runs[], total }

GET    /api/reddit/runs/[id]          → Single run details + extracted gaps

GET    /api/reddit/gaps               → List reddit_extracted_gaps
                                        query: status (pending|approved|rejected), runId, category
                                        returns: { gaps[], sourcePosts[], total }

POST   /api/reddit/gaps/[id]/approve  → Approve gap → creates contentGap
                                        body: { authorNotes?: string }
                                        effect: INSERT content_gaps + UPDATE reddit_extracted_gaps

POST   /api/reddit/gaps/[id]/reject   → Reject gap
                                        effect: UPDATE SET status='rejected', rejected_at=NOW()

GET    /api/reddit/targets            → List redditTargets
POST   /api/reddit/targets            → Create target
PUT    /api/reddit/targets/[id]       → Update target (toggle isActive, change priority)
DELETE /api/reddit/targets/[id]       → Delete target
```

### 8.2 Approve → contentGap logic

```typescript
// POST /api/reddit/gaps/[id]/approve
async function approveRedditGap(gapId: number, authorNotes?: string) {
  const redditGap = await db.query.redditExtractedGaps.findFirst({ where: eq(id, gapId) });

  // Fetch up to 3 source posts for the gap description
  const sourcePosts = await db.query.redditPosts.findMany({
    where: inArray(id, redditGap.sourcePostIds.slice(0, 3))
  });

  // Create contentGap — identical shape to what GEO Monitor creates
  const [newGap] = await db.insert(contentGaps).values({
    gapTitle: redditGap.painPointTitle,
    gapDescription: [
      redditGap.painPointDescription,
      `\nReddit sources (${redditGap.frequency} posts):`,
      sourcePosts.map(p => `• "${p.title}" [${p.subreddit}]`).join('\n'),
      `\nVoice of customer: ${redditGap.vocabularyQuotes.join(', ')}`,
    ].join('\n'),
    confidenceScore: Math.min(100, redditGap.emotionalIntensity * 10), // 1–10 → 10–100
    suggestedAngle: redditGap.suggestedArticleAngle,
    relatedQueries: redditGap.vocabularyQuotes, // vocabulary used as "related queries"
    sourceModels: ['reddit-apify', 'claude-sonnet'], // identifies Reddit origin
    authorNotes: authorNotes,
    status: 'new',
  }).returning();

  // Update reddit gap record
  await db.update(redditExtractedGaps).set({
    status: 'approved',
    approvedAt: new Date(),
    contentGapId: newGap.id,
  }).where(eq(id, gapId));

  return newGap;
}
```

The resulting `contentGap` appears on `/admin/content-gaps` alongside GEO Monitor gaps.
The only visual distinction is `sourceModels` containing `'reddit-apify'`.

---

## 9. ADMIN PANEL — NEW MODULE UI

### 9.1 File structure

```
src/
├── pages/
│   └── admin/
│       └── reddit/
│           ├── index.astro          → Main Reddit Intelligence dashboard
│           ├── run/[id].astro       → Single run details
│           └── targets.astro        → Subreddit / keyword target management
├── components/
│   └── admin/
│       ├── RedditRunPanel.astro     → Live scraping panel with SSE stream
│       ├── RedditGapCard.astro      → Pain point review card (expand/approve/reject)
│       ├── RedditTargetForm.astro   → Add new target form
│       └── RedditRunsTable.astro    → Historical runs table
```

### 9.2 Page layout `/admin/reddit/` — Wire Spec

```
┌─────────────────────────────────────────────────────────────────┐
│  REDDIT INTELLIGENCE                                    [Admin]  │
│  Pain Point Discovery · Niche WebScraping via Apify              │
├─────────────────────────────────────────────────────────────────┤
│  STATS BAR                                                       │
│  [Pending Review: 12] [Approved: 8] [Gaps Created: 8] [Runs: 3]│
├─────────────────┬───────────────────────────────────────────────┤
│  LEFT SIDEBAR   │  MAIN CONTENT AREA                            │
│  (300px)        │                                               │
│                 │  [Tabs: PENDING (12) | APPROVED | REJECTED]   │
│  TARGETS        │                                               │
│  ─────────────  │  PAIN POINT CARDS (sorted by intensity DESC): │
│  ☑ r/productivity│                                              │
│  ☑ r/deepwork   │  ┌───────────────────────────────────────┐   │
│  ☑ r/getdisc.   │  │  Intensity: 8/10  |  category: focus  │   │
│  ☑ deep work    │  │  "Always busy, never productive"       │   │
│  ☑ burnout HP   │  │  Frequency: 7 posts · Run: #3         │   │
│  [+ Add Target] │  │  [Expand] [APPROVE] [REJECT]           │   │
│                 │  └───────────────────────────────────────┘   │
│  [START         │                                               │
│   SCRAPING JOB] │  ┌───────────────────────────────────────┐   │
│                 │  │  Intensity: 7/10  |  category: energy  │  │
│  ─────────────  │  │  "Useless after lunch every day"       │   │
│  Last Run:      │  │  Frequency: 5 posts · Run: #3         │   │
│  #3 · 2h ago    │  │  [Expand] [APPROVE] [REJECT]           │   │
│  47 posts       │  └───────────────────────────────────────┘   │
│  9 pain points  │                                               │
│                 │  ── EXPANDED STATE (after clicking Expand) ── │
│  RUNS HISTORY   │  ┌───────────────────────────────────────┐   │
│  #3 · 2h ago    │  │  FULL PAIN POINT DESCRIPTION           │   │
│  #2 · 3d ago    │  │                                        │   │
│  #1 · 1w ago    │  │  SOURCE POSTS:                         │   │
│                 │  │  • "I work 12h but feel nothing done"  │   │
│                 │  │    r/productivity · 234 upvotes        │   │
│                 │  │  • "Energy crashes every afternoon"    │   │
│                 │  │    r/biohacking · 178 upvotes          │   │
│                 │  │                                        │   │
│                 │  │  LIVE VOCABULARY:                      │   │
│                 │  │  "afternoon slump" · "brain fog"       │   │
│                 │  │  "running on caffeine" · "depleted"    │   │
│                 │  │                                        │   │
│                 │  │  SUGGESTED ARTICLE ANGLE:              │   │
│                 │  │  "How to fix the afternoon energy      │   │
│                 │  │   crash — Frint Energy Protocol"       │   │
│                 │  │                                        │   │
│                 │  │  Author notes:                         │   │
│                 │  │  [textarea — same as GapExpandedCard]  │   │
│                 │  │                                        │   │
│                 │  │  [APPROVE → Create Gap]  [REJECT]      │   │
│                 │  └───────────────────────────────────────┘   │
├─────────────────┴───────────────────────────────────────────────┤
│  LIVE LOG (shown while job runs — same SSE console as GEO Monitor│
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [START] Scraping 5 targets...                            │  │
│  │ [APIFY] r/productivity → 48 posts fetched               │  │
│  │ [LLM] Chunk 2/5... → 3 pain points extracted            │  │
│  │ [DEDUP] 2 unique (1 duplicate skipped)                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Admin Index — navigation changes

In `/src/pages/admin/index.astro`, add a new hub card **alongside the existing GEO Monitor panel** (not replacing it):

```html
<!-- NEW card alongside existing GEO Monitor -->
<a href="/admin/reddit" class="hub-card reddit-card">
  <div class="hub-icon">🎯</div>
  <div class="hub-title">Reddit Intelligence</div>
  <div class="hub-desc">Pain Point Discovery · WebScraping</div>
  <div class="hub-badge">{pendingCount} pending review</div>
</a>
```

---

## 10. INTEGRATION WITH STAGE 2 AND STAGE 3

### 10.1 Stage 2 — Gap Analysis (minimal change)

A `contentGap` created via Reddit approval is **structurally identical** to one created by GEO Monitor. The pipeline processes it the same way.

The only distinguishable field is `sourceModels` which contains `['reddit-apify', 'claude-sonnet']` instead of AI model names. This can optionally be surfaced in the UI as a "Reddit source" badge on the gap card.

Optional context hint in the Gap Analysis prompt:
```typescript
// In gap analysis script or prompt builder:
// If gap.sourceModels.includes('reddit-apify'):
//   prefix: "This gap originates from real Reddit pain points."
//   use gap.relatedQueries (vocabulary quotes) as seed terms for the proposal
```

### 10.2 Stage 3 — Draft Generator (optional enrichment)

When a gap originated from Reddit, the draft mega-prompt can include a **Voice of Customer** section:

```typescript
// In scripts/draft-bridge.ts or mega-prompt builder:
const redditGap = await db.query.redditExtractedGaps.findFirst({
  where: eq(contentGapId, gapId)
});

const voiceOfCustomer = redditGap?.vocabularyQuotes?.slice(0, 5) || [];

// If voiceOfCustomer.length > 0, append to mega-prompt:
// === VOICE OF CUSTOMER (Reddit) ===
// Real words from niche users — use these phrases naturally in the article:
// • "brain fog every afternoon"
// • "I track hours but not depth"
// • "running on empty by Wednesday"
```

This is **optional** — the draft pipeline works without it.

---

## 11. TODO LIST FOR AUTONOMOUS AGENTS

### AGENT: Database Schema

```
TASK DB-01: Add 4 new tables to src/db/schema.ts
  FILE: src/db/schema.ts
  ACTION: append after existing tables (redditTargets, redditScrapeRuns,
          redditPosts, redditExtractedGaps)
  REFERENCE: Section 4.1 of this document
  NOTE: Do NOT modify any existing table
  VALIDATE: TypeScript compiles clean, all FK references resolve

TASK DB-02: Generate Drizzle migration
  COMMAND: npx drizzle-kit generate
  FILE: migrations/0001_reddit_intelligence.sql (or next sequential number)
  VALIDATE: SQL file contains CREATE TABLE for all 4 new tables

TASK DB-03: Seed default redditTargets
  FILE: scripts/seed-reddit-targets.ts (new file)
  CONTENT: INSERT default targets:
    { type: 'subreddit', value: 'r/productivity',    label: 'r/productivity',    priority: 90 }
    { type: 'subreddit', value: 'r/deepwork',        label: 'r/deepwork',        priority: 95 }
    { type: 'subreddit', value: 'r/getdisciplined',  label: 'r/getdisciplined',  priority: 85 }
    { type: 'subreddit', value: 'r/Entrepreneur',    label: 'r/Entrepreneur',    priority: 70 }
    { type: 'subreddit', value: 'r/nosurf',          label: 'r/nosurf',          priority: 60 }
    { type: 'keyword_search', value: 'deep work burnout',              label: 'Deep Work Burnout', priority: 80 }
    { type: 'keyword_search', value: 'focus productivity system',      label: 'Focus System',      priority: 75 }
    { type: 'keyword_search', value: 'high performer work life balance', label: 'HP Work-Life',    priority: 70 }
  COMMAND: npx tsx scripts/seed-reddit-targets.ts
```

### AGENT: Backend Scripts

```
TASK BE-01: Create scripts/reddit-scraper.ts
  REFERENCE: Section 5 of this document
  BASE: Use scripts/scrape-reddit.ts as the starting point for Apify + OpenRouter setup
  NOTE: scrape-reddit.ts stays unchanged — this is a new file
  KEY ADDITIONS vs scrape-reddit.ts:
    1. Input via ENV vars (not argv): SCRAPE_TARGETS, SCRAPE_RUN_ID
    2. Save raw posts to DB: INSERT INTO reddit_posts
    3. Chunked LLM analysis (10 posts/chunk) using prompt from Section 7
    4. Parse LLM response as JSON (with try/catch + fallback to empty array)
    5. Deduplicate against existing contentGaps (pg full-text plainto_tsquery)
    6. INSERT INTO reddit_extracted_gaps (status='pending')
    7. UPDATE reddit_scrape_runs stats at end
    8. Write RESULT_JSON: to stdout on completion
  ENV LOADING: dotenv.config({ path: '.env.local' }) — same as existing script

TASK BE-02: Create src/lib/reddit-scrape-job.ts
  REFERENCE: Section 6 of this document
  BASE: Copy src/lib/geo-job.ts as structural template
  KEY CHANGES:
    1. Before spawning: INSERT INTO reddit_scrape_runs → capture runId
    2. Env vars passed to child: SCRAPE_TARGETS, SCRAPE_RUN_ID
    3. Progress fields: postsCollected, painPointsExtracted (instead of queryCount)
    4. Parse RESULT_JSON: from stdout (same as draft-job.ts)
    5. Export singleton: export const redditScrapeJob = new RedditScrapeJob()
```

### AGENT: API Routes

```
TASK API-01: POST /api/reddit/start
  FILE: src/pages/api/reddit/start.ts
  LOGIC:
    - Auth check (session cookie — same pattern as other protected routes)
    - if redditScrapeJob.isRunning() → return 409 { error: 'Job already running' }
    - Parse body: { targets?: string[] }
    - If no targets: SELECT value FROM reddit_targets WHERE is_active=true
    - INSERT INTO reddit_scrape_runs (status='running') → get runId
    - redditScrapeJob.start(targets, runId)
    - return 200 { runId, status: 'started' }

TASK API-02: GET /api/reddit/status
  FILE: src/pages/api/reddit/status.ts
  LOGIC: Auth check + return redditScrapeJob.getSnapshot()

TASK API-03: GET /api/reddit/stream
  FILE: src/pages/api/reddit/stream.ts
  LOGIC: Identical SSE mechanism as src/pages/api/geo/stream.ts
         Replace geo-job import with reddit-scrape-job

TASK API-04: GET /api/reddit/runs
  FILE: src/pages/api/reddit/runs/index.ts
  LOGIC: Auth + SELECT FROM reddit_scrape_runs ORDER BY run_at DESC, paginated

TASK API-05: GET /api/reddit/gaps
  FILE: src/pages/api/reddit/gaps/index.ts
  LOGIC:
    - Auth check
    - Query params: status (default 'pending'), runId, category, page (default 1)
    - SELECT FROM reddit_extracted_gaps
    - For each gap: fetch sourcePosts (max 3) from reddit_posts by sourcePostIds
    - Sort: emotional_intensity DESC, created_at DESC
    - Return: { gaps[], total }

TASK API-06: POST /api/reddit/gaps/[id]/approve
  FILE: src/pages/api/reddit/gaps/[id]/approve.ts
  LOGIC: See Section 8.2 — approve logic → creates contentGap

TASK API-07: POST /api/reddit/gaps/[id]/reject
  FILE: src/pages/api/reddit/gaps/[id]/reject.ts
  LOGIC: Auth + UPDATE reddit_extracted_gaps SET status='rejected', rejected_at=NOW()

TASK API-08: CRUD /api/reddit/targets
  FILES:
    src/pages/api/reddit/targets/index.ts  → GET (list) + POST (create)
    src/pages/api/reddit/targets/[id].ts   → PUT (update isActive/priority) + DELETE
```

### AGENT: Frontend — Pages & Components

```
TASK FE-01: Create src/components/admin/RedditGapCard.astro
  REFERENCE: Section 9.2 (expanded card wire spec)
  PROPS: gap (RedditExtractedGap + sourcePosts[]), expanded (boolean)
  COLLAPSED STATE:
    - Left: intensity badge (color-coded 1–10), category chip
    - Title: painPointTitle
    - Meta: "X posts · subreddits · Run #N"
    - Actions: [Expand] [APPROVE] [REJECT]
  EXPANDED STATE:
    - painPointDescription (full text)
    - sourcePosts list (max 3: title, subreddit, upvotes as link)
    - vocabularyQuotes (rendered as chips/tags)
    - suggestedArticleAngle (highlighted block)
    - authorNotes textarea (same UX as GapExpandedCard.astro)
    - [APPROVE → Create Gap] [REJECT] buttons
  STYLE: consistent with existing GapCard.astro + GapExpandedCard.astro (dark tailwind)

TASK FE-02: Create src/components/admin/RedditRunPanel.astro
  PROPS: none (fetches state via JS)
  CONTENT:
    - Target checklist: active redditTargets as checkboxes
    - [START SCRAPING JOB] button
    - Live log console: SSE stream (copy SSE logic from admin/index.astro GEO Monitor section)
    - Progress counters: "X posts collected · Y pain points found"
    - Reconnect logic on SSE drop (same as GEO Monitor)
  ENDPOINTS USED: /api/reddit/start, /api/reddit/stream, /api/reddit/status

TASK FE-03: Create src/components/admin/RedditRunsTable.astro
  PROPS: runs[]
  COLUMNS: Run #, Date, Targets, Posts, Pain Points, Gaps Created, Status, [Details]
  STYLE: same as GeoRunsTable.astro

TASK FE-04: Create src/pages/admin/reddit/index.astro
  REFERENCE: Section 9.2 (full layout wire spec)
  STRUCTURE:
    - Stats bar (pending/approved/created counts)
    - Two-column layout: sidebar (RedditRunPanel + RunsTable) + main (gap cards)
    - Tabs: Pending | Approved | Rejected
    - Category filter: all | focus | energy | burnout | relationships | systems | tech
    - Sort: intensity | frequency | newest
    - JavaScript: expand/collapse, approve/reject fetch calls, SSE integration
  DATA FETCHING: server-side via /api/reddit/gaps + /api/reddit/runs

TASK FE-05: Create src/pages/admin/reddit/targets.astro
  CONTENT:
    - Table of all targets with toggle isActive switch + priority field
    - "Add Target" form: type select (subreddit/keyword) + value + label + priority slider
    - Quick-add preset buttons (from Section 2.2 subreddit list)

TASK FE-06: Update src/pages/admin/index.astro
  ACTION: Add "Reddit Intelligence" hub card in the Hub Navigation section
  PLACEMENT: Alongside (not replacing) existing GEO Monitor section
  STYLE: Red accent color (pain points signal = urgent red)
  BADGE: Dynamic count of pending reddit_extracted_gaps
  LINK: href="/admin/reddit"
```

### AGENT: Package Scripts

```
TASK PKG-01: Add scripts to package.json
  "scrape:reddit:run": "npx tsx scripts/reddit-scraper.ts"
  "reddit:seed": "npx tsx scripts/seed-reddit-targets.ts"
```

### AGENT: Documentation

```
TASK DOC-01: Update /docs_private/geo-monitor-flow.md
  ACTION: Add a section "Parallel Source: Reddit Intelligence"
  CONTENT: Short description + note that both sources feed contentGaps identically
  LINK: Reference this document

TASK DOC-02: Create /docs_private/reddit-scraping-guide.md
  CONTENT:
    - How to add a new subreddit or keyword target
    - How to interpret emotional intensity scores
    - When to approve vs reject a pain point
    - How the approve action maps to contentGap fields
    - Cost estimates (Apify + OpenRouter per run)
```

---

## 12. IMPLEMENTATION ORDER (for agents)

```
SPRINT 1 — Foundation (no UI dependency):
  1. DB-01: Schema — 4 new tables
  2. DB-02: Migration
  3. BE-01: scripts/reddit-scraper.ts
  4. BE-02: src/lib/reddit-scrape-job.ts
  5. PKG-01: package.json scripts

SPRINT 2 — API Layer:
  6. API-01: POST /api/reddit/start
  7. API-02: GET /api/reddit/status
  8. API-03: GET /api/reddit/stream (SSE)
  9. API-05: GET /api/reddit/gaps
  10. API-06: POST /api/reddit/gaps/[id]/approve
  11. API-07: POST /api/reddit/gaps/[id]/reject
  12. API-08: CRUD /api/reddit/targets

SPRINT 3 — Frontend:
  13. FE-01: RedditGapCard.astro
  14. FE-02: RedditRunPanel.astro
  15. FE-03: RedditRunsTable.astro
  16. FE-04: /admin/reddit/index.astro (main page)
  17. FE-06: Hub card in admin/index.astro

SPRINT 4 — Optional / Polish:
  18. FE-05: /admin/reddit/targets.astro
  19. API-04: GET /api/reddit/runs history
  20. DB-03: Seed default targets
  21. Stage 3 enrichment: Voice of Customer in draft mega-prompt
```

---

## 13. ACCEPTANCE CRITERIA

### Scraping Job

- [ ] Admin can click "Start Scraping" and select which targets to include
- [ ] Logs stream live via SSE (identical UX to GEO Monitor console)
- [ ] After completion: posts saved to `reddit_posts`, pain points to `reddit_extracted_gaps`
- [ ] Deduplication: no duplicate pain points vs existing `content_gaps`
- [ ] Run status (`completed`/`failed`) recorded in `reddit_scrape_runs`
- [ ] Apify error does not crash the app — caught, logged, status set to `failed`

### Admin Review

- [ ] Pending gaps list sorted by emotional intensity DESC
- [ ] Expanding a card shows: full description, source posts, vocabulary chips
- [ ] Approve action creates a `contentGap` with status=`new`
- [ ] New `contentGap` appears on `/admin/content-gaps` alongside GEO Monitor gaps
- [ ] Stage 2 and Stage 3 work without modification for Reddit-sourced gaps
- [ ] Author notes entered at approve time are preserved in `contentGap.authorNotes`

### Configuration

- [ ] Admin can add/deactivate/delete subreddit and keyword targets
- [ ] Toggle active state without deleting the target record
- [ ] Default 8 targets available after seed script

### Coexistence with GEO Monitor

- [ ] GEO Monitor continues to function exactly as before — zero regressions
- [ ] Both modules appear as separate hub cards in admin dashboard
- [ ] Content Gaps page shows gaps from both sources without distinction issues

---

## 14. ENVIRONMENT VARIABLES — ADDITIONS

`.env.local` — existing + new optional vars:

```bash
# Already required (unchanged):
APIFY_API_TOKEN=your_apify_token
OPENROUTER_API_KEY=your_openrouter_key
DATABASE_URL=your_db_url

# New (all optional — have defaults):
REDDIT_MAX_ITEMS_PER_TARGET=50
REDDIT_CHUNK_SIZE=10
REDDIT_ANALYSIS_MODEL=anthropic/claude-3.5-sonnet
```

---

## 15. TECHNICAL NOTES

### Apify Actor — selection

Existing `scrape-reddit.ts` uses `apify/reddit-scraper`. If issues arise (404, rate limit):
- **Alternative 1:** `trudax/reddit-scraper-lite` — faster, fewer features
- **Alternative 2:** `apify/reddit-scraper-new` — newer version
- **Fallback:** Use `startUrls` (direct subreddit URLs) instead of `searches`

For subreddit mode: `startUrls: [{ url: 'https://www.reddit.com/r/productivity/' }]`
For keyword mode: `searches: ['deep work burnout']`

### Cost Estimates

- Apify free tier: $5 credit/month
- 50 posts × 5 targets = 250 posts per run ≈ $0.05/run
- Claude Sonnet via OpenRouter: 25 chunks × ~800 tokens = ~20K tokens ≈ $0.006/run
- **Total per run: ~$0.06** — safe to run daily

### Existing `scripts/scrape-reddit.ts`

This file **stays as-is** — it remains a useful CLI tool for quick manual tests:
```bash
npm run scrape:reddit "deep work burnout"
```

The new `scripts/reddit-scraper.ts` is the DB-integrated version for the admin panel pipeline.

### `sourceModels` field convention for Reddit gaps

When a `contentGap` originates from Reddit Intelligence, it is identified via:
```
sourceModels: ['reddit-apify', 'claude-sonnet']
```
This allows the Content Gaps UI to optionally show a Reddit source badge,
and allows the draft prompt builder to inject Voice of Customer context.

---

---

## 16. ATOMIC TASK LIST

> Every task below is **self-contained and independently executable**.
> Each has: a single file target, a concrete action, and a binary done condition.
> Tasks are sequenced so each depends only on tasks before it.
> Status legend: `[ ]` = todo · `[~]` = in progress · `[x]` = done

---

### SPRINT 1 — Database & Foundation

#### S1-T01 · Add `redditTargets` table to schema
- **File:** `src/db/schema.ts`
- **Action:** Append `redditTargets` pgTable definition (id, type, value, label, isActive, priority, lastScrapedAt, createdAt)
- **Imports needed:** none new — all types already imported
- **Done when:** `npx tsc --noEmit` passes with no errors on schema.ts

- [x] S1-T01

#### S1-T02 · Add `redditScrapeRuns` table to schema
- **File:** `src/db/schema.ts`
- **Action:** Append `redditScrapeRuns` pgTable (id, runAt, status, targetsScraped, postsCollected, painPointsExtracted, gapsCreated, errorMessage, finishedAt, durationMs)
- **Done when:** tsc clean

- [x] S1-T02

#### S1-T03 · Add `redditPosts` table to schema
- **File:** `src/db/schema.ts`
- **Action:** Append `redditPosts` pgTable with 3 indexes (scrapeRunId, subreddit, redditId). FK references `redditScrapeRuns.id`
- **Done when:** tsc clean, FK reference resolves

- [x] S1-T03

#### S1-T04 · Add `redditExtractedGaps` table to schema
- **File:** `src/db/schema.ts`
- **Action:** Append `redditExtractedGaps` pgTable with 3 indexes. FK references `redditScrapeRuns.id` and `contentGaps.id`
- **Done when:** tsc clean, both FK references resolve

- [x] S1-T04

#### S1-T05 · Generate Drizzle migration
- **Command:** `npx drizzle-kit generate`
- **Expected output:** new file in `migrations/` (e.g. `0001_reddit_intelligence.sql`)
- **Done when:** migration file exists and contains `CREATE TABLE reddit_targets`, `reddit_scrape_runs`, `reddit_posts`, `reddit_extracted_gaps`

- [x] S1-T05

#### S1-T06 · Run migration against database
- **Command:** `npm run db:push` (or `npx drizzle-kit migrate`)
- **Done when:** command exits 0, all 4 tables exist in DB (`\dt` in psql confirms)

- [x] S1-T06

#### S1-T07 · Create seed script file
- **File:** `scripts/seed-reddit-targets.ts` (new file)
- **Action:** Create script that connects to DB via `src/db/client.ts` and inserts the 8 default `redditTargets` rows defined in Section 11 (DB-03)
- **Done when:** file exists, `npx tsx scripts/seed-reddit-targets.ts` exits 0 and inserts 8 rows

- [x] S1-T07

#### S1-T08 · Add npm scripts to package.json
- **File:** `package.json`
- **Action:** Add two entries to `"scripts"`:
  - `"scrape:reddit:run": "npx tsx scripts/reddit-scraper.ts"`
  - `"reddit:seed": "npx tsx scripts/seed-reddit-targets.ts"`
- **Done when:** `npm run reddit:seed` executes the seed script

- [x] S1-T08

---

### SPRINT 2 — Core Backend Script

#### S2-T01 · Scaffold `scripts/reddit-scraper.ts` with ENV parsing
- **File:** `scripts/reddit-scraper.ts` (new file)
- **Action:** Create file with dotenv loading (`.env.local`), ENV var parsing (`SCRAPE_TARGETS`, `SCRAPE_RUN_ID`, `MAX_ITEMS_PER_TARGET`, `CHUNK_SIZE`, `REDDIT_ANALYSIS_MODEL`), and a `run()` function stub that logs `[START]` and exits
- **Done when:** `SCRAPE_TARGETS=r/productivity SCRAPE_RUN_ID=1 npx tsx scripts/reddit-scraper.ts` runs without crash

- [x] S2-T01

#### S2-T02 · Implement `buildApifyInput(target)` helper
- **File:** `scripts/reddit-scraper.ts`
- **Action:** Add function that maps a target object to Apify actor input:
  - `type='subreddit'` → `{ startUrls: [{ url: 'https://www.reddit.com/r/NAME/' }], sort: 'hot', time: 'month', maxItems: 50 }`
  - `type='keyword_search'` → `{ searches: [value], sort: 'new', time: 'month', maxItems: 50 }`
  - Always include: `proxy: { useApifyProxy: true }`, `includeComments: true`, `maxComments: 5`
- **Done when:** unit-testable function with two cases, no runtime calls

- [x] S2-T02

#### S2-T03 · Implement Apify scraping loop
- **File:** `scripts/reddit-scraper.ts`
- **Action:** In `run()`, iterate over parsed targets, call `apify.actor("apify/reddit-scraper").call(input)`, fetch items from dataset, log count per target
- **Error handling:** wrap each target in try/catch — failure on one target continues to next, logs `[WARN]`
- **Done when:** running with a real APIFY_API_TOKEN fetches posts and logs them to stdout

- [x] S2-T03

#### S2-T04 · Implement raw post deduplication by redditId
- **File:** `scripts/reddit-scraper.ts`
- **Action:** Before inserting posts, query `reddit_posts` for existing `redditId` values in the current batch. Filter out already-stored posts.
- **Done when:** running the same target twice does not insert duplicate rows

- [x] S2-T04

#### S2-T05 · Implement `INSERT INTO reddit_posts`
- **File:** `scripts/reddit-scraper.ts`
- **Action:** After Apify returns items, map each to the `redditPosts` schema shape and batch-insert via Drizzle. Update `postsCollected` counter in `reddit_scrape_runs` after each target.
- **Field mapping:**
  - `item.id` → `redditId`
  - `item.title || item.parsedTitle` → `title`
  - `item.text || item.body || item.content` → `body`
  - `item.upvotes || item.score` → `upvotes`
  - `item.url` → `url`
  - `item.subreddit` → `subreddit`
  - top 5 comment bodies → `topComments[]`
  - `item.createdAt` → `postedAt`
- **Done when:** after a real run, `SELECT count(*) FROM reddit_posts` increases

- [x] S2-T05

#### S2-T06 · Implement `chunkArray` utility and LLM call wrapper
- **File:** `scripts/reddit-scraper.ts`
- **Action:**
  - Add `chunkArray<T>(arr: T[], size: number): T[][]` helper
  - Add `analyzePainPoints(posts: RedditPost[]): Promise<ExtractedGap[]>` that calls OpenRouter with the system + user prompt from Section 7
  - Parse response as JSON, validate shape, return empty array on parse failure (log `[WARN]`)
- **Done when:** `analyzePainPoints` with 10 mock posts returns valid `ExtractedGap[]` array

- [x] S2-T06

#### S2-T07 · Implement pain point deduplication against `contentGaps`
- **File:** `scripts/reddit-scraper.ts`
- **Action:** Add `deduplicateAgainstExisting(gaps: ExtractedGap[]): Promise<ExtractedGap[]>` that for each extracted gap runs a pg full-text query:
  ```sql
  SELECT id FROM content_gaps
  WHERE to_tsvector('english', gap_title) @@ plainto_tsquery('english', $title)
  AND created_at > NOW() - INTERVAL '90 days'
  ```
  Filter out gaps where a match is found. Log `[DEDUP] Skipped: {title}` for each.
- **Done when:** a gap with an identical title to an existing `contentGap` is not inserted

- [x] S2-T07

#### S2-T08 · Implement `INSERT INTO reddit_extracted_gaps`
- **File:** `scripts/reddit-scraper.ts`
- **Action:** After deduplication, batch-insert unique gaps into `reddit_extracted_gaps` with `status='pending'` and `scrapeRunId`
- **Done when:** after a real run, `SELECT count(*) FROM reddit_extracted_gaps WHERE status='pending'` increases

- [x] S2-T08

#### S2-T09 · Implement run stats update and `RESULT_JSON` stdout
- **File:** `scripts/reddit-scraper.ts`
- **Action:**
  - On success: `UPDATE reddit_scrape_runs SET status='completed', finished_at=NOW(), duration_ms=..., pain_points_extracted=N`
  - On unhandled error: `UPDATE reddit_scrape_runs SET status='failed', error_message=err.message`
  - Final line: `process.stdout.write('RESULT_JSON:' + JSON.stringify({ success: true, gapsExtracted: N }) + '\n')`
- **Done when:** stdout contains `RESULT_JSON:` line on successful run

- [x] S2-T09

---

### SPRINT 3 — Job Manager

#### S3-T01 · Create `src/lib/reddit-scrape-job.ts` with state interface
- **File:** `src/lib/reddit-scrape-job.ts` (new file)
- **Action:** Copy structure from `src/lib/geo-job.ts`. Define `RedditScrapeJobState` interface (status, startedAt, finishedAt, exitCode, postsCollected, painPointsExtracted, lines[], currentTarget). Initialize `_state` with all nulls/zeros/idle.
- **Done when:** file compiles, no runtime behavior yet

- [x] S3-T01

#### S3-T02 · Implement `start(targets, runId)` method
- **File:** `src/lib/reddit-scrape-job.ts`
- **Action:**
  - Guard: if `isRunning()` throw `Error('Already running')`
  - Spawn: `child = spawn('npx', ['tsx', 'scripts/reddit-scraper.ts'], { env: { ...process.env, SCRAPE_TARGETS: targets.join(','), SCRAPE_RUN_ID: String(runId) } })`
  - Pipe stdout line-by-line into `_state.lines[]` (max 8,000), emit `'line'` event
  - Parse lines for `postsCollected:N` and `painPointsExtracted:N` patterns to update counters
  - On `RESULT_JSON:` line: parse and store result
  - On process `close`: set status to `'done'` or `'error'`, emit `'done'`
- **Done when:** `redditScrapeJob.start(['r/productivity'], 1)` spawns the child process and lines flow in

- [x] S3-T02

#### S3-T03 · Implement `getSnapshot()` and `isRunning()`
- **File:** `src/lib/reddit-scrape-job.ts`
- **Action:**
  - `isRunning()`: returns `_state.status === 'running'`
  - `getSnapshot()`: returns deep clone of `_state` (spread `{ ..._state, lines: [..._state.lines] }`)
- **Done when:** can call both methods without mutation side effects

- [x] S3-T03

#### S3-T04 · Export singleton
- **File:** `src/lib/reddit-scrape-job.ts`
- **Action:** Add `export const redditScrapeJob = new RedditScrapeJob()` at bottom of file
- **Done when:** other modules can `import { redditScrapeJob } from '../lib/reddit-scrape-job'` without error

- [x] S3-T04

---

### SPRINT 4 — API Routes

#### S4-T01 · Create `src/pages/api/reddit/start.ts`
- **File:** `src/pages/api/reddit/start.ts` (new file, create directory)
- **Action:**
  - `POST` handler only
  - Auth check: `cookies.get('session')?.value` → validate in `sessions` table → 401 if invalid
  - If `redditScrapeJob.isRunning()` → return `Response.json({ error: 'Job already running' }, { status: 409 })`
  - Parse body: `{ targets?: string[] }`
  - If no targets: `SELECT value FROM reddit_targets WHERE is_active = true`
  - `INSERT INTO reddit_scrape_runs (status='running', targets_scraped=targets)` → get `runId`
  - `redditScrapeJob.start(targets, runId)`
  - Return `200 { runId, status: 'started', targetsCount: targets.length }`
- **Done when:** `curl -X POST /api/reddit/start` (with valid session) returns `{ runId, status: 'started' }`

- [x] S4-T01

#### S4-T02 · Create `src/pages/api/reddit/status.ts`
- **File:** `src/pages/api/reddit/status.ts` (new file)
- **Action:**
  - `GET` handler only
  - Auth check
  - Return `Response.json(redditScrapeJob.getSnapshot())`
- **Done when:** returns job state JSON

- [x] S4-T02

#### S4-T03 · Create `src/pages/api/reddit/stream.ts` (SSE)
- **File:** `src/pages/api/reddit/stream.ts` (new file)
- **Action:** Copy `src/pages/api/geo/stream.ts` verbatim. Replace every import/reference of `geoJob` with `redditScrapeJob`. Keep SSE protocol identical (`data:`, `event: done`, `from=N` catch-up).
- **Done when:** SSE stream emits lines from a running reddit scrape job

- [x] S4-T03

#### S4-T04 · Create `src/pages/api/reddit/runs/index.ts`
- **File:** `src/pages/api/reddit/runs/index.ts` (new file)
- **Action:**
  - `GET` handler, auth check
  - Query params: `page` (default 1), `limit` (default 10)
  - `SELECT * FROM reddit_scrape_runs ORDER BY run_at DESC LIMIT limit OFFSET (page-1)*limit`
  - Also `SELECT count(*) FROM reddit_scrape_runs` for total
  - Return `{ runs[], total, page, limit }`
- **Done when:** returns paginated list of runs

- [x] S4-T04

#### S4-T05 · Create `src/pages/api/reddit/gaps/index.ts`
- **File:** `src/pages/api/reddit/gaps/index.ts` (new file)
- **Action:**
  - `GET` handler, auth check
  - Query params: `status` (default `'pending'`), `runId`, `category`, `page` (default 1)
  - Build WHERE clause from params
  - For each gap: fetch up to 3 source posts from `reddit_posts` using `sourcePostIds` array
  - Sort: `emotional_intensity DESC, created_at DESC`
  - Return `{ gaps: (gap + sourcePosts[])[], total }`
- **Done when:** returns pending gaps with embedded source post previews

- [x] S4-T05

#### S4-T06 · Create `src/pages/api/reddit/gaps/[id]/approve.ts`
- **File:** `src/pages/api/reddit/gaps/[id]/approve.ts` (new file, create directory)
- **Action:** Implement full approve → contentGap logic from Section 8.2:
  1. Auth check
  2. Fetch `redditExtractedGap` by id — 404 if not found
  3. Validate `status === 'pending'` — 400 if already processed
  4. Fetch up to 3 source posts
  5. `INSERT INTO content_gaps` with mapped fields (see Section 8.2 for exact mapping)
  6. `UPDATE reddit_extracted_gaps SET status='approved', approved_at=NOW(), content_gap_id=newGap.id`
  7. Return `200 { contentGapId: newGap.id }`
- **Done when:** approved gap appears in `/admin/content-gaps`

- [x] S4-T06

#### S4-T07 · Create `src/pages/api/reddit/gaps/[id]/reject.ts`
- **File:** `src/pages/api/reddit/gaps/[id]/reject.ts` (new file)
- **Action:**
  - `POST` handler, auth check
  - Fetch gap by id — 404 if not found
  - `UPDATE SET status='rejected', rejected_at=NOW()`
  - Return `200 { ok: true }`
- **Done when:** rejected gap no longer appears in pending list

- [x] S4-T07

#### S4-T08 · Create `src/pages/api/reddit/targets/index.ts` (GET + POST)
- **File:** `src/pages/api/reddit/targets/index.ts` (new file)
- **GET action:** Auth + `SELECT * FROM reddit_targets ORDER BY priority DESC`
- **POST action:** Auth + parse body `{ type, value, label, priority?, isActive? }` + validate + `INSERT INTO reddit_targets` + return created row
- **Validation:** `type` must be `'subreddit'` or `'keyword_search'`, `value` non-empty, `label` non-empty
- **Done when:** GET returns targets list, POST creates new target

- [x] S4-T08

#### S4-T09 · Create `src/pages/api/reddit/targets/[id].ts` (PUT + DELETE)
- **File:** `src/pages/api/reddit/targets/[id].ts` (new file)
- **PUT action:** Auth + parse body `{ isActive?, priority?, label? }` + `UPDATE reddit_targets SET ... WHERE id=$id` + return updated row
- **DELETE action:** Auth + `DELETE FROM reddit_targets WHERE id=$id` + return `204`
- **Done when:** can toggle `isActive` via PUT and delete via DELETE

- [x] S4-T09

---

### SPRINT 5 — Frontend Components

#### S5-T01 · Create `src/components/admin/RedditGapCard.astro` — collapsed state
- **File:** `src/components/admin/RedditGapCard.astro` (new file)
- **Props:** `gap` (RedditExtractedGap shape), `sourcePosts` (array, max 3)
- **Collapsed markup:**
  - Intensity badge: `1–4` grey, `5–7` amber, `8–10` red
  - Category chip: colored by category value
  - `painPointTitle` as card heading
  - Meta row: `{frequency} posts · {subreddits list} · Run #{scrapeRunId}`
  - Three buttons: `Expand`, `Approve`, `Reject` (disabled until expanded or direct action)
- **Style:** copy `.gap-card` CSS pattern from `GapCard.astro`, adapt colors
- **Done when:** card renders without JS — static collapsed view looks correct

- [x] S5-T01

#### S5-T02 · Create `RedditGapCard.astro` — expanded state JS
- **File:** `src/components/admin/RedditGapCard.astro`
- **Action:** Add inline `<script>` for expand/collapse toggle. On expand, reveal:
  - Full `painPointDescription`
  - Source posts list (title as link + subreddit + upvote count)
  - `vocabularyQuotes` as `<span class="chip">` elements
  - `suggestedArticleAngle` in a highlighted block
  - `<textarea>` for author notes (pre-filled if `authorNotes` exists)
  - `[APPROVE → Create Gap]` button → `POST /api/reddit/gaps/{id}/approve`
  - `[REJECT]` button → `POST /api/reddit/gaps/{id}/reject`
- **After approve/reject:** remove card from DOM, update stats bar counts
- **Done when:** full expand/approve/reject flow works without page reload

- [x] S5-T02

#### S5-T03 · Create `src/components/admin/RedditRunPanel.astro`
- **File:** `src/components/admin/RedditRunPanel.astro` (new file)
- **Static markup:**
  - Target checklist: render `redditTargets` passed as prop as `<input type="checkbox" checked>` items
  - `[START SCRAPING JOB]` button
  - Live log `<pre>` console (hidden until job starts)
  - Progress row: `{postsCollected} posts · {painPointsExtracted} pain points`
- **Done when:** static markup renders with targets list

- [x] S5-T03

#### S5-T04 · Add SSE logic to `RedditRunPanel.astro`
- **File:** `src/components/admin/RedditRunPanel.astro`
- **Action:** Add `<script>` block. Copy SSE connection + reconnect logic from the GEO Monitor section in `src/pages/admin/index.astro`. Adapt:
  - Start button → `POST /api/reddit/start` with `{ targets: checkedTargets }`
  - SSE → `GET /api/reddit/stream?from=N`
  - Status poll on load → `GET /api/reddit/status`
  - Parse lines for `postsCollected:N` pattern → update counter in UI
- **Done when:** clicking Start streams logs into the console div in real time

- [x] S5-T04

#### S5-T05 · Create `src/components/admin/RedditRunsTable.astro`
- **File:** `src/components/admin/RedditRunsTable.astro` (new file)
- **Props:** `runs[]`
- **Columns:** `#`, `Date`, `Targets`, `Posts`, `Pain Points`, `Gaps Created`, `Status badge`, `[Details →]`
- **Status badge colors:** running=amber, completed=green, failed=red
- **Done when:** renders table rows from props, `[Details →]` links to `/admin/reddit/run/{id}`

- [x] S5-T05

#### S5-T06 · Create `src/pages/admin/reddit/index.astro` — layout & data fetching
- **File:** `src/pages/admin/reddit/index.astro` (new file, create directory)
- **Server-side:**
  - Auth redirect (same pattern as other admin pages)
  - Fetch stats: `SELECT count(*) FROM reddit_extracted_gaps GROUP BY status`
  - Fetch pending gaps (page 1, limit 20): call `/api/reddit/gaps?status=pending`
  - Fetch last 5 runs: call `/api/reddit/runs?limit=5`
  - Fetch active targets: call `/api/reddit/targets`
- **Static layout:** stats bar + two-column layout (sidebar + main) per Section 9.2 wire spec
- **Components used:** `RedditRunPanel`, `RedditRunsTable`, `RedditGapCard` (one per gap)
- **Done when:** page loads, shows stats bar and empty/populated gap list

- [x] S5-T06

#### S5-T07 · Add tabs, filters, and sort to `reddit/index.astro`
- **File:** `src/pages/admin/reddit/index.astro`
- **Action:** Add client-side JS for:
  - Tab switching (Pending / Approved / Rejected) → fetches `/api/reddit/gaps?status=X`
  - Category filter dropdown → fetches `/api/reddit/gaps?status=X&category=Y`
  - Sort selector (intensity / frequency / newest) → client-side re-sort of loaded cards
  - Re-renders card list on tab/filter change without full page reload
- **Done when:** switching tabs shows different gaps, category filter narrows the list

- [x] S5-T07

#### S5-T08 · Add Reddit Intelligence hub card to `src/pages/admin/index.astro`
- **File:** `src/pages/admin/index.astro`
- **Action:**
  - Fetch `pendingCount`: `SELECT count(*) FROM reddit_extracted_gaps WHERE status='pending'` (server-side, same pattern as other stats)
  - Add hub card HTML in the hub navigation section alongside GEO Monitor
  - Card content: icon, title "Reddit Intelligence", desc "Pain Point Discovery", badge showing `{pendingCount} pending`
  - Link: `href="/admin/reddit"`
- **Done when:** admin dashboard shows the new card with a live pending count

- [x] S5-T08

---

### SPRINT 6 — Optional / Polish

#### S6-T01 · Create `src/pages/admin/reddit/targets.astro`
- **File:** `src/pages/admin/reddit/targets.astro` (new file)
- **Action:**
  - Server-side: fetch all `redditTargets`
  - Table with: label, type badge, value, priority, isActive toggle, delete button
  - "Add Target" form: type select, value input, label input, priority slider (0–100)
  - Quick-add preset buttons for top 5 subreddits from Section 2.2
  - All actions via fetch calls to `/api/reddit/targets` CRUD endpoints
- **Done when:** can add, toggle active, and delete targets from this page

- [x] S6-T01

#### S6-T02 · Create `src/pages/admin/reddit/run/[id].astro`
- **File:** `src/pages/admin/reddit/run/[id].astro` (new file)
- **Action:**
  - Server-side: fetch `redditScrapeRuns` by id + all `redditExtractedGaps` for that run
  - Display: run metadata (date, duration, stats), full list of extracted gaps with their status
  - Each gap: collapsed `RedditGapCard` with pending ones still actionable
- **Done when:** `/admin/reddit/run/1` shows run details and its gaps

- [x] S6-T02

#### S6-T03 · Voice of Customer enrichment in draft mega-prompt
- **File:** Wherever the draft mega-prompt is assembled (e.g. `scripts/draft-bridge.ts` or `generate-draft.ts`)
- **Action:**
  - After fetching KB entries for the gap, also query: `SELECT vocabulary_quotes FROM reddit_extracted_gaps WHERE content_gap_id = $gapId LIMIT 1`
  - If result exists and `vocabularyQuotes.length > 0`, append to prompt:
    ```
    === VOICE OF CUSTOMER (Reddit) ===
    Real phrases used by niche users — weave these naturally into the article:
    {quotes as bullet list}
    ```
  - If no Reddit source, prompt is unchanged
- **Done when:** draft generated from a Reddit-approved gap includes vocabulary section in the prompt (verify by logging prompt before sending)

- [x] S6-T03

#### S6-T04 · Reddit source badge on Content Gaps page
- **File:** `src/components/admin/GapCard.astro` (or `GapExpandedCard.astro`)
- **Action:** Check if `gap.sourceModels` includes `'reddit-apify'`. If yes, render a small `REDDIT` badge next to the gap title.
- **Style:** small pill, red background, consistent with other badges in the file
- **Done when:** gaps from Reddit show a badge, GEO Monitor gaps do not

- [x] S6-T04

#### S6-T05 · Update docs
- **File:** `docs_private/geo-monitor-flow.md`
- **Action:** Add section "Parallel Source: Reddit Intelligence" with 3-line description and link to `docs/modules/reddit/reddit-webscraping-pipeline.md`
- **Done when:** section exists in the file

- [x] S6-T05

#### S6-T06 · Run seed script in production
- **Command:** `npm run reddit:seed`
- **Pre-condition:** S1-T06 (migration ran), DB accessible
- **Done when:** `SELECT count(*) FROM reddit_targets` returns 8

- [x] S6-T06

---

### TASK SUMMARY TABLE

| ID | Sprint | File / Area | Est. Complexity | Status |
|---|---|---|---|---|
| S1-T01 | DB | `src/db/schema.ts` | XS | [ ] |
| S1-T02 | DB | `src/db/schema.ts` | XS | [ ] |
| S1-T03 | DB | `src/db/schema.ts` | XS | [ ] |
| S1-T04 | DB | `src/db/schema.ts` | XS | [ ] |
| S1-T05 | DB | migration | XS | [ ] |
| S1-T06 | DB | DB push | XS | [ ] |
| S1-T07 | DB | `scripts/seed-reddit-targets.ts` | S | [ ] |
| S1-T08 | DB | `package.json` | XS | [ ] |
| S2-T01 | Script | `scripts/reddit-scraper.ts` | S | [ ] |
| S2-T02 | Script | `scripts/reddit-scraper.ts` | S | [ ] |
| S2-T03 | Script | `scripts/reddit-scraper.ts` | M | [ ] |
| S2-T04 | Script | `scripts/reddit-scraper.ts` | S | [ ] |
| S2-T05 | Script | `scripts/reddit-scraper.ts` | M | [ ] |
| S2-T06 | Script | `scripts/reddit-scraper.ts` | M | [ ] |
| S2-T07 | Script | `scripts/reddit-scraper.ts` | M | [ ] |
| S2-T08 | Script | `scripts/reddit-scraper.ts` | S | [ ] |
| S2-T09 | Script | `scripts/reddit-scraper.ts` | S | [ ] |
| S3-T01 | Job | `src/lib/reddit-scrape-job.ts` | S | [ ] |
| S3-T02 | Job | `src/lib/reddit-scrape-job.ts` | M | [ ] |
| S3-T03 | Job | `src/lib/reddit-scrape-job.ts` | XS | [ ] |
| S3-T04 | Job | `src/lib/reddit-scrape-job.ts` | XS | [ ] |
| S4-T01 | API | `/api/reddit/start.ts` | M | [ ] |
| S4-T02 | API | `/api/reddit/status.ts` | XS | [ ] |
| S4-T03 | API | `/api/reddit/stream.ts` | S | [ ] |
| S4-T04 | API | `/api/reddit/runs/index.ts` | S | [ ] |
| S4-T05 | API | `/api/reddit/gaps/index.ts` | M | [ ] |
| S4-T06 | API | `/api/reddit/gaps/[id]/approve.ts` | M | [ ] |
| S4-T07 | API | `/api/reddit/gaps/[id]/reject.ts` | S | [ ] |
| S4-T08 | API | `/api/reddit/targets/index.ts` | S | [ ] |
| S4-T09 | API | `/api/reddit/targets/[id].ts` | S | [ ] |
| S5-T01 | FE | `RedditGapCard.astro` (static) | M | [ ] |
| S5-T02 | FE | `RedditGapCard.astro` (JS) | M | [ ] |
| S5-T03 | FE | `RedditRunPanel.astro` (static) | S | [ ] |
| S5-T04 | FE | `RedditRunPanel.astro` (SSE) | M | [ ] |
| S5-T05 | FE | `RedditRunsTable.astro` | S | [ ] |
| S5-T06 | FE | `reddit/index.astro` (layout) | M | [ ] |
| S5-T07 | FE | `reddit/index.astro` (JS) | M | [ ] |
| S5-T08 | FE | `admin/index.astro` (hub card) | S | [ ] |
| S6-T01 | Polish | `reddit/targets.astro` | M | [ ] |
| S6-T02 | Polish | `reddit/run/[id].astro` | S | [ ] |
| S6-T03 | Polish | draft mega-prompt enrichment | M | [ ] |
| S6-T04 | Polish | `GapCard.astro` Reddit badge | XS | [ ] |
| S6-T05 | Polish | `docs_private/geo-monitor-flow.md` | XS | [ ] |
| S6-T06 | Polish | seed script in production | XS | [ ] |

**Total: 46 atomic tasks** · XS=trivial · S=small · M=medium

---

*Generated: 2026-03-11*
*Version: 1.2 — added Section 16: Atomic Task List (46 tasks across 6 sprints)*
*Status: READY — all sections complete, implementation-ready for autonomous agents*
