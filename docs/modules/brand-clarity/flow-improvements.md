# Brand Clarity v2 — Complete Flow + Improvements

## Overview

Brand Clarity is a 5-stage pipeline that turns a raw landing page into
3 conversion-optimised LP variants grounded in real customer language.

The core insight driving v2: **existing LPs don't fail because of bad design —
they fail because they use founder language, not customer language.** The fix is
to source copy directly from YouTube comments (Voice of Customer), cluster
recurring pain themes, then generate variants that mirror exactly what customers
already say to themselves.

---

## Full Pipeline — ASCII Map

```
  BRAND CLARITY PIPELINE v2
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  INPUT: LP Content (YAML from AI agent) + Project Name                   │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 1 — LP INGESTION & KEYWORD EXTRACTION        [SONNET]     │   │
  │  │                                                                  │   │
  │  │  · Admin downloads AI agent prompt (.md)                         │   │
  │  │  · Agent (Claude/ChatGPT) visits LP, returns structured YAML     │   │
  │  │  · Admin uploads YAML file → bc-lp-parser.ts processes it       │   │
  │  │  · Sonnet parses: product name, niche, unique value prop         │   │
  │  │  · Sonnet generates: nicheKeywords (up to 6 search terms)        │   │
  │  │  · Sonnet extracts: featureMap from projectDocumentation         │   │
  │  │    { featureName, whatItDoes, userBenefit }[]                    │   │
  │  │  · Admin can edit nicheKeywords in keyword chip editor           │   │
  │  │                                                                  │   │
  │  │  NOTE: audiencePainKeywords dropped from Stage 1 — not useful    │   │
  │  │  for video discovery before VoC data is collected                │   │
  │  │                                                                  │   │
  │  │  Script: bc-lp-parser.ts          DB: bcProjects updated         │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 2 — CHANNEL DISCOVERY                      [NO LLM]      │   │
  │  │                                                                  │   │
  │  │  AUTO DISCOVERY:                                                  │   │
  │  │  · YouTube Data API v3: search.list × nicheKeywords (up to 6)   │   │
  │  │  · Filters: >10k subscribers, dedup by channelId                 │   │
  │  │  · Stores top 15 channel candidates                              │   │
  │  │                                                                  │   │
  │  │  MANUAL ADD (any of these formats):                              │   │
  │  │  · https://youtube.com/@handle                                   │   │
  │  │  · @handle                                                       │   │
  │  │  · UCxxxxxxx (channel ID)                                        │   │
  │  │  → resolve-channel.ts calls channels.list, returns full data     │   │
  │  │                                                                  │   │
  │  │  · Admin confirms channels → confirmed = eligible for Stage 3    │   │
  │  │  · Run log panel shows script output inline                      │   │
  │  │                                                                  │   │
  │  │  Script: bc-channel-discovery.ts  DB: bcTargetChannels inserted  │   │
  │  │  API:    POST /resolve-channel    resolves YT URL → channel data  │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                         [admin confirms]                                 │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 3 — VIDEO DISCOVERY                        [NO LLM]      │   │
  │  │                                                                  │   │
  │  │  PASS 1 — keyword search per channel                             │   │
  │  │  · YouTube search.list: channelId + nicheKeywords (joined)       │   │
  │  │  · No duration filter — any length accepted                      │   │
  │  │  · Order: relevance, up to 10 candidates                         │   │
  │  │                                                                  │   │
  │  │  FALLBACK (if keyword search returns 0 results):                 │   │
  │  │  · search.list: channelId, order: viewCount, no query            │   │
  │  │  · Gets channel's most popular videos regardless of topic        │   │
  │  │                                                                  │   │
  │  │  NOTE: Pass 2 (audiencePainKeywords) removed — pain keywords     │   │
  │  │  don't exist yet at this stage; VoC not yet collected            │   │
  │  │                                                                  │   │
  │  │  SCORING (per video):                                            │   │
  │  │  · rankScore    = position in search results    (weight: 0.7)    │   │
  │  │  · engageScore  = comment count > 100 → +0.30                   │   │
  │  │  · Top 3 per channel inserted                                    │   │
  │  │  · Run log panel shows per-channel progress inline               │   │
  │  │                                                                  │   │
  │  │  Script: bc-video-discovery.ts    DB: bcTargetVideos inserted    │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 4 — COMMENT SCRAPING + PAIN EXTRACTION     [HAIKU x N]   │   │
  │  │                                                                  │   │
  │  │  For each video (N = up to 15 videos across 5 confirmed channels)│   │
  │  │  · YouTube commentThreads API → up to 100 comments per video     │   │
  │  │  · Chunks of 20 comments → 1 Haiku call per chunk               │   │
  │  │  · ~5 chunks × 15 videos = ~75 Haiku calls total                 │   │
  │  │                                                                  │   │
  │  │  HAIKU EXTRACTS per chunk:                                       │   │
  │  │  · 2-5 pain points with emotionalIntensity >= 7                 │   │
  │  │  · vocabularyQuotes: exact user phrases preserved verbatim       │   │
  │  │  · vocData object per pain point:                                │   │
  │  │    +----- problemLabel    : how users NAME the problem           │   │
  │  │    +----- dominantEmotion : frustration|shame|fear|longing|...   │   │
  │  │    +----- failedSolutions : what they already tried              │   │
  │  │    +----- triggerMoment   : exact situation when pain peaks      │   │
  │  │    +----- successVision   : what success looks like in their words│  │
  │  │                                                                  │   │
  │  │  POST-EXTRACTION ADJUSTMENTS:                                    │   │
  │  │  · Engagement boost: avgLikes > 50  → intensity × 1.3           │   │
  │  │                       avgLikes > 200 → intensity × 1.5           │   │
  │  │  · Brand filter: drops off-topic pain points                     │   │
  │  │  · Cross-batch dedup: skips near-duplicate titles                │   │
  │  │                                                                  │   │
  │  │  Script: bc-scraper.ts            DB: bcComments,                │   │
  │  │                                       bcExtractedPainPoints      │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                         [admin reviews]                                  │
  │                    approves / rejects each pain point                    │
  │                         (need >= 3 approved)                             │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 4.5 — PAIN POINT CLUSTERING               [SONNET x 1]   │   │
  │  │                                                                  │   │
  │  │  · 1 Sonnet call synthesizes all approved pain points            │   │
  │  │  · Groups into 2-3 thematic clusters                             │   │
  │  │  · Each cluster contains:                                        │   │
  │  │    +----- clusterTheme           : e.g. "Focus Fragmentation"    │   │
  │  │    +----- dominantEmotion        : frustration|exhaustion|shame  │   │
  │  │    +----- aggregateIntensity     : weighted avg across cluster   │   │
  │  │    +----- synthesizedProblemLabel: single clear problem statement│   │
  │  │    +----- synthesizedSuccessVision: single success outcome       │   │
  │  │    +----- bestQuotes[]           : top 3 verbatim quotes         │   │
  │  │    +----- failedSolutions[]      : aggregated across all points  │   │
  │  │    +----- triggerMoments[]       : aggregated trigger situations │   │
  │  │                                                                  │   │
  │  │  WHY: "top 2 by intensity" often picks two from the same theme.  │   │
  │  │  Clustering ensures variants cover different emotional angles.   │   │
  │  │                                                                  │   │
  │  │  Script: bc-pain-clusterer.ts     DB: bcPainClusters inserted    │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 5 — LP VARIANT GENERATION                 [SONNET x 3]   │   │
  │  │                                                                  │   │
  │  │  3 variants from 2 clusters (cluster1 → A+B, cluster2 → C)      │   │
  │  │                                                                  │   │
  │  │  VARIANT A — curiosity_hook                                      │   │
  │  │  · Hero: surprising contradiction or counterintuitive claim      │   │
  │  │  · Opens a loop the reader must close by reading on              │   │
  │  │                                                                  │   │
  │  │  VARIANT B — pain_mirror                                         │   │
  │  │  · Hero: reflects user's exact frustration back at them          │   │
  │  │  · Uses verbatim VOC phrases from bestQuotes                     │   │
  │  │                                                                  │   │
  │  │  VARIANT C — outcome_promise                                     │   │
  │  │  · Hero: concrete transformation stated in user's own words      │   │
  │  │  · Leads with successVision, not product features                │   │
  │  │                                                                  │   │
  │  │  EVERY VARIANT IS CONSTRAINED TO:                                │   │
  │  │  · Grade 6 reading level, max 15 words per sentence              │   │
  │  │  · Banned: leverage, revolutionary, innovative, cutting-edge...  │   │
  │  │  · Mandatory: "What You Get" section (concrete, specific)        │   │
  │  │  · CTA structure: "Give me X. Get Y." (no vague promises)        │   │
  │  │  · featurePainMap: each feature linked to the pain it solves     │   │
  │  │                                                                  │   │
  │  │  Script: bc-lp-generator.ts       DB: bcLandingPageVariants x3  │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                                ▼                                         │
  │  OUTPUT: 3 LP Variants — admin reviews at /admin/brand-clarity/[id]      │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## UI Navigation

All 5 pipeline steps are accessible via a clickable stage-bar present on every page:

```
  1. LP Parsed  →  2. Channels  →  3. Videos  →  4. Scrape & Review  →  5. LP Variants
```

Every step is a direct link — free navigation between steps at any time.
Run logs from discovery scripts are shown inline in collapsible panels (like YT Intelligence).

---

## Model Usage — Haiku vs Sonnet

```
  LLM CALL BUDGET PER PROJECT RUN
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  HAIKU  (anthropic/claude-haiku-4-5)                                 │
  │  ──────────────────────────────────────────────────────────────────  │
  │  Stage 4 ONLY — bulk comment extraction                              │
  │                                                                      │
  │  · ~5-7 chunks per video × 15 videos = ~75-105 Haiku calls          │
  │  · Task: classify, extract, structure JSON (no copywriting)          │
  │  · Why Haiku: lowest cost — $0.25/M input vs $3/M Sonnet            │
  │  · Output: structured JSON pain points with vocData                  │
  │                                                                      │
  │  SONNET  (anthropic/claude-sonnet-4-6 via OpenRouter)                │
  │  ──────────────────────────────────────────────────────────────────  │
  │  Stage 1   · 1 call — LP parsing + keyword generation                │
  │  Stage 4.5 · 1 call — pain point clustering (synthesis)              │
  │  Stage 5   · 3 calls — LP variant generation (A, B, C)               │
  │  ──────────────────────────────────────────────────────────────────  │
  │  Total: 5 Sonnet calls per full pipeline run                         │
  │                                                                      │
  │  Why Sonnet for Stage 5: LP copy must be Grade 6, emotionally        │
  │  resonant, structurally precise. Haiku degrades noticeably here.     │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## v2 Improvements vs v1

```
  WHAT CHANGED IN v2
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  STAGE 1 — added                                                     │
  │  +-- featureMap: structured feature-to-benefit extraction from docs  │
  │  +-- AI agent prompt flow: admin downloads .md, agent returns YAML   │
  │  +-- nicheKeywords editable in chip UI (add/remove/save)             │
  │                                                                      │
  │  STAGE 2 — added                                                     │
  │  +-- URL-based manual channel add: paste any YT link or @handle      │
  │       resolve-channel.ts calls YouTube API, previews data before add │
  │  +-- nicheKeywords now use up to 6 (was 3) for better channel search │
  │  +-- Run log panel shows discovery progress inline                   │
  │                                                                      │
  │  STAGE 3 — reworked                                                  │
  │  +-- Removed videoDuration:medium filter (was main cause of 0 results│
  │  +-- Removed Pass 2 (pain keywords) — VoC not yet collected at Stage 3│
  │  +-- Added fallback: if keyword search = 0 → channel popular videos  │
  │  +-- nicheKeywords query expanded to up to 6 keywords                │
  │  +-- Run log panel shows per-channel progress inline                 │
  │  -   painBonus removed from scoring (no pain pass)                   │
  │                                                                      │
  │  STAGE 4 — added                                                     │
  │  +-- vocData object per pain point (5 structured fields)             │
  │  +-- Engagement-weighted intensity boost (high-liked = high pain)    │
  │  +-- Cross-batch title deduplication (no near-duplicate pain points) │
  │                                                                      │
  │  STAGE 4.5 — NEW                                                     │
  │  +-- Pain point clustering (Sonnet) before LP generation             │
  │       Prevents: two variants targeting the same emotional theme      │
  │                                                                      │
  │  STAGE 5 — complete rewrite                                          │
  │  +-- 3 named strategies: curiosity_hook, pain_mirror, outcome_promise│
  │  +-- VoC-first prompting: bestQuotes, triggerMoments, failedSolutions│
  │  +-- featurePainMap: every feature linked to a pain solved           │
  │  +-- Grade 6 reading level enforcement                               │
  │  +-- Banned buzzword list (leverage, revolutionary, innovative...)   │
  │  +-- "Give me X. Get Y." CTA structure                               │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — DB Tables

```
  DATABASE TABLES (bc* prefix)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │  bcProjects                                                          │
  │  +-- nicheKeywords[]          (from Stage 1, editable in UI)         │
  │  +-- featureMap[]             (from Stage 1)                         │
  │  +-- status: draft → discovered → scraping → pain_points_pending     │
  │              → clustered → generating → done                         │
  │                                                                      │
  │  bcTargetChannels  ──────────── confirmed by admin                  │
  │  bcTargetVideos    ──────────── top 3 per confirmed channel          │
  │  bcComments        ──────────── raw YouTube comments                 │
  │                                                                      │
  │  bcExtractedPainPoints                                               │
  │  +-- emotionalIntensity  (1-10, boosted by engagement weight)        │
  │  +-- vocabularyQuotes[]  (exact user phrases)                        │
  │  +-- vocData { problemLabel, dominantEmotion, failedSolutions[],     │
  │  |             triggerMoment, successVision }                         │
  │  +-- status: pending → approved | rejected  (admin curates)          │
  │                                                                      │
  │  bcPainClusters                                                      │
  │  +-- clusterTheme                                                    │
  │  +-- aggregateIntensity                                              │
  │  +-- bestQuotes[]                                                    │
  │  +-- synthesizedProblemLabel                                         │
  │  +-- synthesizedSuccessVision                                        │
  │  +-- failedSolutions[]                                               │
  │  +-- triggerMoments[]                                                │
  │                                                                      │
  │  bcLandingPageVariants                                               │
  │  +-- variantType: curiosity_hook | pain_mirror | outcome_promise     │
  │  +-- content (full LP text)                                          │
  │  +-- heroApproach                                                    │
  │  +-- featurePainMap[]                                                │
  │  +-- improvementSuggestions{}                                        │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Script Inventory

| Script                  | Stage | LLM          | Trigger                              |
|-------------------------|-------|--------------|--------------------------------------|
| bc-lp-parser.ts         | 1     | Sonnet x 1   | POST /api/bc/parse                   |
| bc-channel-discovery.ts | 2     | none         | POST /[projectId]/discover-channels  |
| resolve-channel.ts      | 2     | none         | POST /[projectId]/resolve-channel    |
| bc-video-discovery.ts   | 3     | none         | POST /[projectId]/discover-videos    |
| bc-scraper.ts           | 4     | Haiku x ~75  | POST /[projectId]/scrape/start       |
| bc-pain-clusterer.ts    | 4.5   | Sonnet x 1   | POST /[projectId]/cluster-pain-points|
| bc-lp-generator.ts      | 5     | Sonnet x 3   | POST /[projectId]/generate-variants  |
