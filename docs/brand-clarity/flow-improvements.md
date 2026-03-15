# Brand Clarity Flow Improvements — Voice of Customer & LP Quality

## Status: Enhancement Proposal
## Date: 2026-03-15
## Branch: base150326-brandclarity

---

## Executive Summary

The current Brand Clarity flow works mechanically (data moves through 6 stages), but the **final landing page output is weak** because:

1. **Keywords come from a broken LP** — the existing landing page "doesn't work," yet we extract `nicheKeywords` from it to find YouTube channels. Garbage in, garbage out.
2. **Voice of Customer is decorative, not structural** — `customerLanguage` and `vocabularyQuotes` are extracted but only mentioned in the LP generator prompt as context. They don't drive the headline, hero, or CTA.
3. **The LP generator prompt is generic** — no instruction for curiosity-driven heroes, no "give me X, get Y" structure, no requirement for simple language.
4. **Pain points are used in isolation** — only top 2 pain points feed into 2 variants. No synthesis, no clustering, no frequency-weighted prioritization.
5. **Product features are an afterthought** — `projectDocumentation` is optional and truncated to 8000 chars. The LP should be built on **real features mapped to real pains**.

---

## Context: What the User Actually Needs

The person running Brand Clarity has:
- A product with real features (described in project documentation)
- A landing page that **doesn't convert**
- Access to YouTube audiences who discuss problems the product solves
- A need for a new LP that speaks **in the customer's own words**

The output LP must:
- **Hero:** Be surprising or trigger curiosity — not generic marketing speak
- **Language:** Simple, direct, clarity over cleverness
- **Structure:** "Give me [action], and you'll get [outcome]"
- **VoC:** Use actual customer vocabulary, their tone, their mental models
- **Features:** Beta tester must know exactly what they're getting — real features, real outcomes
- **Pain:** Directly answer customer needs extracted from real comment scraping

---

## Problem Analysis by Stage

### Stage 1: LP Parser — Wrong Source of Truth for Keywords

**Current:** `bc-lp-parser.ts` extracts `nicheKeywords` from the existing LP HTML + founder description.

**Problem:** The existing LP doesn't work. Its language, framing, and keywords reflect what the **founder thinks** the market wants — not what the market actually says. Using these keywords to find YouTube channels means we search for what the founder assumes, not what customers actually discuss.

**Fix:** After the LP is parsed, Sonnet should generate keywords from **three sources** weighted differently:

| Source | Weight | Rationale |
|--------|--------|-----------|
| Product documentation (features, mechanics) | 40% | What the product actually does |
| Founder description (vision, positioning) | 30% | How the founder frames the problem space |
| Existing LP (current messaging) | 30% | What language is currently being used (even if weak) |

Sonnet should output **two keyword sets**:
1. `nicheKeywords` (5-7) — broad niche terms for channel discovery
2. `audiencePainKeywords` (5-7) — pain/problem terms for video search (e.g., "can't focus at work", "burnout after deep work", "energy crash afternoon")

The `audiencePainKeywords` are specifically designed to find videos where people **complain about problems** the product solves — not just niche-related content.

---

### Stage 1.1: Documentation — Currently Optional, Should Be Required

**Current:** Project documentation is optional. If skipped, LP generation has no factual anchor.

**Problem:** Without product docs, the LP generator invents features or uses vague language. A beta tester reads the LP and has no idea what they actually get.

**Fix:** Make documentation a **soft-required** stage:
- If skipped, the LP generator adds a prominent warning: "LP variants generated without product documentation — feature accuracy not guaranteed"
- In the generator prompt, if docs exist, explicitly instruct: "Every feature claim must be traceable to the product documentation. Do not invent features."
- Extract a structured `featureMap` from documentation: `{ featureName: string, whatItDoes: string, userBenefit: string }[]` — this becomes the factual backbone of every LP variant

---

### Stage 2-3: Channel & Video Discovery — Pain-Oriented Search

**Current:** Channel discovery uses `nicheKeywords` (e.g., "focus", "productivity", "deep work"). Video discovery searches within channels using the same keywords.

**Problem:** These keywords find **topic channels**, not **pain discussions**. A video titled "10 Productivity Tips" has different comments than "Why I Can't Focus Anymore (burnout story)". The second video has comments full of customer pain language.

**Fix — Video Discovery Enhancement:**

Add a second search pass per channel using `audiencePainKeywords`:
1. Pass 1 (current): `search.list` with `nicheKeywords` — finds topically relevant videos
2. Pass 2 (new): `search.list` with `audiencePainKeywords` — finds pain-discussion videos

Score adjustment: videos found by pain keywords get +0.2 relevance bonus because their comments are more likely to contain extractable VoC data.

**Quota impact:** +10 `search.list` calls (1000 units). Total per run goes from ~1,362 to ~2,362 units. Still allows ~4 runs/day.

---

### Stage 4: Pain Point Extraction — Deeper VoC Mining

**Current prompt weakness:** The scraper asks Haiku to extract `customerLanguage` as "1 sentence on HOW they talk about this problem." This is too compressed — real VoC needs multiple dimensions.

**Fix — Enhanced Extraction Schema:**

Replace single `customerLanguage` field with structured VoC object:

```typescript
{
  // Current fields (keep)
  painPointTitle: string;
  painPointDescription: string;
  emotionalIntensity: number;
  frequency: number;
  vocabularyQuotes: string[];  // exact phrases, verbatim
  category: string;
  desiredOutcome: string;

  // NEW: Structured Voice of Customer
  vocData: {
    // How they NAME the problem (their label, not clinical/marketing)
    problemLabel: string;       // e.g., "brain fog after lunch"
    // The EMOTION they associate with it (frustration, shame, fear, longing)
    dominantEmotion: string;    // e.g., "frustration"
    // What they've TRIED that failed (previous solutions)
    failedSolutions: string[];  // e.g., ["pomodoro", "coffee", "naps"]
    // The MOMENT they feel the pain most (trigger situation)
    triggerMoment: string;      // e.g., "right after a meeting when I need to code"
    // How they'd describe SUCCESS in their own words
    successVision: string;      // e.g., "just sit down and the code flows for 3 hours"
  }
}
```

**Why each VoC field matters for the LP:**

| VoC Field | LP Section | How It's Used |
|-----------|-----------|---------------|
| `problemLabel` | Hero headline | Use their exact name for the problem, not marketing jargon |
| `dominantEmotion` | Hero subheadline | Mirror the emotion to create instant recognition |
| `failedSolutions` | Problem section | "You've tried X, Y, Z — and none of them stuck" |
| `triggerMoment` | Problem section | Paint the specific moment they feel the pain |
| `successVision` | Solution/CTA | "Give me 10 minutes of setup, and you'll [successVision]" |
| `vocabularyQuotes` | Throughout | Sprinkle exact phrases as social proof + relatability |

---

### Stage 4.5 (NEW): Pain Point Clustering & Synthesis

**Current:** LP generator takes top 2 pain points by `emotionalIntensity` independently. No clustering.

**Problem:** 15 extracted pain points might cluster into 3-4 themes. Taking the "top 2" might pick two pain points from the same cluster, missing a major theme entirely. Also, frequency across clusters matters more than individual intensity.

**Fix — Add a clustering step before LP generation:**

After admin approves pain points, before generating variants, run one Sonnet call:

**Input:** All approved pain points with full VoC data
**Output:** 2-3 pain clusters, each with:
- `clusterTheme`: 1-sentence summary
- `dominantEmotion`: the shared emotion
- `aggregateIntensity`: weighted average intensity × frequency
- `bestQuotes`: top 3 vocabularyQuotes across all pain points in cluster
- `synthesizedProblemLabel`: the most common way customers name this cluster
- `synthesizedSuccessVision`: what success looks like for this cluster
- `painPointIds`: which pain points belong to this cluster

This clustering ensures:
1. Variant B addresses the **biggest customer concern** (by aggregate weight, not just one person's intensity-10 comment)
2. Variant C addresses a **different dimension** of pain (not just second-highest individual score)
3. The LP generator receives **synthesized VoC** — multiple voices merged into one powerful message

---

### Stage 5: LP Generation — The Core Rewrite

**Current prompt problems:**
1. Generic copywriting instructions — "write a full landing page HTML"
2. No structure for curiosity/surprise heroes
3. No "give me X, get Y" framework
4. VoC quotes are listed as context but not mandated in output
5. No simple-language constraint
6. `projectDocumentation` passed but not used to ground feature claims
7. Improvement suggestions are afterthought HTML comments

**Fix — Complete LP Generator Prompt Rewrite:**

The new prompt should enforce these LP principles:

#### Principle 1: Hero Must Trigger Curiosity or Surprise

```
HERO SECTION RULES:
- The headline must do ONE of these:
  a) STATE A SURPRISING FACT: "87% of focus apps make you LESS focused"
  b) NAME THEIR PAIN IN THEIR WORDS: "{problemLabel} isn't a discipline problem"
  c) PROMISE A SPECIFIC OUTCOME: "Go from {triggerMoment} to {successVision}"
- The subheadline must explain HOW in one sentence
- NO generic headlines like "The Ultimate X" or "Transform Your Y"
- Test: Would someone screenshot this headline and send it to a friend? If no, rewrite.
```

#### Principle 2: Voice of Customer Drives Every Section

```
VoC INTEGRATION RULES:
- Hero: Use {problemLabel} or {successVision} verbatim
- Problem section: Start with {triggerMoment}. Use at least 2 {vocabularyQuotes}.
  Write as if you're describing THEIR morning, THEIR frustration, THEIR failed attempts.
  Name {failedSolutions} they've tried: "You've tried [X], [Y], and [Z]."
- Solution section: Transition with "What if {successVision}?"
  Map each product FEATURE (from documentation) to a SPECIFIC pain it solves.
- Social proof: Use {vocabularyQuotes} as pseudo-testimonials:
  "People like you say: '{quote}' — that's exactly why we built [feature]."
- CTA: Use the "give me X, get Y" structure:
  "Give me [specific action]. Get [specific outcome from successVision]."
```

#### Principle 3: Clarity Over Cleverness

```
LANGUAGE RULES:
- Reading level: Grade 6 (Hemingway-simple)
- Max sentence length: 15 words
- No jargon unless the CUSTOMER uses it (check vocabularyQuotes)
- No buzzwords: "leverage", "optimize", "unlock", "empower", "transform"
- Every paragraph must pass: "Would a tired person at 11 PM understand this in 3 seconds?"
- Feature descriptions: "[Feature name] — [what it does in 8 words]. [Why you care in 8 words]."
```

#### Principle 4: Beta Tester Knows Exactly What They Get

```
SPECIFICITY RULES:
- List EVERY core feature from {projectDocumentation.featureMap}
- For each feature, write: "You get [feature]. It does [specific thing]. So you can [specific outcome]."
- Include a "What's Inside" or "What You Get" section — even if original LP didn't have one
- NO vague promises: Replace "better focus" with "90-minute uninterrupted deep work sessions tracked in real-time"
- If the product has limitations, acknowledge them: "This isn't for [wrong audience]. This is for [right audience]."
```

#### Principle 5: Feature-to-Pain Mapping (NEW)

Before generating HTML, the prompt should require the LLM to first output a **Feature-Pain Map**:

```json
{
  "featurePainMap": [
    {
      "feature": "Focus Sprint Timer",
      "whatItDoes": "Measures depth, length, and frequency of focus sessions",
      "painItSolves": "brain fog after lunch — you never know if you're actually focusing",
      "vocQuote": "I sit at my desk for hours and produce nothing",
      "lpPlacement": "solution section, first feature block"
    }
  ]
}
```

This map ensures every feature mention is **grounded in a real customer pain** and uses **their language** to describe why the feature matters.

---

### Stage 5 Enhancement: Three Variant Strategy (Revised)

**Current:**
- Variant A: Founder Vision
- Variant B: Top pain point #1
- Variant C: Top pain point #2

**Problem:** Variant A (Founder Vision) is disconnected from customer reality. It's the founder talking TO customers, not speaking AS someone who understands them.

**Revised Strategy:**

| Variant | Strategy | Hero Approach | VoC Integration |
|---------|----------|---------------|-----------------|
| **A — Curiosity Hook** | Lead with surprising insight from pain point data | "Did you know [surprising stat or pattern from comments]?" | Uses aggregate VoC patterns, not individual quotes |
| **B — Pain Mirror** | Lead with the #1 pain cluster in customer's exact words | "{problemLabel} — {dominantEmotion} headline" | Heavy VoC: trigger moment, failed solutions, vocabulary quotes |
| **C — Outcome Promise** | Lead with the desired outcome, work backward to product | "Give me [action]. Get [successVision]." | Leads with successVision, uses VoC to prove understanding |

All three variants share:
- Same feature map (grounded in product documentation)
- Same "What You Get" section (beta tester clarity)
- Same VoC vocabulary (customer language throughout)

They differ in:
- Hero framing (curiosity vs. pain mirror vs. outcome promise)
- Problem section emphasis (data-driven vs. emotional vs. aspiration)
- CTA tone (discover vs. escape-pain vs. achieve-goal)

---

## Database Schema Changes Required

### Modified: `bcProjects`

```sql
-- New columns
ALTER TABLE bc_projects ADD COLUMN audience_pain_keywords jsonb DEFAULT '[]';
-- Pain-oriented keywords for video search (separate from niche keywords)

ALTER TABLE bc_projects ADD COLUMN feature_map jsonb DEFAULT '[]';
-- Structured feature extraction from product docs
-- Shape: [{ featureName, whatItDoes, userBenefit }]
```

### Modified: `bcExtractedPainPoints`

```sql
-- New column for structured VoC
ALTER TABLE bc_extracted_pain_points ADD COLUMN voc_data jsonb DEFAULT '{}';
-- Shape: { problemLabel, dominantEmotion, failedSolutions[], triggerMoment, successVision }
```

### New: `bcPainClusters`

```sql
CREATE TABLE bc_pain_clusters (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES bc_projects(id) ON DELETE CASCADE,
  cluster_theme varchar(255) NOT NULL,
  dominant_emotion varchar(100),
  aggregate_intensity real,  -- weighted: avg(intensity) × sum(frequency)
  best_quotes jsonb DEFAULT '[]',
  synthesized_problem_label text,
  synthesized_success_vision text,
  pain_point_ids jsonb DEFAULT '[]',  -- array of bcExtractedPainPoints.id
  created_at timestamp DEFAULT now() NOT NULL
);
```

---

## Implementation Tasks

### Phase A — Keyword Intelligence (Stage 1 Fix)

#### BC-A1: Enhance `bc-lp-parser.ts` — Dual Keyword Extraction

**File:** `scripts/bc-lp-parser.ts`
**Deps:** None (modifies existing)

**Changes:**
1. Update LLM prompt to extract TWO keyword sets:
   - `nicheKeywords` — broad niche terms (current behavior, but now weighted across all 3 sources)
   - `audiencePainKeywords` — problem/pain language terms for finding complaint-heavy videos
2. New prompt section:
```
TASK 1B — Generate audience pain keywords:
Based on the product documentation, founder description, and LP content, generate 5-7 keywords
that real customers would TYPE INTO YOUTUBE when they are FRUSTRATED about the problem this product solves.
These should be complaint-oriented, emotional, and specific.
Example: Instead of "productivity" → "why can't I focus after meetings"
Instead of "time management" → "wasting entire afternoons on nothing"
```
3. Store `audiencePainKeywords` in `bcProjects` (new column)

**Acceptance:**
- [ ] Both keyword sets extracted and stored
- [ ] `audiencePainKeywords` are pain-oriented, not topic-oriented
- [ ] Works with and without `projectDocumentation`

---

#### BC-A2: Extract Feature Map from Documentation

**File:** `scripts/bc-lp-parser.ts` (extend)
**Deps:** BC-A1

**Changes:**
1. If `projectDocumentation` exists, add a prompt section:
```
TASK 1C — Extract Feature Map from documentation:
Read the product documentation and extract every distinct feature as:
[
  {
    "featureName": "short name",
    "whatItDoes": "1 sentence, plain English, what this feature actually does",
    "userBenefit": "1 sentence, why a user would care about this"
  }
]
Only include features that are BUILT or IN PROGRESS. Do not include roadmap items.
```
2. Store as `featureMap` jsonb in `bcProjects`

**Acceptance:**
- [ ] Feature map extracted from docs
- [ ] Each feature has name, mechanism, and benefit
- [ ] Null/empty if no documentation provided

---

### Phase B — Pain-Oriented Video Discovery (Stage 2-3 Fix)

#### BC-B1: Add Pain Keyword Search Pass to Video Discovery

**File:** `scripts/bc-video-discovery.ts`
**Deps:** BC-A1

**Changes:**
1. After standard keyword search, run second pass with `audiencePainKeywords`
2. Deduplicate videos across both passes
3. Videos found by pain keywords get `relevanceScore += 0.2` bonus
4. Still select top 3 per channel (from merged results)

**Acceptance:**
- [ ] Two search passes per channel
- [ ] Deduplication by `videoId`
- [ ] Pain-keyword videos scored higher
- [ ] Quota increase documented (~+1000 units)

---

### Phase C — Enhanced VoC Extraction (Stage 4 Fix)

#### BC-C1: Update Pain Point Extraction Prompt for Structured VoC

**File:** `scripts/bc-scraper.ts`
**Deps:** None (modifies existing)

**Changes:**
1. Update Haiku system prompt to extract `vocData` object alongside existing fields
2. New extraction fields per pain point:
```
"vocData": {
  "problemLabel": "how they NAME this problem in plain words",
  "dominantEmotion": "the primary emotion (frustration/shame/fear/longing/anger/exhaustion)",
  "failedSolutions": ["things they tried that didn't work"],
  "triggerMoment": "the specific situation when they feel this pain most",
  "successVision": "what they describe as the ideal outcome, in their words"
}
```
3. Store in new `voc_data` jsonb column on `bcExtractedPainPoints`

**Acceptance:**
- [ ] `vocData` populated for each pain point
- [ ] `problemLabel` is plain language, not clinical/marketing
- [ ] `triggerMoment` is a specific situation, not abstract
- [ ] `successVision` is concrete and measurable

---

#### BC-C2: Weight Pain Points by Comment Engagement

**File:** `scripts/bc-scraper.ts`
**Deps:** None

**Changes:**
1. Pass `voteCount` to LLM as context (already formatted as `(likes:N)`)
2. Post-extraction: multiply `emotionalIntensity` by engagement factor:
   - Comments with `voteCount > 50`: intensity × 1.3
   - Comments with `voteCount > 200`: intensity × 1.5
3. Cap at 10

**Acceptance:**
- [ ] High-engagement comments boost pain point intensity
- [ ] Score capped at 10

---

#### BC-C3: Cross-Batch Pain Point Deduplication

**File:** `scripts/bc-scraper.ts`
**Deps:** None

**Changes:**
1. After all chunks processed, run a deduplication pass:
   - Group pain points by `vocData.problemLabel` similarity (Levenshtein < 0.3 or exact substring match)
   - Merge duplicates: combine `vocabularyQuotes`, sum `frequency`, max `emotionalIntensity`, union `sourceVideoIds`
2. Store merged pain points only

**Acceptance:**
- [ ] No near-duplicate pain points in final set
- [ ] Merged entries have combined quotes and frequency

---

### Phase D — Pain Point Clustering (NEW Stage 4.5)

#### BC-D1: Create `bcPainClusters` Table

**File:** `src/db/schema.ts`
**Deps:** None

**Changes:**
Add `bcPainClusters` table as defined in schema changes section above.

**Acceptance:**
- [ ] Table created with all fields
- [ ] FK cascade to bcProjects

---

#### BC-D2: Create `scripts/bc-pain-clusterer.ts`

**File:** `scripts/bc-pain-clusterer.ts` (new)
**Deps:** BC-D1, BC-C1

**Model:** Sonnet (1 call — precision matters for clustering)

**Logic:**
1. Load all approved pain points with `vocData`
2. Send to Sonnet with clustering prompt:
```
You are a customer research analyst. You have {N} validated customer pain points
extracted from YouTube comments about {niche}.

Group these pain points into 2-3 DISTINCT clusters. Each cluster represents
a DIFFERENT dimension of customer frustration.

Rules:
- Clusters must be MEANINGFULLY DIFFERENT (not just subcategories of the same issue)
- Weight by frequency × intensity (a pain mentioned 8 times at intensity 7 > mentioned once at intensity 10)
- For each cluster, SYNTHESIZE:
  - The most common way customers NAME this problem (use THEIR words, not yours)
  - The dominant EMOTION across all pain points in this cluster
  - The clearest VISION OF SUCCESS customers describe
  - The 3 most powerful VERBATIM QUOTES
```
3. Store clusters in `bcPainClusters`
4. Link to pain point IDs

**Acceptance:**
- [ ] 2-3 clusters produced
- [ ] Each cluster has synthesized VoC fields
- [ ] Clusters are meaningfully distinct
- [ ] Aggregate intensity calculated

---

#### BC-D3: Create Clustering API Route + UI Trigger

**File:** `src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts` (new)
**Deps:** BC-D2

**Logic:**
1. Auth check
2. Verify ≥ 3 approved pain points
3. Spawn `bc-pain-clusterer.ts`
4. Return clusters

**UI Integration:** Add "Cluster Pain Points" button on scrape.astro page, shown after ≥ 3 approved. Display clusters as cards with synthesized VoC before proceeding to LP generation.

**Acceptance:**
- [ ] Clusters displayed before LP generation
- [ ] User can review synthesized VoC per cluster

---

### Phase E — LP Generator Rewrite (Stage 5 Fix)

#### BC-E1: Rewrite LP Generator Prompt — VoC-First Approach

**File:** `scripts/bc-lp-generator.ts`
**Deps:** BC-A2, BC-D2

**This is the highest-impact change.** Replace the generic copywriting prompt with:

**New System Prompt:**
```
You are a conversion copywriter who writes landing pages using
the Voice of Customer methodology.

CORE PRINCIPLE: Every sentence on this landing page must sound like
it was written BY the customer, FOR the customer. The founder's job
is to LISTEN and REFLECT, not to lecture.

LANGUAGE RULES:
- Reading level: Grade 6. Short sentences. No jargon.
- Max 15 words per sentence.
- Banned words: leverage, optimize, unlock, empower, transform,
  revolutionary, cutting-edge, game-changing, seamless, robust
- Test every line: "Would a tired person at 11 PM get this in 3 seconds?"
```

**New User Prompt (per variant):**

```
PROJECT: {projectName}
VARIANT: {variantType} — {variantStrategy}

=== PRODUCT TRUTH (source of truth for ALL feature claims) ===
{projectDocumentation}

=== FEATURE MAP (every feature you may reference) ===
{featureMap as JSON}
Rule: You may ONLY mention features from this list. Do not invent features.

=== VOICE OF CUSTOMER DATA ===
Pain Cluster: {cluster.clusterTheme}
How they NAME the problem: {cluster.synthesizedProblemLabel}
Dominant emotion: {cluster.dominantEmotion}
Their vision of success: {cluster.synthesizedSuccessVision}
What they've tried that failed: {aggregated failedSolutions}
When they feel this pain most: {aggregated triggerMoments}
Their exact words:
{cluster.bestQuotes — numbered list}

=== LP STRUCTURE TO FOLLOW ===
Section order: {sectionOrder}
Brand voice: {brandVoiceNotes}
Tone: {toneKeywords}
Primary CTA: {primaryCTA}

=== VARIANT-SPECIFIC HERO STRATEGY ===

[For Variant A — Curiosity Hook:]
Hero headline must state a SURPRISING or COUNTERINTUITIVE insight.
Something the reader doesn't expect. Make them think "wait, what?"
Use data from pain point analysis if possible.

[For Variant B — Pain Mirror:]
Hero headline must use {synthesizedProblemLabel} — their EXACT name
for the problem. Subheadline mirrors {dominantEmotion}.
The reader must think: "This person gets me."

[For Variant C — Outcome Promise:]
Hero headline must promise {synthesizedSuccessVision} in concrete terms.
Structure: "Give me [specific action]. Get [specific outcome]."
The reader must think: "That's exactly what I want."

=== SECTION-BY-SECTION REQUIREMENTS ===

HERO:
- Headline: Follow variant strategy above
- Subheadline: 1 sentence, explains the "how" simply
- Visual: Suggest a single image concept in <!-- IMAGE: description -->

PROBLEM:
- Open with: "You know that moment when {triggerMoment}..."
- Use at least 2 vocabulary quotes inline
- Name 2-3 failed solutions: "You've tried {X}, {Y}, {Z}."
- End with: "It's not your fault. {Reframe the problem}."

SOLUTION:
- Transition: "What if {synthesizedSuccessVision}?"
- For each feature in featureMap that maps to this pain cluster:
  "[Feature name] — [whatItDoes]. So you can [userBenefit]."
- Max 4 features. Pick the most relevant to THIS cluster.

WHAT YOU GET (add this section even if original LP didn't have it):
- Bullet list of EVERY feature from featureMap
- Format: "You get [feature]. It [does specific thing]."
- This section must make a beta tester think: "I know exactly what I'm signing up for."

SOCIAL PROOF:
- Use vocabulary quotes as customer voices
- Format: "People like you are saying: '{quote}'"
- If no social proof exists, use: "Join [N] people who felt exactly like you do right now."

CTA:
- Primary: "Give me [action]. Get [outcome]." structure
- Secondary: Address the #1 objection from failedSolutions
- Urgency: Specific, not fake ("Beta closes [date]" not "Limited time!")

=== OUTPUT FORMAT ===
First: Output the feature-pain map as ```json:
{
  "featurePainMap": [
    { "feature": "...", "painItSolves": "...", "vocQuote": "...", "section": "..." }
  ],
  "heroApproach": "1 sentence explaining WHY this hero will work",
  "improvementSuggestions": {
    "hero": "what was improved and why",
    "problem": "...",
    "solution": "...",
    "features": "...",
    "social_proof": "...",
    "cta": "..."
  }
}
```
Then: Output the full HTML inside ```html block.
```

**Acceptance:**
- [ ] Prompt uses VoC data structurally, not decoratively
- [ ] Feature claims grounded in `featureMap`
- [ ] "What You Get" section always present
- [ ] Hero follows variant-specific strategy
- [ ] Language rules enforced (Grade 6, no buzzwords)
- [ ] Feature-pain map generated before HTML (forces LLM to reason about mapping)

---

#### BC-E2: Update Variant Type Definitions

**File:** `scripts/bc-lp-generator.ts`
**Deps:** BC-E1

**Changes:**
1. Replace `founder_vision` with `curiosity_hook`
2. Keep `pain_point_1` → rename to `pain_mirror`
3. Keep `pain_point_2` → rename to `outcome_promise`
4. Update `bcLandingPageVariants.variantType` values
5. Update all references in API routes and UI

**Acceptance:**
- [ ] Three variant types: `curiosity_hook`, `pain_mirror`, `outcome_promise`
- [ ] UI labels updated
- [ ] Database migration for existing records (if any)

---

#### BC-E3: Store Feature-Pain Map in Variant Record

**File:** `scripts/bc-lp-generator.ts`, `src/db/schema.ts`
**Deps:** BC-E1

**Changes:**
1. Parse the `featurePainMap` JSON from LLM response
2. Store in new `featurePainMap` jsonb column on `bcLandingPageVariants`
3. Display in variants.astro as a table: Feature | Pain It Solves | Customer Quote

**Acceptance:**
- [ ] Feature-pain map stored per variant
- [ ] Displayed in UI for review

---

### Phase F — UI Enhancements

#### BC-F1: Show Pain Clusters Before LP Generation

**File:** `src/pages/admin/brand-clarity/[id]/scrape.astro`
**Deps:** BC-D3

**Changes:**
1. After pain points approved and clustered, show cluster summary cards:
   - Cluster theme
   - Synthesized problem label (in customer words)
   - Dominant emotion badge
   - Best 3 quotes
   - Aggregate intensity bar
2. "Generate Landing Pages" button moves here (after cluster review)

---

#### BC-F2: Feature-Pain Map Display in Variants Page

**File:** `src/pages/admin/brand-clarity/[id]/variants.astro`
**Deps:** BC-E3

**Changes:**
1. New tab per variant: "Feature Mapping"
2. Table: Feature | Pain Solved | Customer Quote | LP Section
3. Allows user to verify every feature claim is grounded

---

#### BC-F3: VoC Highlight Panel in Variants Page

**File:** `src/pages/admin/brand-clarity/[id]/variants.astro`
**Deps:** BC-E1

**Changes:**
1. Side panel showing which VoC quotes were used in each variant
2. Highlights in the HTML preview where customer language appears
3. VoC coverage metric: "X of Y vocabulary quotes used in this variant"

---

## Task Priority & Dependencies

```
Phase A (Keyword Intelligence) — HIGHEST PRIORITY
  BC-A1 → BC-A2 (sequential)
  ↓
Phase B (Pain-Oriented Video Discovery)
  BC-B1 (depends on BC-A1)
  ↓
Phase C (Enhanced VoC Extraction)
  BC-C1, BC-C2, BC-C3 (parallel, all modify bc-scraper.ts — merge carefully)
  ↓
Phase D (Pain Point Clustering)
  BC-D1 → BC-D2 → BC-D3 (sequential)
  ↓
Phase E (LP Generator Rewrite) — HIGHEST IMPACT
  BC-E1 → BC-E2, BC-E3 (E2 and E3 parallel after E1)
  ↓
Phase F (UI Enhancements)
  BC-F1, BC-F2, BC-F3 (parallel, after Phase E)
```

**Critical path:** BC-A1 → BC-C1 → BC-D2 → BC-E1

**Estimated LLM cost change:**
- +1 Sonnet call for clustering (BC-D2)
- Same 3 Sonnet calls for LP generation (but with better prompts)
- Same ~300 Haiku calls for extraction (but extracting more structured data)
- **Net: +1 Sonnet call per full run (~$0.02 additional)**

---

## Success Criteria

After implementing all phases, a generated LP variant should:

1. **Hero test:** Someone reads the headline and either says "wait, what?" (curiosity) or "that's exactly my problem" (pain mirror) or "I want that" (outcome promise)
2. **VoC test:** At least 5 vocabulary quotes from real customers appear in the LP
3. **Specificity test:** A beta tester can list exactly what features they get after reading the LP
4. **Simplicity test:** Every sentence is under 15 words, Grade 6 reading level
5. **Grounding test:** Every feature mentioned exists in the product documentation
6. **CTA test:** The CTA follows "Give me X, get Y" — specific action, specific outcome
7. **No-bullshit test:** Zero buzzwords from the banned list appear in the output
