# Brand Clarity Module — Full Specification

## Overview

**Brand Clarity** is a new FrinterHero module that turns a founder's existing landing page, their raw feeling-based product description, and their full project documentation into three emotionally optimized landing page variants — grounded in real customer pain points extracted from YouTube comment sections.

The module operates in six sequential stages:

| Stage | Input | Output |
|-------|-------|--------|
| 1. LP Ingestion | Existing LP + founder description | Structured LP JSON + clean HTML template |
| **1.1. Project Documentation** | **Full project docs (README, spec, feature list)** | **`projectDocumentation` stored, enriches all LLM calls** |
| 2. Channel Discovery | Niche keywords from LP | 10 YouTube channels (manual review) |
| 3. Video Discovery | 10 channels | 30 target videos (3 per channel, via YouTube Data API) |
| 4. Comment Scraping | 30 videos | Pain points (emotion-intensity ≥ 8) |
| 5. LP Generation | LP structure + docs + pain points | 3 landing page variants with improvement suggestions |

**Critical constraint:** this module is a standalone addition. The existing YouTube Intelligence module (`ytTargets`, `ytScrapeRuns`, `ytComments`, `ytExtractedGaps`) must NOT be touched.

---

## LLM Cost Optimization

Heavy lifting (bulk comment processing) uses cheap Haiku. Precision work (LP analysis + LP generation) uses Sonnet.

| Operation | Model | Reason |
|-----------|-------|--------|
| LP structure extraction (`bc-lp-parser.ts`) | `claude-sonnet-4-6` | Structural + semantic precision matters |
| Pain point extraction from comments (`bc-scraper.ts`) | `claude-haiku-4-5-20251001` | High volume — 300+ LLM calls per run, cheap |
| LP variant generation (`bc-lp-generator.ts`) | `claude-sonnet-4-6` | Most important output — quality is critical |

**Cost estimate per full Brand Clarity run:**
- Pain point extraction: 30 videos × 200 comments ÷ 20 (chunk size) = **300 Haiku calls**
- LP parsing: **1 Sonnet call**
- LP generation: **3 Sonnet calls** (one per variant)

---

## YouTube Data API Quota Management

**This project already has `YOUTUBE_API_KEY` configured** — reuse the existing env var. Do NOT create a new API key.

**Quota: 10,000 units/day (shared across all API calls in the project)**

Budget per Brand Clarity run:

| Operation | API Call | Units |
|-----------|----------|-------|
| Channel search × 3 keywords | `search.list` × 3 | 300 |
| Channel stats batch (all candidates) | `channels.list` × 1 | 1 |
| Video search × 10 confirmed channels | `search.list` × 10 | 1,000 |
| Video stats batch (all videos at once) | `videos.list` × 1 | 1 |
| Comment scraping × 30 videos × ~2 pages | `commentThreads.list` × 60 | 60 |
| Manual channel lookup (per add) | `channels.list` × N | N |

**Total per run: ~1,362 units → ~7 full runs per day before quota.**

**Implementation rules (enforce in code):**
1. `maxResults: 20` max on all `search.list` calls — never more (costs same quota regardless)
2. **Batch all `channels.list` calls** — one API call for all 15 candidates, not per-channel
3. **Batch all `videos.list` calls** — one call per channel batch, not per-video
4. **Cache channels** — if `bcTargetChannels` already has rows for this project, skip discovery
5. On quota exhaustion (HTTP 403 `quotaExceeded`): log error, exit 1, surface clear message in UI

---

## Stage 1: Landing Page Ingestion

### User Input

The user provides two things:

1. **Existing landing page** — full HTML or plain text of their current landing page.
2. **Founder vision statement** — 2–5 sentences written in their own words describing what the product does, who it is for, and why it matters to them emotionally.

### Step 1 Prompt for Claude Code

The following prompt is designed to be pasted into Claude Code **before** filling in the Brand Clarity form. It extracts a structured LP JSON and generates a clean HTML template that will serve as the structural base (and improvement guide) for all three generated landing page variants.

---

```
You are a landing page architect and conversion copywriter.

I will give you:
1. My existing landing page (HTML or text)
2. My full project documentation (README, product spec, features, etc.)
3. A short description of how I feel my product works

Your job is to do two things:

TASK 1 — Extract the landing page structure as a JSON object with these exact fields:

{
  "headline": "main hero headline (verbatim from LP)",
  "subheadline": "supporting line or tagline",
  "targetAudience": "who is this explicitly for",
  "corePromise": "the transformation or outcome the product promises",
  "problemStatement": "the central problem being solved",
  "solutionMechanism": "how the product solves the problem (the 'how')",
  "features": [
    { "name": "feature name", "description": "1-sentence description" }
  ],
  "benefitStatements": ["outcome-oriented benefit 1", "outcome-oriented benefit 2"],
  "socialProof": ["testimonial or stat 1 (verbatim)", "testimonial or stat 2 (verbatim)"],
  "primaryCTA": "call to action button text",
  "secondaryCTA": "secondary CTA text if present (or null)",
  "toneKeywords": ["adjective1", "adjective2", "adjective3"],
  "brandVoiceNotes": "1-2 sentences describing the brand's voice and personality",
  "sectionOrder": ["hero", "problem", "solution", "features", "social_proof", "cta"],
  "nicheKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "founderVision": "distilled 1-sentence version of the founder's own description",
  "sectionWeaknesses": {
    "hero": "1 sentence on the biggest conversion weakness in this section, or null",
    "problem": "1 sentence, or null",
    "solution": "1 sentence, or null",
    "features": "1 sentence, or null",
    "social_proof": "1 sentence, or null",
    "cta": "1 sentence, or null"
  }
}

TASK 2 — Generate a clean, improved landing page in full HTML that:
- Uses the EXACT same section order as the original (use sectionOrder above)
- Preserves the brand voice and tone exactly
- Each section uses semantic HTML5 tags with clear class names (e.g. <section class="hero">, <section class="problem">)
- Keeps all original content but sharpens clarity and emotional resonance
- Does NOT add new sections that don't exist in the original
- Includes placeholder comments like <!-- PAIN POINT HOOK GOES HERE --> inside the hero and problem sections
- Includes CRO weakness notes as HTML comments: <!-- CRO NOTE: {sectionWeaknesses.hero} --> at the top of each section

--- MY LANDING PAGE ---
[PASTE LANDING PAGE HTML OR TEXT HERE]

--- MY FULL PROJECT DOCUMENTATION ---
[PASTE YOUR README, PRODUCT SPEC, FEATURE LIST, OR ANY DOCS HERE]

--- HOW I FEEL MY PRODUCT WORKS ---
[2-5 SENTENCES IN YOUR OWN WORDS]

Output the JSON first (inside ```json block), then the full HTML (inside ```html block).
```

---

### Structured LP JSON Storage

Once the Claude Code prompt output is received, the user pastes it into the Brand Clarity project creation form. The system stores:

- `lpStructureJson` — the full extracted JSON (including `sectionWeaknesses`)
- `lpTemplateHtml` — the clean HTML template with `<!-- PAIN POINT HOOK -->` and `<!-- CRO NOTE -->` comments
- `founderVision` — the founder's raw description
- `nicheKeywords` — extracted keyword array (used for channel discovery in Stage 2)

**Database table:** `bcProjects`

---

## Stage 1.1: Project Documentation

### Purpose

After the LP is parsed, the user pastes their **complete project documentation** — README files, product specs, feature changelogs, technical architecture, anything that describes *exactly what the product IS* (not just what it feels like).

This documentation is the factual anchor for all downstream LLM operations. It ensures:
- Pain point extraction aligns with real product capabilities
- LP variants accurately describe actual features (not vague promises)
- Variant A (Founder Vision) reflects what the product genuinely does, not just the founder's feelings

### What to paste here

Examples of valuable documentation:
- `README.md` — high-level product description
- Product specification docs
- Feature list / changelog
- Onboarding guide
- "How it works" internal document
- Any text describing the product's real mechanics, not marketing copy

### Storage

Stored as `projectDocumentation text` in `bcProjects`.

Used in all three LLM calls:
1. `bc-lp-parser.ts` (Sonnet) — enriches niche keyword extraction and `solutionMechanism` field
2. `bc-lp-generator.ts` (Sonnet) — injected as system context, ensures variants describe real features

### Admin UI

Page: `/admin/brand-clarity/[id]/docs`
- Progress stepper (Step 1.1 active)
- Single large `<textarea>` labeled "Paste your full project documentation here"
- Helper text: "Paste README, product spec, feature list — anything that describes WHAT your product actually is and does"
- "Save & Continue to Channel Discovery →" button
- Field is optional (can skip), but shows warning: "Skipping this step may reduce LP accuracy"

---

## Stage 2: YouTube Channel Discovery

### Input

- `nicheKeywords` from LP structure JSON
- `projectDocumentation` from Stage 1.1 (helps refine keyword context)
- Optional: additional keywords provided by user in UI

### YouTube Data API Integration

Uses the **existing `YOUTUBE_API_KEY`** already configured in the project. Calls YouTube Data API v3 `search.list`.

```
Search strategy (quota-optimized):
- Run 3 separate search.list calls (one per top niche keyword) — 300 units total
- type: channel
- maxResults: 20 per query (never higher — same quota cost)
- Collect all results, deduplicate by channelId
- Batch one channels.list call for ALL candidates (1 unit)
- Filter: subscriberCount > 10,000
- Rank: API relevance order (first result = highest relevance)
- Present top 15 to user for manual review
```

### Manual Review

The discovered channels are shown in the admin UI for human review before proceeding. The user can:

- **Confirm** a channel (keep it in the list)
- **Remove** a channel
- **Add** a channel manually (paste channel URL or @handle)
- **Reorder** channels (priority affects video selection weighting)

The system proceeds to Stage 3 only when at least 1 channel is confirmed (no strict 10-channel minimum — flexible).

**Database table:** `bcTargetChannels`

---

## Stage 3: Video Discovery (YouTube Data API)

### Input

- Confirmed `bcTargetChannels`
- `nicheKeywords` from LP structure

### Process (quota-optimized)

For each confirmed channel, one `search.list` call (100 units each):

```
Per channel:
- 1× search.list: channelId={channelId}, q={top3keywords}, type=video,
  videoDuration=medium (4-20min) OR long (>20min), order=relevance, maxResults=10
- Score candidates: apiRank (primary) × view_engagement (secondary)
- Select top 3
- Batch all videoIds into ONE videos.list call per channel (1 unit)
- Insert into bcTargetVideos
```

Result: up to **30 target videos** across 10 channels.

**Total quota for Stage 3:** 10 channels × 100 units = 1,000 units (batched stats = ~10 units)

**Database table:** `bcTargetVideos` (linked to `bcTargetChannels`)

---

## Stage 4: Comment Scraping & Pain Point Extraction

### Comment Scraping

Uses the **existing YouTube Data API v3 `commentThreads.list` endpoint** — same integration as `scripts/yt-scraper.ts`. No new API setup needed; reuses `YOUTUBE_API_KEY`.

```
Per video — YouTube API commentThreads.list:
- videoId: {videoId}
- order: relevance (top comments first)
- maxResults: 100 per page
- textFormat: plainText
- Paginate until maxComments reached or no more pages
- Cost: 1 unit per page request (very cheap vs search.list)
```

Comments are filtered before LLM analysis:
- Top-level only (`replyToCid` is null)
- Length ≥ 15 characters
- Deduplicated by `commentId` within project scope
- Skip if video has comments disabled (HTTP 403 — non-fatal)

**Database table:** `bcComments` (linked to `bcTargetVideos` and `bcProjectId`)

### Pain Point Extraction (Haiku — cost-optimized)

Uses **Claude Haiku** (`claude-haiku-4-5-20251001`) via OpenRouter for bulk extraction. This is the heavy-lifting stage — up to 300 LLM calls per run. Using Haiku here reduces cost by ~95% vs Sonnet with acceptable quality for extraction tasks.

Chunks of 20 comments per LLM call.

#### Extraction Prompt (Haiku)

```
You are a consumer psychologist. Extract the most emotionally intense pain points from these YouTube comments.

COMMENTS:
{comments_block}

Return a JSON array. Each item:
{
  "painPointTitle": "max 8 words, emotional and specific",
  "painPointDescription": "2-3 sentences describing the struggle",
  "emotionalIntensity": 1-10,
  "frequency": number of comments expressing this pain,
  "vocabularyQuotes": ["exact quote 1", "exact quote 2"],
  "category": "focus|energy|burnout|relationships|systems|productivity|identity|mindset|health",
  "customerLanguage": "exact words customers use for this problem",
  "desiredOutcome": "what they would pay anything to have instead"
}

Only include items with emotionalIntensity >= 8.
Return [] if no strong pain points found.
```

### Auto-Filtering

After extraction, `brandFilter.ts` is applied:
- `emotionalIntensity < 8` → rejected
- Any `OFF_BRAND_KEYWORDS` match → rejected
- `painPointTitle.length < 15` → rejected

**Database table:** `bcExtractedPainPoints` (linked to `bcProjectId`)

---

## Stage 5: Landing Page Variant Generation

### Input

- `lpStructureJson` from Stage 1 — section order, tone, features, CTA, `sectionWeaknesses`
- `lpTemplateHtml` from Stage 1 — structural base with CRO notes
- `projectDocumentation` from Stage 1.1 — factual product anchor
- `founderVision` from Stage 1
- Approved `bcExtractedPainPoints` sorted by `emotionalIntensity DESC`

### Three Variant Strategy

| Variant | Strategy | Primary Input |
|---------|----------|---------------|
| **Variant A — Founder Vision** | Positioned around the founder's authentic understanding of the product, grounded in real documentation | `founderVision` + `projectDocumentation` + LP structure |
| **Variant B — Pain Point #1** | Hero + problem block rewritten around top pain point cluster | Top pain points cluster 1 + `projectDocumentation` |
| **Variant C — Pain Point #2** | Same as B but for second dominant pain point cluster (different category) | Top pain points cluster 2 + `projectDocumentation` |

**All three variants MUST:**
- Follow the exact `sectionOrder` from the LP structure JSON
- Use the same `toneKeywords` and `brandVoiceNotes`
- Accurately describe the product's real features (grounded by `projectDocumentation`)
- Use customer vocabulary from `vocabularyQuotes` fields
- Replace `<!-- PAIN POINT HOOK GOES HERE -->` placeholders with relevant pain-point language
- Include `<!-- IMPROVEMENT SUGGESTION: {suggestion} -->` HTML comments at the top of each section, derived from `sectionWeaknesses`
- Output full, complete, ready-to-use HTML

**Improvement suggestions format in output HTML:**
```html
<section class="hero">
  <!-- IMPROVEMENT SUGGESTION: Headline is too generic — test a number-specific outcome (e.g. "Cut your distraction time by 60%") -->
  <h1>...</h1>
</section>
<section class="social_proof">
  <!-- IMPROVEMENT SUGGESTION: Section is currently missing — add 2-3 testimonials from beta users before launch -->
  ...
</section>
```

### LP Generation Prompt (Sonnet)

```
You are a world-class conversion copywriter with deep knowledge of CRO (conversion rate optimization).

You will write a complete landing page in HTML for a real product. You have access to the full product documentation — use it to ensure every claim is accurate and every feature mentioned is real.

PRODUCT DOCUMENTATION (source of truth for features and mechanics):
{projectDocumentation}

CONSTRAINTS — follow exactly:
1. Section order: {sectionOrder}
2. Brand tone: {toneKeywords} — {brandVoiceNotes}
3. Features (describe accurately based on documentation above): {features}
4. Primary CTA: {primaryCTA}
5. Mirror this HTML structure: {lpTemplateHtml}
6. At the top of each section, add an HTML comment: <!-- IMPROVEMENT SUGGESTION: {sectionWeaknesses[section]} --> (use the weakness data to give actionable suggestions; if weakness is null, suggest a general CRO improvement for that section type)

VARIANT TYPE: {variant_type}

--- FOR VARIANT A (Founder Vision) ---
Write from the founder's perspective of how the product genuinely helps people.
Founder's vision: {founderVision}
Ground every claim in the product documentation above.
Use emotional, authentic language that feels personal and real.

--- FOR VARIANT B or C (Pain Point Based) ---
Write as if you intimately understand this specific struggle:
Pain point: {painPointTitle}
Description: {painPointDescription}
Customer language (use verbatim): {customerLanguage}
Vocabulary quotes to weave in: {vocabularyQuotes}
Desired outcome (what the LP promises to deliver): {desiredOutcome}

Headline and subheadline must immediately speak to this exact pain.
Problem section must validate this struggle with emotional depth.
Solution section must position the product — using its REAL features from the documentation — as the precise answer.

OUTPUT: Full landing page HTML only. No explanations. No markdown. Just the HTML.
```

### Variant Storage & Review

The three variants are shown side-by-side in the admin UI. For each variant the user can:
- Preview rendered HTML in sandboxed iframe
- See the inline `<!-- IMPROVEMENT SUGGESTION -->` comments highlighted in an "Improvements" panel
- Edit the HTML directly in a code editor panel
- Copy to clipboard
- Download as `.html`
- Mark as "selected" (the winner)

**Database table:** `bcLandingPageVariants`

---

## Database Schema

### `bcProjects`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name` | varchar(255) | Project/brand name |
| `founderDescription` | text | Raw founder feeling description |
| `founderVision` | text | LLM-distilled 1-sentence version |
| `projectDocumentation` | text | Full project docs pasted in Stage 1.1 (nullable) |
| `lpRawInput` | text | Original LP HTML/text pasted by user |
| `lpStructureJson` | jsonb | Extracted LP structure JSON (includes sectionWeaknesses) |
| `lpTemplateHtml` | text | Clean structural HTML template with CRO comments |
| `nicheKeywords` | jsonb | String array |
| `status` | varchar(50) | draft / docs_pending / channels_pending / videos_pending / scraping / pain_points_pending / generating / done |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Valid `status` flow:** `draft` → `docs_pending` → `channels_pending` → `videos_pending` → `scraping` → `pain_points_pending` → `generating` → `done`

### `bcTargetChannels`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `projectId` | integer FK → bcProjects | ON DELETE CASCADE |
| `channelId` | varchar(100) | YouTube channel ID |
| `channelHandle` | varchar(100) | @handle |
| `channelName` | varchar(255) | Display name |
| `channelUrl` | text | Full URL |
| `subscriberCount` | integer | At time of discovery |
| `description` | text | Channel description snippet |
| `discoveryMethod` | varchar(50) | auto / manual |
| `isConfirmed` | boolean | default false |
| `sortOrder` | integer | For reordering |
| `createdAt` | timestamp | |

### `bcTargetVideos`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `projectId` | integer FK → bcProjects | ON DELETE CASCADE |
| `channelId` | integer FK → bcTargetChannels | ON DELETE CASCADE |
| `videoId` | varchar(50) | YouTube video ID |
| `videoUrl` | text | Full watch URL |
| `title` | varchar(500) | |
| `description` | text | Snippet |
| `viewCount` | integer | At time of discovery |
| `commentCount` | integer | At time of discovery |
| `publishedAt` | timestamp | |
| `relevanceScore` | real | 0.0–1.0, from API ranking |
| `createdAt` | timestamp | |

### `bcComments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `projectId` | integer FK → bcProjects | ON DELETE CASCADE |
| `videoId` | integer FK → bcTargetVideos | ON DELETE CASCADE |
| `commentId` | varchar(100) | YouTube comment ID — unique per project |
| `commentText` | text | |
| `voteCount` | integer | Likes on comment |
| `author` | varchar(255) | |
| `publishedAt` | timestamp | |
| `scrapedAt` | timestamp | default now() |

### `bcExtractedPainPoints`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `projectId` | integer FK → bcProjects | ON DELETE CASCADE |
| `painPointTitle` | varchar(255) | |
| `painPointDescription` | text | |
| `emotionalIntensity` | integer | 1–10 |
| `frequency` | integer | Comments expressing this pain |
| `vocabularyQuotes` | jsonb | String array |
| `category` | varchar(50) | focus/energy/burnout/etc. |
| `customerLanguage` | text | |
| `desiredOutcome` | text | |
| `status` | varchar(50) | pending / approved / rejected |
| `sourceVideoIds` | jsonb | Array of bcTargetVideos.id |
| `createdAt` | timestamp | |

### `bcLandingPageVariants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `projectId` | integer FK → bcProjects | ON DELETE CASCADE |
| `variantType` | varchar(50) | founder_vision / pain_point_1 / pain_point_2 |
| `variantLabel` | varchar(255) | Human readable label |
| `htmlContent` | text | Full rendered HTML with improvement comments |
| `improvementSuggestions` | jsonb | Extracted suggestions per section for UI panel |
| `primaryPainPointId` | integer FK → bcExtractedPainPoints | null for founder_vision |
| `generationPromptUsed` | text | Full prompt sent to LLM |
| `generationModel` | varchar(100) | Model ID used |
| `isSelected` | boolean | default false |
| `createdAt` | timestamp | |

---

## API Routes

All routes require session auth. Base path: `/api/brand-clarity`

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/brand-clarity/projects` | List all projects |
| POST | `/api/brand-clarity/projects` | Create new project |
| GET | `/api/brand-clarity/projects/[id]` | Get project detail |
| PUT | `/api/brand-clarity/projects/[id]` | Update project fields |
| DELETE | `/api/brand-clarity/projects/[id]` | Delete project + cascade |
| PUT | `/api/brand-clarity/projects/[id]/documentation` | Save project documentation (Stage 1.1) |

### Channels

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/brand-clarity/[projectId]/discover-channels` | Trigger YouTube channel discovery |
| GET | `/api/brand-clarity/[projectId]/channels` | List channels for project |
| POST | `/api/brand-clarity/[projectId]/channels` | Manually add channel |
| PUT | `/api/brand-clarity/[projectId]/channels/[id]` | Update channel (isConfirmed, sortOrder) |
| DELETE | `/api/brand-clarity/[projectId]/channels/[id]` | Remove channel |
| POST | `/api/brand-clarity/[projectId]/channels/confirm-all` | Confirm selection + proceed to Stage 3 |

### Videos

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/brand-clarity/[projectId]/discover-videos` | Trigger video discovery |
| GET | `/api/brand-clarity/[projectId]/videos` | List all target videos |

### Scraping

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/brand-clarity/[projectId]/scrape/start` | Start comment scraping job |
| GET | `/api/brand-clarity/[projectId]/scrape/status` | Poll job status |
| GET | `/api/brand-clarity/[projectId]/scrape/stream` | SSE log stream |

### Pain Points

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/brand-clarity/[projectId]/pain-points` | List pain points (filter: status, category) |
| PUT | `/api/brand-clarity/[projectId]/pain-points/[id]` | Approve / reject / edit |
| DELETE | `/api/brand-clarity/[projectId]/pain-points/[id]` | Delete pain point |
| POST | `/api/brand-clarity/[projectId]/pain-points/auto-filter` | Auto-reject off-brand / low intensity |

### LP Generation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/brand-clarity/[projectId]/generate-variants` | Generate all 3 LP variants |
| GET | `/api/brand-clarity/[projectId]/variants` | List LP variants |
| GET | `/api/brand-clarity/[projectId]/variants/[id]` | Get variant detail (incl. htmlContent) |
| PUT | `/api/brand-clarity/[projectId]/variants/[id]` | Update variant HTML or isSelected |
| DELETE | `/api/brand-clarity/[projectId]/variants/[id]` | Delete variant |

---

## Admin UI Pages

### Page Map

```
/admin/brand-clarity/                      → Project list + "New Project" button
/admin/brand-clarity/new                   → Step 1: LP input form + Claude Code prompt display
/admin/brand-clarity/[id]/docs             → Step 1.1: Project documentation paste
/admin/brand-clarity/[id]/channels         → Step 2: Channel discovery + manual review
/admin/brand-clarity/[id]/videos           → Step 3: Video list (auto-generated, read-only)
/admin/brand-clarity/[id]/scrape           → Step 4: Scraping job + pain points review
/admin/brand-clarity/[id]/variants         → Step 5: LP variants side-by-side view
```

### Step-by-Step Flow UI (Progress Stepper)

```
[1. LP Input] → [1.1 Docs] → [2. Channels] → [3. Videos] → [4. Pain Points] → [5. Variants]
```

Current step is highlighted. Completed steps are checkmarked. Future steps locked until prerequisites met.

### Project Documentation Page (`/admin/brand-clarity/[id]/docs`)

- Progress stepper (Step 1.1 active)
- Header: "Step 1.1 — Project Documentation"
- Explanation block: "Paste everything that describes WHAT your product actually IS — README, product spec, feature list, how-it-works guides. This will be used to ground all AI-generated landing pages in factual accuracy."
- Large `<textarea>` (40 rows)
- Current word count indicator
- "Skip this step →" link (sets status to `channels_pending` without saving docs, shows warning icon on subsequent pages)
- "Save & Discover Channels →" button → PUT `/api/brand-clarity/[id]/documentation`

### Channel Review Page (`/admin/brand-clarity/[id]/channels`)

- Progress stepper (Step 2 active)
- Left sidebar: niche keywords chips from `lpStructureJson.nicheKeywords`
- **Quota indicator**: "YouTube API: ~1,302 units will be used for this discovery"
- "Discover Channels" button → POST discover-channels
- Channels table: Channel Name | Subscribers | Description | Source | Confirmed | Remove
  - Confirmed toggle per row
  - Remove button per row
  - "+ Add Channel Manually" input
- Counter: "X channels confirmed"
- "Confirm & Discover Videos →" button (active when ≥ 1 confirmed)

### Pain Points Review Page (`/admin/brand-clarity/[id]/scrape`)

- SSE console log panel (hidden until job runs)
- Stats: Comments Scraped | Pain Points Found | Approved | Rejected
- **Model badge**: "Extraction: Haiku (cost-optimized)"
- Three tab groups: Pending / Approved / Rejected
- Each card: title, intensity badge, category, customer language, desired outcome, vocabulary quotes, approve/reject buttons
- "Auto-filter (reject < 8 intensity)" button
- "Proceed to Generate →" button (active when ≥ 3 approved pain points)

### LP Variants Page (`/admin/brand-clarity/[id]/variants`)

- Progress stepper (Step 5 active)
- **Model badge**: "Generation: Sonnet (quality-optimized)"
- "Generate Landing Pages" button → POST generate-variants
- Three-column layout once generated:
  - **Column A:** "Founder Vision" variant
  - **Column B:** "Pain Point Focus #1"
  - **Column C:** "Pain Point Focus #2"
  - Each column:
    - Variant label + source badge
    - **"Improvements" tab**: shows extracted improvement suggestions per section as a numbered list
    - "Preview" tab: rendered HTML in sandboxed iframe
    - "Edit HTML" tab: `<textarea>` with full HTML
    - Copy to clipboard / Download .html buttons
    - "★ Select This Variant" button

---

## Scripts

### `scripts/bc-lp-parser.ts`

- **Model:** `claude-sonnet-4-6`
- Input env: `BC_PROJECT_ID`
- Reads `lpRawInput` + `founderDescription` + `projectDocumentation` (if set) from DB
- Builds prompt with all three inputs
- Parses JSON + HTML from response
- Writes back: `lpStructureJson` (with `sectionWeaknesses`), `lpTemplateHtml`, `founderVision`, `nicheKeywords`
- Sets `bcProjects.status = 'channels_pending'`
- stdout: `LP_PARSE_RESULT:{"success":true,"nicheKeywordsFound":5}`

### `scripts/bc-channel-discovery.ts`

- **No LLM** — YouTube Data API only
- Uses existing `YOUTUBE_API_KEY`
- Quota-optimized: max 3 `search.list` calls + 1 `channels.list` batch = ~301 units
- Input env: `BC_PROJECT_ID`
- stdout: `CHANNELS_FOUND:15`

### `scripts/bc-video-discovery.ts`

- **No LLM** — YouTube Data API only
- Uses existing `YOUTUBE_API_KEY`
- Quota-optimized: N `search.list` + N `videos.list` batches (N = confirmed channels)
- Input env: `BC_PROJECT_ID`
- stdout: `VIDEOS_FOUND:30`

### `scripts/bc-scraper.ts`

- **Model:** `claude-haiku-4-5-20251001` (cost-optimized bulk extraction)
- Mirrors `scripts/yt-scraper.ts` architecture exactly
- Uses **YouTube Data API v3 `commentThreads.list`** (same as yt-scraper.ts, same `YOUTUBE_API_KEY`)
- Input env: `BC_PROJECT_ID`, `BC_MAX_COMMENTS_PER_VIDEO`, `BC_COMMENT_CHUNK_SIZE`, `YOUTUBE_API_KEY`
- stdout protocol: `commentsCollected:N`, `painPointsExtracted:N`, `RESULT_JSON:{...}`

### `scripts/bc-lp-generator.ts`

- **Model:** `claude-sonnet-4-6` (quality-critical)
- Input env: `BC_PROJECT_ID`
- Loads: `lpStructureJson`, `lpTemplateHtml`, `projectDocumentation`, `founderVision`, approved pain points
- Clusters pain points by category + intensity
- Generates 3 variants via 3 sequential Sonnet calls
- Extracts improvement suggestions from HTML comments into `improvementSuggestions` jsonb
- stdout: `VARIANTS_GENERATED:3`

---

## Environment Variables (New)

```ini
# YouTube Data API — ALREADY EXISTS IN PROJECT, reuse this key
# YOUTUBE_API_KEY=...   ← already configured, shared with yt-scraper.ts, do NOT add new var
# Quota: 10,000 units/day — each Brand Clarity full run uses ~1,362 units (~7 runs/day max)

# Brand Clarity — Pain Point Extraction (bulk, use cheap Haiku)
BC_ANALYSIS_MODEL=anthropic/claude-haiku-4-5-20251001
BC_MAX_COMMENTS_PER_VIDEO=200
BC_COMMENT_CHUNK_SIZE=20

# Brand Clarity — LP Parsing + Generation (quality-critical, use Sonnet)
BC_LP_MODEL=anthropic/claude-sonnet-4-6
```

**SSR note:** The Astro project uses `output: 'server'` globally, so all admin pages are SSR by default. No `export const prerender = false` is needed on individual Brand Clarity pages.

Note: `OPENROUTER_API_KEY` is shared from existing configuration. `YOUTUBE_API_KEY` is also shared (same key used by Brand Clarity channel/video/comment scripts and existing YouTube Intelligence module).

---

## Key Differences vs Existing YouTube Module

| Aspect | YouTube Intelligence | Brand Clarity |
|--------|---------------------|---------------|
| Purpose | Find content gaps for articles | Generate optimized LP variants |
| Target input | Manual video/channel URLs | Auto-discovered from LP niche keywords |
| Channel discovery | Manual | YouTube Data API (quota-managed) + manual review |
| Video discovery | Manual | YouTube Data API (quota-managed) |
| Number of videos | Unlimited | Up to 30 (3 per confirmed channel) |
| Comment scraping | YouTube API `commentThreads.list` | YouTube API `commentThreads.list` (same env var) |
| LLM for extraction | Sonnet | **Haiku** (cost optimization) |
| LLM for generation | N/A | **Sonnet** (LP variants) |
| Output | `contentGaps` → articles | `bcLandingPageVariants` → HTML with improvement suggestions |
| Project scope | Global | Per-project (scoped brand analysis) |
| LP input | None | Core input (Step 1) |
| Product docs | None | Step 1.1 — factual anchor for all LLM calls |
| Stages | 1 | 6 sequential stages with manual gates |
