# Brand Clarity Module — Granular Implementation Tasks

## Instructions for Autonomous Agents

Each task is atomic, independently executable, and has explicit dependencies.
**Never start a task before all its dependencies are marked ✅.**
**Never modify the existing YouTube module files.** Brand Clarity is a new, parallel module.

Mirror patterns from:
- `src/lib/yt-scrape-job.ts` → for `bc-scrape-job.ts`
- `scripts/yt-scraper.ts` → for `bc-scraper.ts`
- `src/pages/api/youtube/` → for `/api/brand-clarity/` routes
- `src/pages/admin/youtube/` → for `/admin/brand-clarity/` pages
- `src/components/admin/YtGapCard.astro` → for `BcPainPointCard.astro`

---

## Progress Tracker

### Phase 0 — Read Existing Code (No changes)
- [x] BC-00: Read YouTube module source files
- [x] BC-01: Read DB schema

### Phase 1 — Database Schema
- [x] BC-02: Add `bcProjects` table (incl. `projectDocumentation`)
- [x] BC-03: Add `bcTargetChannels` table
- [x] BC-04: Add `bcTargetVideos` table
- [x] BC-05: Add `bcComments` table
- [x] BC-06: Add `bcExtractedPainPoints` table
- [x] BC-07: Add `bcLandingPageVariants` table (incl. `improvementSuggestions`)
- [x] BC-08: Run DB migration

### Phase 2 — LP Parsing (Stage 1)
- [x] BC-09: Create `scripts/bc-lp-parser.ts` (Sonnet, uses projectDocumentation)
- [x] BC-10: Create `POST /api/brand-clarity/projects` route
- [x] BC-11: Create project read/update/delete routes

### Phase 2.1 — Project Documentation (Stage 1.1)
- [x] BC-11b: Create `PUT /api/brand-clarity/projects/[id]/documentation` route
- [x] BC-11c: Create `/admin/brand-clarity/[id]/docs.astro` page

### Phase 3 — Channel Discovery (Stage 2)
- [x] BC-12: Create `scripts/bc-channel-discovery.ts` (quota-optimized, reuse YOUTUBE_API_KEY)
- [x] BC-13: Create `POST /api/brand-clarity/[projectId]/discover-channels`
- [x] BC-14: Create channel CRUD routes (list, add, update, delete, confirm-all)

### Phase 4 — Video Discovery (Stage 3)
- [x] BC-15: Create `scripts/bc-video-discovery.ts` (quota-optimized, reuse YOUTUBE_API_KEY)
- [x] BC-16: Create `POST /api/brand-clarity/[projectId]/discover-videos` + `GET videos`

### Phase 5 — Comment Scraping (Stage 4)
- [x] BC-17: Create `scripts/bc-scraper.ts` (Haiku model for pain point extraction)
- [x] BC-18: Create `src/lib/bc-scrape-job.ts`
- [x] BC-19: Create scrape API routes (start, status, stream)
- [x] BC-20: Create pain points API routes (list, update, delete, auto-filter)

### Phase 6 — LP Generation (Stage 5)
- [x] BC-21: Create `scripts/bc-lp-generator.ts` (Sonnet, uses projectDocumentation, generates improvement suggestions)
- [x] BC-22: Create `POST /api/brand-clarity/[projectId]/generate-variants`
- [x] BC-23: Create variants API routes (list, get detail, update, delete)

### Phase 7 — Admin UI
- [x] BC-24: Create `BcPainPointCard.astro` component
- [x] BC-25: Create `/admin/brand-clarity/index.astro` (project list)
- [x] BC-26: Create `/admin/brand-clarity/new.astro` (LP input + Claude Code prompt)
- [x] BC-27: Create `/admin/brand-clarity/[id]/channels.astro`
- [x] BC-28: Create `/admin/brand-clarity/[id]/videos.astro`
- [x] BC-29: Create `/admin/brand-clarity/[id]/scrape.astro`
- [x] BC-30: Create `/admin/brand-clarity/[id]/variants.astro` (with Improvements panel)
- [x] BC-31: Add Brand Clarity hub card to `/admin/index.astro`

### Phase 8 — Configuration & Seeds
- [x] BC-32: Document new env vars
- [x] BC-33: Create seed script `scripts/seed-bc-test-project.ts`

### Phase 9 — Audit Fixes
- [x] BC-34: Create missing `/admin/brand-clarity/[id]/docs.astro` (was specified but not created in initial pass)
- [x] BC-35: Fix pain-points GET route — move status filter from JS to DB `WHERE` clause (Drizzle `and()`)
- [x] BC-36: Remove unused `and` import from `pain-points/auto-filter.ts`

---

## Parallel Execution Map

```
BC-00, BC-01 (parallel, no deps)
    ↓
BC-02 → BC-03 → BC-04 → BC-05 → BC-06 → BC-07 → BC-08 (sequential, schema)
    ↓
BC-09, BC-10, BC-11 (parallel after BC-08)
    ↓
BC-11b, BC-11c (parallel, after BC-11)
    ↓
BC-12, BC-13, BC-14 (parallel after BC-08)
    ↓
BC-15, BC-16 (parallel after BC-14)
    ↓
BC-17 → BC-18 → BC-19, BC-20 (parallel after BC-18)
    ↓
BC-21 → BC-22, BC-23 (parallel after BC-21)
    ↓
BC-24 (after BC-06)
BC-25, BC-26 (after BC-11, BC-24)
BC-11c (after BC-11b, BC-25)
BC-27 (after BC-14, BC-25)
BC-28 (after BC-16, BC-25)
BC-29 (after BC-20, BC-24)
BC-30 (after BC-23, BC-24)
BC-31 (after BC-25)
    ↓
BC-32, BC-33 (final, after all)
```

---

## Task Definitions

---

### BC-00 — Read YouTube Module Source Files

**Phase:** 0 — Analysis
**Deps:** none

**Goal:** Build complete mental model of the YouTube Intelligence module before writing any Brand Clarity code.

**Files to read completely:**
```
src/lib/yt-scrape-job.ts
scripts/yt-scraper.ts (if exists) OR docs/youtube-comments-scraper-implementation.md
src/pages/api/youtube/start.ts
src/pages/api/youtube/status.ts
src/pages/api/youtube/stream.ts
src/pages/api/youtube/runs/index.ts
src/pages/api/youtube/gaps/[id]/approve.ts
src/pages/api/youtube/gaps/[id]/reject.ts
src/pages/api/youtube/gaps/auto-filter.ts
src/pages/api/youtube/targets/index.ts
src/pages/api/youtube/targets/[id].ts
src/pages/admin/youtube/index.astro
src/pages/admin/youtube/targets.astro
src/pages/admin/youtube/run/[id].astro
src/components/admin/YtGapCard.astro
src/utils/brandFilter.ts
```

**Acceptance criteria:**
- [ ] Can describe what `YtScrapeJobManager` does and how it uses `globalThis`
- [ ] Understand stdout protocol (`commentsCollected:N`, `RESULT_JSON:...`)
- [ ] Understand how SSE streaming works in the admin UI
- [ ] Know the exact shape of `ytExtractedGaps` table entries

---

### BC-01 — Read DB Schema

**Phase:** 0 — Analysis
**Deps:** none

**Files to read:**
```
src/db/schema.ts
drizzle.config.ts
```

**Acceptance criteria:**
- [ ] Understand Drizzle ORM table definition patterns
- [ ] Know existing table names (avoid collisions)
- [ ] Understand `serial`, `varchar`, `text`, `integer`, `boolean`, `jsonb`, `timestamp` patterns
- [ ] Know how FK + `onDelete: 'cascade'` are declared

---

### BC-02 — Add `bcProjects` Table

**Phase:** 1 — Database Schema
**Deps:** BC-01
**File to edit:** `src/db/schema.ts`

```typescript
export const bcProjects = pgTable('bc_projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  founderDescription: text('founder_description').notNull(),
  founderVision: text('founder_vision'),
  projectDocumentation: text('project_documentation'),   // Stage 1.1 — nullable
  lpRawInput: text('lp_raw_input').notNull(),
  lpStructureJson: jsonb('lp_structure_json'),            // includes sectionWeaknesses
  lpTemplateHtml: text('lp_template_html'),
  nicheKeywords: jsonb('niche_keywords').$type<string[]>().default([]),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Valid `status` values:**
`draft` → `docs_pending` → `channels_pending` → `videos_pending` → `scraping` → `pain_points_pending` → `generating` → `done`

**Acceptance criteria:**
- [ ] `projectDocumentation` is nullable (Stage 1.1 is optional)
- [ ] `lpStructureJson` typed as `jsonb` (will hold `sectionWeaknesses` sub-object)
- [ ] No existing tables modified

---

### BC-03 — Add `bcTargetChannels` Table

**Phase:** 1 — Database Schema
**Deps:** BC-02

```typescript
export const bcTargetChannels = pgTable('bc_target_channels', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  channelId: varchar('channel_id', { length: 100 }).notNull(),
  channelHandle: varchar('channel_handle', { length: 100 }),
  channelName: varchar('channel_name', { length: 255 }).notNull(),
  channelUrl: text('channel_url').notNull(),
  subscriberCount: integer('subscriber_count'),
  description: text('description'),
  discoveryMethod: varchar('discovery_method', { length: 50 }).notNull().default('auto'),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Acceptance criteria:**
- [ ] FK to `bcProjects.id` with `onDelete: 'cascade'`
- [ ] `discoveryMethod` accepts `'auto'` or `'manual'`

---

### BC-04 — Add `bcTargetVideos` Table

**Phase:** 1 — Database Schema
**Deps:** BC-03

```typescript
export const bcTargetVideos = pgTable('bc_target_videos', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => bcTargetChannels.id, { onDelete: 'cascade' }),
  videoId: varchar('video_id', { length: 50 }).notNull(),
  videoUrl: text('video_url').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  viewCount: integer('view_count'),
  commentCount: integer('comment_count'),
  publishedAt: timestamp('published_at'),
  relevanceScore: real('relevance_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Acceptance criteria:**
- [ ] Two FK cascades: to `bcProjects` and `bcTargetChannels`
- [ ] `real` type for `relevanceScore`

---

### BC-05 — Add `bcComments` Table

**Phase:** 1 — Database Schema
**Deps:** BC-04

```typescript
export const bcComments = pgTable('bc_comments', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  videoId: integer('video_id').notNull().references(() => bcTargetVideos.id, { onDelete: 'cascade' }),
  commentId: varchar('comment_id', { length: 100 }).notNull(),
  commentText: text('comment_text').notNull(),
  voteCount: integer('vote_count').notNull().default(0),
  author: varchar('author', { length: 255 }),
  publishedAt: timestamp('published_at'),
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
});
```

**Acceptance criteria:**
- [ ] `commentId` = YouTube comment ID — used for dedup within project scope

---

### BC-06 — Add `bcExtractedPainPoints` Table

**Phase:** 1 — Database Schema
**Deps:** BC-05

```typescript
export const bcExtractedPainPoints = pgTable('bc_extracted_pain_points', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull(),
  frequency: integer('frequency').notNull().default(1),
  vocabularyQuotes: jsonb('vocabulary_quotes').$type<string[]>().default([]),
  category: varchar('category', { length: 50 }).notNull(),
  customerLanguage: text('customer_language'),
  desiredOutcome: text('desired_outcome'),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  sourceVideoIds: jsonb('source_video_ids').$type<number[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Acceptance criteria:**
- [ ] `vocabularyQuotes` and `sourceVideoIds` are typed jsonb arrays
- [ ] `status` defaults to `'pending'`

---

### BC-07 — Add `bcLandingPageVariants` Table

**Phase:** 1 — Database Schema
**Deps:** BC-06

```typescript
export const bcLandingPageVariants = pgTable('bc_landing_page_variants', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  variantType: varchar('variant_type', { length: 50 }).notNull(),
  variantLabel: varchar('variant_label', { length: 255 }).notNull(),
  htmlContent: text('html_content').notNull(),
  improvementSuggestions: jsonb('improvement_suggestions')
    .$type<Record<string, string>>().default({}),  // { hero: "...", problem: "...", ... }
  primaryPainPointId: integer('primary_pain_point_id')
    .references(() => bcExtractedPainPoints.id),
  generationPromptUsed: text('generation_prompt_used'),
  generationModel: varchar('generation_model', { length: 100 }),
  isSelected: boolean('is_selected').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**`improvementSuggestions`** — a dict keyed by section name (from `sectionOrder`) with the suggestion text. Extracted from `<!-- IMPROVEMENT SUGGESTION: ... -->` comments in the HTML after generation.

**Acceptance criteria:**
- [ ] `primaryPainPointId` is nullable — null for `founder_vision`
- [ ] `improvementSuggestions` typed as `Record<string, string>`

---

### BC-08 — Run DB Migration

**Phase:** 1 — Database Schema
**Deps:** BC-02 through BC-07

```bash
npm run db:push
```

**Acceptance criteria:**
- [ ] All 6 new tables exist: `bc_projects`, `bc_target_channels`, `bc_target_videos`, `bc_comments`, `bc_extracted_pain_points`, `bc_landing_page_variants`
- [ ] No existing tables dropped or altered

**Gotcha:** Verify `DATABASE_URL` is set correctly for the target environment before running.

---

### BC-09 — Create `scripts/bc-lp-parser.ts`

**Phase:** 2 — LP Parsing
**Deps:** BC-08, BC-00

**Model:** `claude-sonnet-4-6` (via OpenRouter) — precision matters for structural extraction.

**Environment variables:**
- `OPENROUTER_API_KEY`
- `BC_LP_MODEL` (default: `anthropic/claude-sonnet-4-6`)
- `BC_PROJECT_ID`

**Script logic:**
```typescript
// 1. Load project from DB: lpRawInput, founderDescription, projectDocumentation
// 2. Build prompt (see specification.md Stage 1 → Step 1 Prompt)
//    - Include projectDocumentation in "--- MY FULL PROJECT DOCUMENTATION ---" section
//    - If projectDocumentation is null, omit that section gracefully
// 3. Call OpenRouter: model=BC_LP_MODEL, max_tokens=4096, temperature=0.3
// 4. Parse ```json block → lpStructureJson (validate sectionWeaknesses is present)
// 5. Parse ```html block → lpTemplateHtml
// 6. Write back: lpStructureJson, lpTemplateHtml, founderVision, nicheKeywords
// 7. Set bcProjects.status = 'channels_pending'
// stdout: LP_PARSE_RESULT:{"success":true,"nicheKeywordsFound":5}
```

**Acceptance criteria:**
- [ ] Uses `BC_LP_MODEL` env var (Sonnet)
- [ ] `lpStructureJson` includes `sectionWeaknesses` object
- [ ] `lpTemplateHtml` contains `<!-- PAIN POINT HOOK GOES HERE -->` AND `<!-- CRO NOTE: -->` comments
- [ ] Works whether `projectDocumentation` is null or present
- [ ] stdout includes `LP_PARSE_RESULT:` line

---

### BC-10 — Create `POST /api/brand-clarity/projects`

**Phase:** 2 — LP Parsing
**Deps:** BC-09

**File:** `src/pages/api/brand-clarity/projects/index.ts`

**POST body:**
```typescript
{
  name: string;
  founderDescription: string;
  lpRawInput: string;
}
```

**Logic:**
1. Auth check
2. Validate required fields
3. Insert `bcProjects` row with `status: 'draft'`
4. Spawn child process: `npx tsx scripts/bc-lp-parser.ts` with `BC_PROJECT_ID=<id>`
5. Return `{ projectId: number; status: 'parsing' }`

**Acceptance criteria:**
- [ ] Returns 401 if not authenticated
- [ ] Returns 400 if required fields missing
- [ ] Project record created in DB before parser spawns

---

### BC-11 — Create Project Read/Update/Delete Routes

**Phase:** 2 — LP Parsing
**Deps:** BC-08

**Files:**
- `src/pages/api/brand-clarity/projects/index.ts` (GET list, alongside POST)
- `src/pages/api/brand-clarity/projects/[id].ts` (GET detail, PUT update, DELETE)

**GET list** → `{ id, name, status, createdAt }[]`
**GET [id]** → full project including `lpStructureJson` and `projectDocumentation`
**PUT [id]** → update `name`, `founderDescription`
**DELETE [id]** → delete + cascade (returns 204)

**Acceptance criteria:**
- [ ] All routes require session auth
- [ ] GET [id] returns 404 if not found

---

### BC-11b — Create `PUT /api/brand-clarity/projects/[id]/documentation`

**Phase:** 2.1 — Project Documentation
**Deps:** BC-11

**File:** `src/pages/api/brand-clarity/projects/[id]/documentation.ts`

**PUT body:**
```typescript
{ projectDocumentation: string | null }
```

**Logic:**
1. Auth check
2. Update `bcProjects.projectDocumentation`
3. If `projectDocumentation` is non-empty, set `status = 'channels_pending'`
4. If null / empty string ("skip"), also set `status = 'channels_pending'` but leave `projectDocumentation` as null
5. Return `{ success: true, status: 'channels_pending' }`

**Why:** Status must advance regardless — skipping documentation is allowed.

**Acceptance criteria:**
- [ ] Both save and skip update status to `channels_pending`
- [ ] Returns 404 if project not found
- [ ] Returns 400 if project status is past `docs_pending` (cannot overwrite after channels are confirmed)

---

### BC-11c — Create `/admin/brand-clarity/[id]/docs.astro`

**Phase:** 2.1 — Project Documentation
**Deps:** BC-11b, BC-25

**Content:**
- Progress stepper (Step 1.1 active)
- Header: "Step 1.1 — Project Documentation"
- Info box: "Paste everything that describes WHAT your product IS: README, feature list, product spec, how-it-works docs. This grounds all AI-generated landing pages in factual accuracy."
- Large `<textarea>` (40 rows) — pre-filled with existing `projectDocumentation` if present
- Word count: `<span id="wordCount">0 words</span>` updated on input
- "Skip this step →" secondary link: calls PUT with `{ projectDocumentation: null }`, redirects to channels page
- "Save & Discover Channels →" primary button: PUT then redirect to `/admin/brand-clarity/{id}/channels`

**Acceptance criteria:**
- [ ] Auth guard
- [ ] Word count updates live via JS
- [ ] Skip shows a warning: "Skipping may reduce landing page accuracy"
- [ ] Button shows loading state: "Saving…"
- [ ] Redirect to channels page on success

---

### BC-12 — Create `scripts/bc-channel-discovery.ts`

**Phase:** 3 — Channel Discovery
**Deps:** BC-08, BC-00

**No LLM.** Uses existing `YOUTUBE_API_KEY`.

**Environment variables:**
- `YOUTUBE_API_KEY` (already in project — do NOT add new var)
- `BC_PROJECT_ID`

**Quota-optimized logic:**
```typescript
// 1. Load project.nicheKeywords from DB
// 2. Run 3 search.list calls (one per top keyword), maxResults: 20 each = 300 units
//    GET /youtube/v3/search?part=snippet&type=channel&q={keyword}&maxResults=20&key={KEY}
// 3. Collect all channelIds across queries, deduplicate
// 4. ONE batched channels.list call for ALL candidates = 1 unit
//    GET /youtube/v3/channels?part=statistics,snippet&id={ids_comma_separated}&key={KEY}
// 5. Filter: subscriberCount > 10,000
// 6. Handle 403 quotaExceeded: log "QUOTA_EXCEEDED", exit 1
// 7. Insert top 15 into bcTargetChannels with isConfirmed: false
// 8. Set bcProjects.status = 'channels_pending' (already set, no-op)
// stdout: CHANNELS_FOUND:15
```

**Gotcha:** `channels.list` `id` param accepts comma-separated IDs. Batch ALL in one call — never loop.

**Acceptance criteria:**
- [ ] Max 3 `search.list` calls total (never more)
- [ ] Exactly 1 `channels.list` call for all candidates batched
- [ ] Quota error surfaced with `QUOTA_EXCEEDED` line in stdout
- [ ] Inserts with `discoveryMethod: 'auto'`

---

### BC-13 — Create `POST /api/brand-clarity/[projectId]/discover-channels`

**Phase:** 3 — Channel Discovery
**Deps:** BC-12

**File:** `src/pages/api/brand-clarity/[projectId]/discover-channels.ts`

**Logic:**
1. Auth check
2. Verify project has `nicheKeywords` (LP must be parsed)
3. Verify status is not past `channels_pending`
4. Spawn `npx tsx scripts/bc-channel-discovery.ts` with `BC_PROJECT_ID` + `YOUTUBE_API_KEY`
5. Return `{ status: 'discovering' }`

**Acceptance criteria:**
- [ ] Returns 400 if `nicheKeywords` is empty/null
- [ ] Passes `YOUTUBE_API_KEY` from server env to child process

---

### BC-14 — Create Channel CRUD Routes

**Phase:** 3 — Channel Discovery
**Deps:** BC-08

**Files:**
- `src/pages/api/brand-clarity/[projectId]/channels/index.ts` — GET list + POST add manual
- `src/pages/api/brand-clarity/[projectId]/channels/[channelId].ts` — PUT + DELETE
- `src/pages/api/brand-clarity/[projectId]/channels/confirm-all.ts` — POST

**POST add manual:**
```typescript
body: { channelUrl: string; channelName?: string; }
// Parse: youtube.com/channel/UCxxx and youtube.com/@handle formats
// Call channels.list to get real channel data (1 unit quota)
// Insert with discoveryMethod: 'manual', isConfirmed: true
```

**PUT [channelId]:** Update `isConfirmed`, `sortOrder`

**POST confirm-all:**
- Validates ≥ 1 channel confirmed
- Sets `bcProjects.status = 'videos_pending'`
- Spawns `bc-video-discovery.ts`
- Returns `{ status: 'discovering_videos', confirmedCount }`

**Acceptance criteria:**
- [ ] `confirm-all` returns 400 if 0 confirmed
- [ ] DELETE returns 404 if channel doesn't belong to this project

---

### BC-15 — Create `scripts/bc-video-discovery.ts`

**Phase:** 4 — Video Discovery
**Deps:** BC-08, BC-12

**No LLM.** Uses existing `YOUTUBE_API_KEY`.

**Quota-optimized logic:**
```typescript
// 1. Load confirmed bcTargetChannels for project
// 2. Load project.nicheKeywords (top 3)
// 3. For each confirmed channel (N channels = N × 100 quota units):
//    - ONE search.list per channel:
//      GET /youtube/v3/search?part=snippet&channelId={id}&q={kw1 kw2 kw3}
//        &type=video&videoDuration=medium&order=relevance&maxResults=10&key={KEY}
//    - Collect up to 10 video candidates
// 4. Batch ALL videoIds into ONE videos.list call per channel group:
//    GET /youtube/v3/videos?part=statistics&id={ids}&key={KEY}
// 5. Score: relevanceScore = (1 - apiRank/10) * 0.7 + (commentCount > 100 ? 0.3 : 0)
// 6. Select top 3 per channel
// 7. Insert into bcTargetVideos
// 8. Handle 403 quotaExceeded
// 9. Set bcProjects.status = 'scraping' when complete
// stdout: VIDEOS_FOUND:30
```

**Acceptance criteria:**
- [ ] Exactly 1 `search.list` per channel (N calls total, N = confirmed channels)
- [ ] 1 batched `videos.list` per channel (not per video)
- [ ] `videoUrl` = `https://www.youtube.com/watch?v={videoId}`
- [ ] Quota error logs `QUOTA_EXCEEDED` and exits 1

---

### BC-16 — Create Video Routes

**Phase:** 4 — Video Discovery
**Deps:** BC-15

**Files:**
- `src/pages/api/brand-clarity/[projectId]/discover-videos.ts` — POST (manual re-trigger)
- `src/pages/api/brand-clarity/[projectId]/videos/index.ts` — GET list

**GET videos:** Returns `bcTargetVideos` grouped by channel, includes `bcTargetChannels.channelName`

**Acceptance criteria:**
- [ ] GET groups by channel
- [ ] POST returns 400 if no channels confirmed

---

### BC-17 — Create `scripts/bc-scraper.ts`

**Phase:** 5 — Comment Scraping
**Deps:** BC-08, BC-00

**Model: `claude-haiku-4-5-20251001`** via OpenRouter — cost-critical. This script makes ~300 LLM calls per run. Haiku reduces cost by ~95% vs Sonnet.

**Pattern:** Mirror `scripts/yt-scraper.ts` exactly. Replace `ytTargets`/`ytComments`/`ytExtractedGaps` with `bcTargetVideos`/`bcComments`/`bcExtractedPainPoints`.

**Environment variables:**
- `YOUTUBE_API_KEY` (existing — reused for `commentThreads.list`)
- `OPENROUTER_API_KEY` (existing)
- `BC_PROJECT_ID`
- `BC_ANALYSIS_MODEL` (default: `anthropic/claude-haiku-4-5-20251001`)
- `BC_MAX_COMMENTS_PER_VIDEO` (default: 200)
- `BC_COMMENT_CHUNK_SIZE` (default: 20)

**stdout protocol (identical to yt-scraper):**
```
[ISO] [BC-SCRAPER] Starting project 42 — 30 videos
commentsCollected:0
[ISO] [BC-SCRAPER] Scraping: "How to build deep focus" (UCabc123)
commentsCollected:200
painPointsExtracted:8
RESULT_JSON:{"commentsCollected":200,"painPointsExtracted":8,"status":"done"}
```

**Key differences from yt-scraper:**
- `BC_ANALYSIS_MODEL` uses **Haiku** (not Sonnet)
- Target unit is `bcTargetVideos` (not channels)
- Extraction prompt from `specification.md` Stage 4 (includes `customerLanguage`, `desiredOutcome`)
- Output to `bcComments` + `bcExtractedPainPoints`

**Pain point JSON shape (Haiku extracts, stored in bcExtractedPainPoints):**
```typescript
{
  painPointTitle: string;        // max 8 words
  painPointDescription: string;  // 2-3 sentences
  emotionalIntensity: number;    // 1-10
  frequency: number;
  vocabularyQuotes: string[];
  category: string;
  customerLanguage: string;      // NEW vs YT module
  desiredOutcome: string;        // NEW vs YT module
}
```

**Filtering (apply `brandFilter.ts`):**
- `emotionalIntensity < 8` → skip
- `OFF_BRAND_KEYWORDS` match → skip
- `painPointTitle.length < 15` → skip

**Acceptance criteria:**
- [ ] Uses `BC_ANALYSIS_MODEL` (Haiku) — NOT hardcoded Sonnet
- [ ] YouTube `commentThreads.list` per video (same as yt-scraper.ts)
- [ ] Dedup by `commentId` within project scope
- [ ] Pain points inserted with `status: 'pending'`
- [ ] stdout: `commentsCollected:N` and `painPointsExtracted:N` lines

---

### BC-18 — Create `src/lib/bc-scrape-job.ts`

**Phase:** 5 — Comment Scraping
**Deps:** BC-17, BC-00

**Pattern:** Mirror `src/lib/yt-scrape-job.ts` exactly.

```typescript
// Replace all `yt` → `bc`
// Replace __frinter_yt_job → __frinter_bc_job
// Spawn command: 'npx tsx scripts/bc-scraper.ts'

declare global {
  var __frinter_bc_job: BcScrapeJobManager | undefined;
}
export const bcScrapeJob = globalThis.__frinter_bc_job ??= new BcScrapeJobManager();
```

**Snapshot interface:**
```typescript
export interface BcScrapeSnapshot {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  commentsCollected: number;
  painPointsExtracted: number;
  currentTarget: string | null;
  lines: string[];
  result: Record<string, unknown> | null;
}
```

**Acceptance criteria:**
- [ ] `globalThis.__frinter_bc_job` persists across Vite HMR
- [ ] EventEmitter emits `'log'` on each stdout line
- [ ] Parses `commentsCollected:N` and `painPointsExtracted:N`
- [ ] `RESULT_JSON:` parsed into `result`

---

### BC-19 — Create Scrape API Routes (start, status, stream)

**Phase:** 5 — Comment Scraping
**Deps:** BC-18

**Files:**
```
src/pages/api/brand-clarity/[projectId]/scrape/start.ts
src/pages/api/brand-clarity/[projectId]/scrape/status.ts
src/pages/api/brand-clarity/[projectId]/scrape/stream.ts
```

**Mirror:** `src/pages/api/youtube/start.ts`, `status.ts`, `stream.ts`

**`start.ts` differences:**
- Passes `BC_PROJECT_ID` (not `SCRAPE_TARGET_IDS`)
- Also passes `BC_ANALYSIS_MODEL` env from server env
- Updates `bcProjects.status = 'scraping'`
- Returns `{ projectId, status: 'started', videosCount }`

**Acceptance criteria:**
- [ ] `start` returns 409 if job already running
- [ ] `start` returns 400 if no `bcTargetVideos` for project
- [ ] `BC_ANALYSIS_MODEL` forwarded to child process
- [ ] SSE stream emits correct `data: ` events

---

### BC-20 — Create Pain Points API Routes

**Phase:** 5 — Comment Scraping
**Deps:** BC-08

**Files:**
```
src/pages/api/brand-clarity/[projectId]/pain-points/index.ts
src/pages/api/brand-clarity/[projectId]/pain-points/[id].ts
src/pages/api/brand-clarity/[projectId]/pain-points/auto-filter.ts
```

**GET pain-points:** List with filters `?status=pending|approved|rejected&category=...`

**PUT [id]:** `{ status: 'approved' | 'rejected' }` — updates status

**POST auto-filter:** Rejects all pending pain points where `emotionalIntensity < 8`
Returns `{ rejected: number }`

**Acceptance criteria:**
- [ ] All routes scoped to `projectId` — cannot touch other projects
- [ ] PUT validates status value strictly

---

### BC-21 — Create `scripts/bc-lp-generator.ts`

**Phase:** 6 — LP Generation
**Deps:** BC-08, BC-09

**Model: `claude-sonnet-4-6`** — most important output, quality is critical.

**Environment variables:**
- `OPENROUTER_API_KEY`
- `BC_LP_MODEL` (default: `anthropic/claude-sonnet-4-6`)
- `BC_PROJECT_ID`

**Logic:**
```typescript
// 1. Load bcProjects: lpStructureJson, lpTemplateHtml, projectDocumentation, founderVision
// 2. Load approved bcExtractedPainPoints ORDER BY emotionalIntensity DESC
// 3. Cluster pain points:
//    - Cluster B: top 3 by emotionalIntensity (any category)
//    - Cluster C: next 3 with DIFFERENT category than Cluster B's dominant category
// 4. Generate 3 variants via sequential OpenRouter calls (BC_LP_MODEL = Sonnet):
//    Call A: founderVision + projectDocumentation + lpStructureJson + lpTemplateHtml
//    Call B: Cluster B pain points + projectDocumentation + lpStructureJson + lpTemplateHtml
//    Call C: Cluster C pain points + projectDocumentation + lpStructureJson + lpTemplateHtml
// 5. For each HTML response:
//    - Extract <!-- IMPROVEMENT SUGGESTION: ... --> comments into improvementSuggestions dict
//    - Store { hero: "...", problem: "...", solution: "...", ... }
// 6. Insert 3 rows into bcLandingPageVariants with improvementSuggestions populated
// 7. Set bcProjects.status = 'done'
// stdout: VARIANTS_GENERATED:3
```

**LLM call config:**
```typescript
model: process.env.BC_LP_MODEL ?? 'anthropic/claude-sonnet-4-6',
max_tokens: 8192,
temperature: 0.7
```

**Improvement suggestion extraction (post-processing):**
```typescript
// Regex: /<!-- IMPROVEMENT SUGGESTION: (.+?) -->/g
// Key = preceding <section class="X"> class name
// Store in improvementSuggestions: { "hero": "...", "problem": "...", ... }
```

**Acceptance criteria:**
- [ ] Uses `BC_LP_MODEL` (Sonnet) — NOT Haiku
- [ ] `projectDocumentation` injected into ALL 3 generation calls
- [ ] `improvementSuggestions` extracted from HTML and stored as jsonb
- [ ] Variant A has `primaryPainPointId: null`
- [ ] Variants B + C have `primaryPainPointId` pointing to source pain point
- [ ] `generationPromptUsed` stored for each variant
- [ ] stdout: `VARIANTS_GENERATED:3`

---

### BC-22 — Create `POST /api/brand-clarity/[projectId]/generate-variants`

**Phase:** 6 — LP Generation
**Deps:** BC-21

**File:** `src/pages/api/brand-clarity/[projectId]/generate-variants.ts`

**Logic:**
1. Auth check
2. Verify ≥ 3 approved pain points
3. Verify `lpStructureJson` not null
4. Spawn `npx tsx scripts/bc-lp-generator.ts` with `BC_PROJECT_ID` + `BC_LP_MODEL`
5. Set `bcProjects.status = 'generating'`
6. Return `{ status: 'generating', projectId }`

**Acceptance criteria:**
- [ ] Returns 400 if < 3 approved pain points
- [ ] Returns 400 if LP not parsed
- [ ] Returns 409 if already generating or done
- [ ] Forwards `BC_LP_MODEL` env to child process

---

### BC-23 — Create Variants API Routes

**Phase:** 6 — LP Generation
**Deps:** BC-08

**Files:**
```
src/pages/api/brand-clarity/[projectId]/variants/index.ts
src/pages/api/brand-clarity/[projectId]/variants/[id].ts
```

**GET list:** `{ id, variantType, variantLabel, isSelected, createdAt, improvementSuggestions }[]` — NO `htmlContent` (performance)

**GET [id]:** Full detail including `htmlContent` and `improvementSuggestions`

**PUT [id]:**
```typescript
body: {
  htmlContent?: string;
  isSelected?: boolean;
  variantLabel?: string;
}
// When isSelected=true: set all other variants for same project to isSelected=false
```

**DELETE [id]:** Remove variant

**Acceptance criteria:**
- [ ] `isSelected: true` auto-deselects all sibling variants
- [ ] GET list does NOT include `htmlContent`
- [ ] `improvementSuggestions` included in both list and detail responses

---

### BC-24 — Create `BcPainPointCard.astro` Component

**Phase:** 7 — Admin UI
**Deps:** BC-06, BC-00

**Pattern:** Mirror `src/components/admin/YtGapCard.astro`
**File:** `src/components/admin/BcPainPointCard.astro`

**Props:**
```typescript
interface Props {
  painPoint: {
    id: number;
    painPointTitle: string;
    painPointDescription: string;
    emotionalIntensity: number;
    frequency: number;
    vocabularyQuotes: string[];
    category: string;
    customerLanguage: string;
    desiredOutcome: string;
    status: string;
  };
  projectId: number;
}
```

**Layout:**
- Title + intensity badge (10=red, 9=orange, 8=gold, <8=gray)
- Category chip
- Description paragraph
- "Customer Language" block — verbatim customer words in a highlighted box
- "Desired Outcome" block
- Vocabulary quotes as inline chips
- Approve → `PUT /api/brand-clarity/{projectId}/pain-points/{id}` `{status:'approved'}`
- Reject → same `{status:'rejected'}`

**Acceptance criteria:**
- [ ] Approve/Reject use `fetch` — no page reload
- [ ] Card fades out after status change (CSS transition)
- [ ] Intensity badge uses project brand colors (gold for 8-9, teal for lower)

---

### BC-25 — Create `/admin/brand-clarity/index.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-11, BC-24

**Content:**
- Title: "Brand Clarity"
- "New Analysis" button → `/admin/brand-clarity/new`
- Projects table: Name | Status | Pain Points | Variants | Created | Actions
  - Status badge color-coded by stage
  - "Open" → smart link to current stage page based on project status
  - Delete button
- Empty state: "No brand clarity projects yet. Start your first analysis."

**Acceptance criteria:**
- [ ] Auth guard (redirect to login)
- [ ] "Open" link routes to correct stage: `draft`/`docs_pending` → `/new` step, `channels_pending` → `/docs`, etc.

---

### BC-26 — Create `/admin/brand-clarity/new.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-10

**Content:**

**Section 1 — Claude Code Prompt Box:**
- Collapsible panel: "Step 0: Prepare your data with Claude Code"
- Full verbatim prompt from `specification.md` Stage 1 Step 1 Prompt
- Copy button
- Instruction: "Run this in Claude Code, then paste the extracted JSON + HTML into the form below"

**Section 2 — Project Creation Form:**
```
Project Name: [text input]

Your existing landing page (HTML or text):
[large textarea — 20 rows]

How you feel your product works:
[medium textarea — 6 rows — 2-5 sentences]

[Create & Analyze →] button
```

- POST to `/api/brand-clarity/projects`
- On success: redirect to `/admin/brand-clarity/{id}/docs`

**Acceptance criteria:**
- [ ] Claude Code prompt in `<pre>` with copy button
- [ ] All three fields required with inline validation
- [ ] Submit button shows "Analyzing…" loading state
- [ ] Redirects to docs step (Step 1.1) after creation

---

### BC-27 — Create `/admin/brand-clarity/[id]/channels.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-14

**Content:**
- Progress stepper (Step 2 active)
- Niche keywords chips from `lpStructureJson.nicheKeywords`
- **Quota info box:** "Channel discovery uses ~301 YouTube API units (of your 10,000/day)"
- "Discover Channels" button → POST discover-channels
- Channels table: Channel | Subscribers | Description | Source | Confirmed | Remove
  - Confirmed toggle → instant PUT
  - Remove → DELETE
- "+ Add Channel Manually" input row
- Counter: "X channels confirmed"
- "Confirm & Discover Videos →" → POST confirm-all

**Acceptance criteria:**
- [ ] Quota info box visible before discovery
- [ ] Confirm toggle makes `PUT` instantly (no reload)
- [ ] Disabled "Confirm & Discover" if 0 channels confirmed
- [ ] On confirm-all success: redirect to `/admin/brand-clarity/{id}/videos`

---

### BC-28 — Create `/admin/brand-clarity/[id]/videos.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-16

**Content:**
- Progress stepper (Step 3 active)
- Summary stats: X videos across Y channels
- Videos grouped by channel — channel name as header
  - Per video card: thumbnail (`https://img.youtube.com/vi/{videoId}/mqdefault.jpg`), title, view count, comment count, YouTube link (opens new tab)
- "Start Comment Scraping →" link → `/admin/brand-clarity/{id}/scrape`

**Acceptance criteria:**
- [ ] Shows message if videos not yet discovered: "Videos not ready — go back to Channels"
- [ ] Video title links open YouTube in new tab

---

### BC-29 — Create `/admin/brand-clarity/[id]/scrape.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-19, BC-20, BC-24

**Pattern:** Mirror `/admin/youtube/index.astro` scraping UI

**Content:**
- Progress stepper (Step 4 active)
- **Model badge**: "Extraction powered by Claude Haiku (cost-optimized)"
- Stats: Comments Scraped | Pain Points Found | Approved | Rejected
- "▶ Start Scraping" → POST `/api/brand-clarity/{projectId}/scrape/start`
- SSE log console (hidden until job starts)
- 2s poll: `GET scrape/status`
- "Auto-filter (reject intensity < 8)" → POST auto-filter
- Three tabs: Pending / Approved / Rejected
  - Each tab renders `BcPainPointCard` components
- "Proceed to Generate Landing Pages →" button (active when ≥ 3 approved)

**Acceptance criteria:**
- [ ] SSE console auto-scrolls to bottom
- [ ] Stats banner updates on poll
- [ ] "Proceed" disabled until ≥ 3 approved
- [ ] Auto-reload after job completes

---

### BC-30 — Create `/admin/brand-clarity/[id]/variants.astro`

**Phase:** 7 — Admin UI
**Deps:** BC-22, BC-23

**Content:**
- Progress stepper (Step 5 active)
- **Model badge**: "Generation powered by Claude Sonnet (quality-optimized)"
- "Generate Landing Pages" button (if not yet generated) → POST generate-variants
- Poll project status while `status === 'generating'` → reload on `done`
- Three-column layout once generated:
  - **Column A:** Founder Vision
  - **Column B:** Pain Point #1 — [pain point title]
  - **Column C:** Pain Point #2 — [pain point title]
  - Each column has three tabs:
    1. **"Improvements"** — shows `improvementSuggestions` as numbered list per section (e.g. "Hero: Consider adding a number-specific outcome")
    2. **"Preview"** — sandboxed iframe using `srcdoc`
    3. **"Edit HTML"** — `<textarea>` that auto-saves via PUT on blur
  - Copy HTML button
  - Download .html button (Blob + createObjectURL)
  - "★ Select This Variant" button

**Acceptance criteria:**
- [ ] Improvements tab populated from `improvementSuggestions` jsonb
- [ ] Preview iframe uses `srcdoc` (no external URL)
- [ ] Edit saves via PUT on textarea blur
- [ ] Selecting a variant stars it and dims others
- [ ] Download works without page navigation

---

### BC-31 — Add Brand Clarity to Admin Navigation

**Phase:** 7 — Admin UI
**Deps:** BC-25

**File to edit:** Check `src/pages/admin/index.astro` or admin layout component for nav links.

Add: `<a href="/admin/brand-clarity">Brand Clarity</a>` — after YouTube Intelligence link.

**Acceptance criteria:**
- [ ] Link appears in admin nav
- [ ] Active state works on `/admin/brand-clarity/*`
- [ ] No existing nav items changed

---

### BC-32 — Document Environment Variables

**Phase:** 8 — Configuration
**Deps:** All previous

**Files to update:** `.env.example` (check if exists), `README.md` env vars section

**New vars to document:**
```ini
# --- BRAND CLARITY ---

# YouTube Data API — ALREADY EXISTS, shared with channel/video discovery
# YOUTUBE_API_KEY=...    ← already set, no new var needed

# Pain point extraction — use CHEAP Haiku (high volume: ~300 calls per run)
BC_ANALYSIS_MODEL=anthropic/claude-haiku-4-5-20251001

# LP parsing + LP generation — use SONNET (precision required)
BC_LP_MODEL=anthropic/claude-sonnet-4-6

# Comment scraping volume config
BC_MAX_COMMENTS_PER_VIDEO=200
BC_COMMENT_CHUNK_SIZE=20
```

**Acceptance criteria:**
- [ ] Comment next to each var explains its purpose and model choice rationale
- [ ] Note that `YOUTUBE_API_KEY` is shared (not duplicated)
- [ ] Note YouTube API quota limit (10,000 units/day)

---

### BC-33 — Create Seed Script `scripts/seed-bc-test-project.ts`

**Phase:** 8 — Configuration
**Deps:** BC-08

**Purpose:** Seed a complete Brand Clarity project with realistic fake data for UI development without real API calls.

**Seed data:**
```typescript
// 1 project: "FocusApp Test" — status: 'done'
//   lpStructureJson with sectionWeaknesses populated
//   projectDocumentation: multi-paragraph product README
// 10 fake channels (channelId: UCtest001..UCtest010, isConfirmed: true)
// 30 fake videos (3 per channel, realistic YouTube IDs)
// 300 fake comments (10 per video, varying lengths)
// 15 fake pain points (mix of intensity 7-10, multiple categories)
// 3 fake LP variants (full HTML with <!-- IMPROVEMENT SUGGESTION --> comments)
//   improvementSuggestions populated for each variant
```

**Acceptance criteria:**
- [ ] Script is idempotent (delete existing test project first, then re-create)
- [ ] Project reaches `done` status
- [ ] Pain points span multiple categories and intensity levels
- [ ] LP variants have `improvementSuggestions` populated for all 6 section types

---

---

### BC-34 — Create Missing `/admin/brand-clarity/[id]/docs.astro` ✅

**Phase:** 9 — Audit Fix
**Deps:** BC-11b
**Status:** Completed during post-implementation audit.

The page was specified in `specification.md` (Stage 1.1) and listed as BC-11c but was not created in the initial implementation pass. Created with:
- Progress stepper (Step 1.1 active)
- Live word count on textarea (JS `input` event)
- Save → `PUT /api/brand-clarity/projects/{id}/documentation` → re-parses LP
- Skip → navigates directly to channels page without saving docs
- `define:vars={{ projectId }}` for server-to-client variable injection

---

### BC-35 — Fix Pain Points GET: Move Status Filter to DB WHERE Clause ✅

**Phase:** 9 — Audit Fix
**Deps:** BC-20
**Status:** Completed during post-implementation audit.

**Problem:** `GET /api/brand-clarity/[projectId]/pain-points` originally fetched ALL rows for a project then filtered by `status` in JavaScript, causing unnecessary data transfer for large pain point sets.

**Fix:** Moved filter into Drizzle `where()` using `and()`:
```typescript
const condition = statusFilter && statusFilter !== 'all'
  ? and(eq(bcExtractedPainPoints.projectId, projectId), eq(bcExtractedPainPoints.status, statusFilter))
  : eq(bcExtractedPainPoints.projectId, projectId);
```

---

### BC-36 — Remove Unused `and` Import from `auto-filter.ts` ✅

**Phase:** 9 — Audit Fix
**Deps:** BC-20
**Status:** Completed during post-implementation audit.

`pain-points/auto-filter.ts` imported `and` from `drizzle-orm` but only used `eq`. Removed unused import.

---

## Definition of Done for Brand Clarity Module

The module is complete when all 35+ tasks (BC-00 through BC-33 + BC-11b + BC-11c) are checked off and:

1. A new Brand Clarity project can be created end-to-end:
   - LP parsed (Sonnet) → docs saved → channels discovered (YouTube API, quota-managed) → videos discovered → comments scraped (Apify) → pain points extracted (Haiku) → pain points reviewed → 3 LP variants generated (Sonnet) with improvement suggestions
2. All admin UI pages render without errors, including new Step 1.1 docs page
3. Progress stepper shows 6 steps correctly
4. Model badges visible on scrape and variants pages
5. Improvements panel populated in variants page
6. Existing YouTube Intelligence module is untouched (zero regressions)
7. New env vars documented with cost rationale
8. Seed data allows full UI preview without any API keys
