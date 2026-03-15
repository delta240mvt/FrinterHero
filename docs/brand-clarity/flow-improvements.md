# Brand Clarity v2 — Complete Flow + Improvements

## Overview

Brand Clarity is a 6-stage pipeline that turns a raw landing page URL into
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
  │  INPUT: Landing Page URL + Project Name                                  │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 1 — LP INGESTION & KEYWORD EXTRACTION        [SONNET]     │   │
  │  │                                                                  │   │
  │  │  · Playwright → fetch LP HTML                                    │   │
  │  │  · Sonnet parses: product name, niche, unique value prop         │   │
  │  │  · Sonnet generates: nicheKeywords (search terms)                │   │
  │  │  · Sonnet generates: audiencePainKeywords (complaint terms)      │   │
  │  │    e.g. "why can't I focus at work" not "productivity tips"      │   │
  │  │  · Sonnet extracts: featureMap from projectDocumentation         │   │
  │  │    { featureName, whatItDoes, userBenefit }[]                    │   │
  │  │                                                                  │   │
  │  │  Script: bc-lp-parser.ts          DB: bcProjects updated         │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 2 — CHANNEL DISCOVERY                      [NO LLM]      │   │
  │  │                                                                  │   │
  │  │  · YouTube Data API v3: search.list × nicheKeywords              │   │
  │  │  · Filters: >10k subscribers, relevant niche, language match     │   │
  │  │  · Deduplication by channelId                                    │   │
  │  │  · Stores top 10 channel candidates                              │   │
  │  │  · Admin manually confirms 3-5 channels before Stage 3           │   │
  │  │                                                                  │   │
  │  │  Script: bc-channel-discovery.ts  DB: bcTargetChannels inserted  │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │                                │                                         │
  │                         [admin confirms]                                 │
  │                                │                                         │
  │                                ▼                                         │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  STAGE 3 — VIDEO DISCOVERY                        [NO LLM]      │   │
  │  │                                                                  │   │
  │  │  PASS 1 — niche search per channel                               │   │
  │  │  · YouTube search.list: channelId + nicheKeywords                │   │
  │  │  · Filters: medium duration (4-20 min), ordered by relevance     │   │
  │  │  · Up to 10 candidates per channel                               │   │
  │  │                                                                  │   │
  │  │  PASS 2 — pain-keyword search per channel (NEW in v2)            │   │
  │  │  · YouTube search.list: channelId + audiencePainKeywords         │   │
  │  │  · Catches complaint-heavy videos with high comment counts       │   │
  │  │  · Up to 10 additional candidates per channel                    │   │
  │  │                                                                  │   │
  │  │  SCORING (per video):                                            │   │
  │  │  · rankScore    = position in search results    (weight: 0.7)    │   │
  │  │  · engageScore  = comment count > 100 → +0.30                   │   │
  │  │  · painBonus    = from pain-keyword pass  → +0.20               │   │
  │  │  · Top 3 per channel inserted                                    │   │
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
  │  +-- audiencePainKeywords: complaint-oriented YT search terms        │
  │  |    Before: nicheKeywords only ("productivity", "focus")           │
  │  |    After:  + pain terms ("why can't I focus", "can't stop phone") │
  │  +-- featureMap: structured feature-to-benefit extraction from docs  │
  │                                                                      │
  │  STAGE 3 — added                                                     │
  │  +-- Pass 2 video discovery with audiencePainKeywords                │
  │  |    Finds complaint-heavy videos vs just high-relevance ones       │
  │  +-- painBonus +0.20 in relevance scoring for pain-keyword videos    │
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
  │  +-- nicheKeywords[]          (from Stage 1)                         │
  │  +-- audiencePainKeywords[]   (from Stage 1, NEW)                    │
  │  +-- featureMap[]             (from Stage 1, NEW)                    │
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
  │  |             triggerMoment, successVision }  (NEW)                 │
  │  +-- status: pending → approved | rejected  (admin curates)          │
  │                                                                      │
  │  bcPainClusters  (NEW)                                               │
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
  │  +-- featurePainMap[]  (NEW)                                         │
  │  +-- improvementSuggestions{}                                        │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Script Inventory

| Script                  | Stage | LLM          | Trigger               |
|-------------------------|-------|--------------|-----------------------|
| bc-lp-parser.ts         | 1     | Sonnet x 1   | POST /api/bc/parse    |
| bc-channel-discovery.ts | 2     | none         | POST /api/bc/discover |
| bc-video-discovery.ts   | 3     | none         | POST /api/bc/videos   |
| bc-scraper.ts           | 4     | Haiku x ~75  | POST /api/bc/scrape   |
| bc-pain-clusterer.ts    | 4.5   | Sonnet x 1   | POST /api/bc/cluster  |
| bc-lp-generator.ts      | 5     | Sonnet x 3   | POST /api/bc/generate |
