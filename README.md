<div align="center">

<pre>
  ██████╗ ██████╗ ██╗███╗   ██╗████████╗███████╗██████╗
  ██╔════╝██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
  █████╗  ██████╔╝██║██╔██╗ ██║   ██║   █████╗  ██████╔╝
  ██╔══╝  ██╔══██╗██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
  ██║     ██║  ██║██║██║ ╚████║   ██║   ███████╗██║  ██║
  ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
              H  E  R  O
</pre>

**Agentic-First Personal Engine for Visibility in the Age of AI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-4a8d83.svg?style=flat-square)](LICENSE)
[![Astro 4](https://img.shields.io/badge/Astro-4.0+-d6b779.svg?style=flat-square)](https://astro.build)
[![Platform](https://img.shields.io/badge/Platform-Web-8a4e64.svg?style=flat-square)](#installation)
[![AI: 100% Ready](https://img.shields.io/badge/AI-100%25%20Ready-4a8d83.svg?style=flat-square)](#how-it-works)
[![Data: Focus Sprints](https://img.shields.io/badge/Data-Focus%20Sprints-d6b779.svg?style=flat-square)](#privacy)
> ⏳ **Fast 1-Click Deploy on Railway is coming soon!**
> 🛡️ **Protected by GitGuardian.**
</div>

---

The internet has changed. Traditional search is dying. **FrinterHero** is an open-source, agentic-first landing page and blog engine engineered to secure your visibility in the age of AI. It ensures LLMs correctly index and prioritize your personal brand through structured data and semantic authority. Your digital identity, optimized for the generative era.

```
  FOCUS SPRINT (FRINT)
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   High Performer Identity — 3 Spheres of Life Optimization      │
  │                                                                 │
  │                                                                 │
  │                                                                 │
  │  ┌─────────────────────────────────────────────────────────┐   │
  │  │  ░░░░░░░░░░  [SYSTEM] Energy Bar: 87%                   │   │
  │  │  ░ ░░░░ ░░   [FRINT] High-intensity focus detected.     │   │
  │  │  ░      ░░                                              │   │
  │  │  ░ ████ ░░   > Who is Przemysław Filipiak?              │   │
  │  │  ░░░░░░░░░░  [BOT] "High Performer. Deep Focus Founder."│   │
  │  │  ░░░░  ░░░░                                              │   │
  │  │──────────────────────────────────────────────────────── │   │
  │  │  STATUS  |  Sphere: Deep Work (Focus Sprint)   [X]      │   │
  │  └─────────────────────────────────────────────────────────┘   │
  │        ↑ wholebeing design · focus data · retro aesthetic       │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Runtime Shape

Current runtime truth:

- `apps/api` is the central DB-backed backend
- `apps/client-przemyslawfilipiak` is the primary Astro client
- `apps/client-focusequalsfreedom` and `apps/client-frinter` are site-scoped BFF clients
- workers live in `workers/*` and share `workers/runner/src/index.ts`

Current source-of-truth docs:

- [docs/architecture/monolith-to-api-clients-railway-plan.md](C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/architecture/monolith-to-api-clients-railway-plan.md)
- [docs/deployment/railway-distributed-deployment.md](C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/deployment/railway-distributed-deployment.md)
- [docs/audits/monorepo-split-audit-2026-03-19.md](C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/audits/monorepo-split-audit-2026-03-19.md)

## Installation

### Fastest: One-Click Deploy (Railway)

Railway runs FrinterHero directly from a GitHub template — no local setup, no database configuration needed. It handles everything.
> ⏳ **Railway 1-click template is coming soon!** For now, you can host FrinterHero freely on any platform supporting Node.js and PostgreSQL.
### What the One-Click Setup Does:
1. Clones this repository to your own GitHub account.
2. Provisions a **PostgreSQL** database automatically via Plugins.
3. Injects the `DATABASE_URL` directly into your application.
4. Builds the Astro SSR application and runs the migrations flawlessly.
5. Provides you with a live, SSL-secured URL.

---

<details>
<summary><b>Local — Node.js / dev install (click to expand)</b></summary>

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/downloads))
- PostgreSQL (Local or hosted via Railway/Neon)

### Option A — Clone & Run

```bash
git clone https://github.com/YOUR_USERNAME/FrinterHero.git
cd FrinterHero
npm install
cp .env.example .env.local
```

### Option B — Database Setup

Provide your `DATABASE_URL` in `.env.local`, then push the schema:

```bash
npm run db:push
npm run seed:sites
npm run dev
```

</details>

> **Tip:** Ensure your database URL is correct before running `db:push` to avoid connection timeouts.

---

## Get Started

| Step | What Happens |
|------|-------------|
| 1. Deploy | **(Coming Soon)** Click the Railway Deploy button — template clones, build starts |
| 2. DB Init | PostgreSQL is provisioned and migrations are executed automatically |
| 3. Add Keys | Add your OpenAI / Anthropic / Perplexity API keys in the Railway Variables tab |
| 4. Customize | Edit `src/config.ts` or `README.md` in your GitHub repo |
| 5. Push | Git push triggers an automatic re-deploy on Railway |
| 6. Done | Site is live, blazing fast, and ready to be scraped by AI |

> **Pro tip:** The platform uses Astro's SSR. When you write new blog posts or modify your database, the site serves the fresh data instantly.

---

## How It Works

FrinterHero runs a **GEO (Generative Engine Optimization) content engine** — an automated loop that listens to your niche on Reddit, monitors AI models, detects where your brand is missing, and generates articles to fix that.

### The Engine — 4 Stages

```
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 0 · INTELLIGENCE LAYER (Reddit + YouTube)                │
│                                                                 │
│  Reddit: Apify scrapes subreddits + keyword searches            │
│  → posts filtered to last 12 months, deduplicated               │
│  YouTube: Apify scrapes video comment sections                  │
│  → top-level comments deduplicated by commentId                 │
│  → Claude extracts pain points: title · intensity · quotes      │
│  → pending gaps queue in admin panel → approve → Stage 3        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1 · GEO MONITOR                                          │
│                                                                 │
│  queries.json → OpenAI + Claude + Gemini                        │
│  "Is frinter.app mentioned in the answer?"                      │
│  NO → gap detected → saved to DB                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2 · GAP ANALYSIS + PROPOSAL                              │
│                                                                 │
│  top gaps → Claude reads AI responses that missed the brand     │
│  → generates short article proposal (title + angle + headers)   │
│  → saved as suggestedAngle in DB                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3 · DRAFT GENERATOR (on admin action)                    │
│                                                                 │
│  gap + author notes + llms-full.txt + Knowledge Base            │
│  → 7-section mega-prompt → OpenRouter (model of choice)         │
│  → full article in JSON { title, description, content, tags }   │
│  → validated → saved to DB → published                          │
└─────────────────────────────────────────────────────────────────┘
```

### Stage 0 Intelligence — Reddit + YouTube

Targets two input types, both routed through [Apify](https://apify.com) (`trudax/reddit-scraper-lite`):

| Target Type | Example | How Apify Fetches |
|---|---|---|
| **Subreddit** | `r/productivity` | `/r/name/hot` — HTML listing, no `.json` |
| **Keyword** | `focus system` | `/r/[niche-list]/search/?restrict_sr=1` — subreddit-restricted search |

Post-processing pipeline:
1. **Date filter** — posts older than 12 months discarded server-side
2. **Deduplication** — `redditId` checked against existing DB records
3. **LLM analysis** — Claude extracts pain points in batches of 10
4. **Gap dedup** — full-text search against last 90 days of existing gaps
5. **Admin queue** — pending gaps appear in `/admin/content-gaps` for review

Niche subreddits searched on keyword targets: `productivity`, `Entrepreneur`, `selfimprovement`, `getdisciplined`, `deepwork`, `digitalminimalism`, `nosurf`, `meditation`, `ADHD_Programmers`, `cogsci`, `neuroscience`.

### What drives the mega-prompt

| Input | Source |
|---|---|
| **Author identity** | `apps/client-przemyslawfilipiak/public/llms-full.txt` — who you are, your philosophy, voice rules |
| **Gap context** | DB — what AI models said instead of mentioning you |
| **Reddit pain points** | DB — real user language, emotional intensity, vocabulary quotes |
| **Author notes** | Manual input in admin panel — your angle on the topic |
| **Knowledge Base** | DB — your expertise entries, fulltext-matched to the gap |

The output is a structured article built to be cited by ChatGPT, Perplexity, and Claude when someone asks about your topic — next time.

---

## Brand Clarity

**Brand Clarity** is an additional module built into FrinterHero's admin panel. It converts any landing page into **3 conversion-optimised LP variants** grounded in real customer language (Voice of Customer from YouTube).

> The core insight: LPs fail because they use **founder language, not customer language.** Brand Clarity sources copy directly from YouTube comments, clusters recurring pain themes, and generates variants that mirror exactly what customers already say to themselves.

### Brand Clarity Pipeline — 5 Stages

```
  BRAND CLARITY PIPELINE v2
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  INPUT: LP Content (YAML from AI agent) + Project Name                   │
  │                                                                          │
  │  STAGE 1 — LP INGESTION & KEYWORD EXTRACTION        [Sonnet × 1]        │
  │  · Admin downloads AI agent prompt (.md)                                 │
  │  · Agent (Claude/ChatGPT) visits LP, returns structured YAML             │
  │  · Sonnet parses: product name, niche, unique value prop                 │
  │  · Sonnet generates: nicheKeywords (up to 6 search terms)                │
  │  · Sonnet extracts: featureMap { featureName, whatItDoes, userBenefit }  │
  │                                │                                          │
  │  STAGE 2 — CHANNEL DISCOVERY                        [No LLM]            │
  │  · YouTube Data API v3 → top 15 channel candidates                       │
  │  · Manual add: paste URL / @handle / UCxxxx                              │
  │  · Admin confirms channels                                               │
  │                                │                                          │
  │  STAGE 3 — VIDEO DISCOVERY                          [No LLM]            │
  │  · keyword search per channel → top 3 videos by rankScore + engageScore  │
  │  · Fallback: channel's most popular videos if keyword search = 0         │
  │                                │                                          │
  │  STAGE 4 — COMMENT SCRAPING + PAIN EXTRACTION       [Haiku × ~75]       │
  │  · YouTube commentThreads API → up to 100 comments per video             │
  │  · Chunks of 20 → 1 Haiku call per chunk                                 │
  │  · Extracts: pain point, emotionalIntensity, vocabularyQuotes, vocData   │
  │  · Admin approves / rejects each pain point (min 3 approved)             │
  │                                │                                          │
  │  STAGE 4.5 — PAIN POINT CLUSTERING                  [Sonnet × 1]        │
  │  · Synthesizes all approved pain points into 2-3 thematic clusters       │
  │  · Each cluster: theme, dominantEmotion, bestQuotes, failedSolutions     │
  │                                │                                          │
  │  STAGE 5 — LP VARIANT GENERATION                    [Sonnet × 3]        │
  │  · VARIANT A — curiosity_hook  : counterintuitive contradiction          │
  │  · VARIANT B — pain_mirror     : exact user frustration reflected back   │
  │  · VARIANT C — outcome_promise : success stated in user's own words      │
  │  · Grade 6 reading level · banned buzzwords · "Give me X. Get Y." CTA   │
  │                                │                                          │
  │  OUTPUT: 3 LP Variants — reviewed at /admin/brand-clarity/[id]           │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### LLM Budget per Full Pipeline Run

| Stage | Model | Calls | Purpose |
|-------|-------|-------|---------|
| Stage 1 | Sonnet | 1 | LP parsing + keyword generation |
| Stage 4 | Haiku | ~75–105 | Bulk comment pain-point extraction |
| Stage 4.5 | Sonnet | 1 | Pain point clustering (synthesis) |
| Stage 5 | Sonnet | 3 (×2 calls each) | LP variant generation (A, B, C) |

> **Total: 5 Sonnet + ~75–105 Haiku calls per project run.**

### LLM Provider — Configurable via Admin UI

Brand Clarity supports two LLM providers, switchable without touching `.env`:

| Provider | Notes |
|----------|-------|
| **OpenRouter** *(default)* | Routes via `openrouter.ai/api/v1` using OpenAI SDK |
| **Anthropic Direct** | Routes via `@anthropic-ai/sdk` directly to `api.anthropic.com` |

Extended Thinking (Anthropic only) is configurable per pipeline stage with token budgets set in the admin settings panel at `/admin/brand-clarity/settings`.

### Brand Clarity Scripts

| Script | Stage | LLM | Trigger |
|--------|-------|-----|---------|
| `bc-lp-parser.ts` | 1 | Sonnet × 1 | `POST /api/bc/parse` |
| `bc-channel-discovery.ts` | 2 | none | `POST /[projectId]/discover-channels` |
| `resolve-channel.ts` | 2 | none | `POST /[projectId]/resolve-channel` |
| `bc-video-discovery.ts` | 3 | none | `POST /[projectId]/discover-videos` |
| `bc-scraper.ts` | 4 | Haiku × ~75 | `POST /[projectId]/scrape/start` |
| `bc-pain-clusterer.ts` | 4.5 | Sonnet × 1 | `POST /[projectId]/cluster-pain-points` |
| `bc-lp-generator.ts` | 5 | Sonnet × 3 | `POST /[projectId]/generate-variants` |
---

## SocialHub

**SocialHub** is an autonomous content-to-social pipeline built into the admin dashboard. It transforms your raw articles, discovered pain points, and Voice of Customer clusters into viral social media posts, then distributes them natively across major platforms.

> The core insight: Content distribution is the main bottleneck for solo founders. SocialHub eliminates manual posting by combining AI copywriting, local image generation, async video rendering, and a universal distribution API.

### SocialHub Pipeline — 3 Stages

```text
  SOCIALHUB PIPELINE
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  STAGE 1 — AI COPYWRITER                            [Sonnet × 1]         │
  │  · Source: Article / Pain Point / Cluster / KB Entry                     │
  │  · Enriches with fulltext Knowledge Base matching                        │
  │  · Output: Hook, Body Text, Hashtags, CTA, Video Script                  │
  │                                │                                          │
  │  STAGE 2 — MEDIA RENDERING                                               │
  │  · IMAGE: Server-side JSX → SVG → PNG via Satori & Resvg (instant)       │
  │  · VIDEO: Text-to-Speech (ElevenLabs) + AI Avatar (WaveSpeed)            │
  │                                │                                          │
  │  STAGE 3 — MULTI-PLATFORM DISTRIBUTION                                   │
  │  · Targets: Instagram, TikTok, X, LinkedIn, Pinterest, YouTube, etc.     │
  │  · Uses Upload-Post.com API (1 request → 10+ platforms)                  │
  │  · Fetches post analytics automatically and displays in the dashboard    │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Key Technologies
- **Satori**: Serverless-friendly HTML/JSX to SVG to PNG rendering. Zero AI hallucination, 100% brand typography matched.
- **WaveSpeed & ElevenLabs**: API integration for high-retention short-form video generation natively from text.
- **Upload-Post.com**: Universal distribution layer.

---

## Usage

Start the local development server from any terminal:

```bash
npm run dev
```

### Commands

| Action | Command |
|--------|-----|
| Start primary client dev server | `npm run dev` |
| Start API dev server | `npm run dev:api` |
| Sync DB schema | `npm run db:push` |
| Seed sites + Social Hub site backfill | `npm run migrate` |
| Build for production | `npm run build` |
| Start production server | `npm run start` |

---

## Configuration

Core environments live in `.env.local`:

```ini
DATABASE_URL=postgresql://user:pass@host/dbname
OPENAI_API_KEY=sk-placeholder
ANTHROPIC_API_KEY=sk-ant-placeholder
PERPLEXITY_API_KEY=pplx-placeholder
OPENROUTER_API_KEY=sk-or-placeholder
NODE_ENV=development

# Stage 0 — Reddit + YouTube scraping
APIFY_API_TOKEN=apify_api_placeholder
REDDIT_MAX_ITEMS_PER_TARGET=3       # posts per scrape target
REDDIT_CHUNK_SIZE=10                # posts per LLM analysis batch
REDDIT_ANALYSIS_MODEL=anthropic/claude-sonnet-4-6
YT_MAX_COMMENTS_PER_TARGET=300      # comments per YouTube video
YT_CHUNK_SIZE=80                    # comments per LLM analysis batch
YT_ANALYSIS_MODEL=anthropic/claude-sonnet-4-6

# Brand Clarity — YouTube Data API
YOUTUBE_API_KEY=your-yt-data-api-key

# SocialHub — External APIs
WAVESPEED_API_KEY=ws_placeholder
ELEVENLABS_API_KEY=el_placeholder
UPLOADPOST_API_KEY=up_placeholder
```

> **Note:** Brand Clarity and SocialHub LLM providers, models, and Extended Thinking budgets are configured via the **admin panel** (`/admin/brand-clarity/settings` and `/admin/social-hub/settings`) — not in `.env`.

### AI Integration

| Provider | Key | Used For |
|-------|-----|------------|
| `OpenAI` | `OPENAI_API_KEY` | GEO monitor queries, gap detection |
| `Anthropic` | `ANTHROPIC_API_KEY` | Deep context analysis, Brand Clarity (direct API) |
| `Perplexity` | `PERPLEXITY_API_KEY` | Live web search integration |
| `OpenRouter` | `OPENROUTER_API_KEY` | Scraping, draft generation, Brand Clarity, SocialHub copywriter (default) |
| `Apify` | `APIFY_API_TOKEN` | Reddit (`trudax/reddit-scraper-lite`) + YouTube (`streamers/youtube-comments-scraper`) |
| `YouTube Data API` | `YOUTUBE_API_KEY` | Brand Clarity channel + video discovery |
| `WaveSpeed` | `WAVESPEED_API_KEY` | SocialHub AI video generation |
| `ElevenLabs` | `ELEVENLABS_API_KEY` | SocialHub text-to-speech for videos |
| `Upload-Post` | `UPLOADPOST_API_KEY` | SocialHub multi-platform distribution and analytics |

---

## Features

| Feature | FrinterHero | Generic Templates | Other Portfolios |
|---------|:-----------:|:-----------:|:-----------------:|
| Built for AI indexing / LLM presence | YES | NO | Rarely |
| Reddit pain-point intelligence (Apify) | YES | NO | NO |
| LLM gap extraction + admin review queue | YES | NO | NO |
| **Brand Clarity — VoC LP generator** | **YES** | NO | NO |
| **SocialHub — Content-to-Social Pipeline** | **YES** | NO | NO |
| **Anthropic Direct API + Extended Thinking** | **YES** | NO | NO |
| Perfect semantic HTML & Schema.org | YES | Varies | Varies |
| Railway 1-Click deploy with DB | YES | NO | NO |
| Retro pixel-art aesthetics | YES | NO | NO |
| Blazing fast (Astro Islands) | YES | NO | Rarely |
| Type-safe PostgreSQL (Drizzle) | YES | NO | Rarely |
| Automated SEO metadata | YES | Varies | Varies |
| Internal linking from KB hints | YES | NO | NO |
| Animated pixel-art mascot (Frint_bot) | YES | NO | NO |

---

## Privacy

> **Your data is entirely yours.**

- FrinterHero doesn't track your visitors with invasive analytics.
- Your PostgreSQL database runs securely on your own Railway container.
- No forced cloud subscriptions, no lock-in.

---

## Tech Stack

| Component | Technology | Why |
|-----------|---------|-----|
| AI Indexing | `Astro` | Ships zero JavaScript by default, unbeatable load times, pristine SEO. |
| Styling | `Tailwind CSS` | Rapid UI, strictly scoped design tokens (Teal, Violet, Gold). |
| Database ORM | `Drizzle ORM` | Type-safe, extremely fast, zero-dependency data modeling. |
| Database | `PostgreSQL` | Reliable, relational data storage. |
| Deployment | `Railway` | Built-in Nixpacks support, 1-click template with DB provisioning. |
| Pixel Art | `DOM / CSS` | Custom typewriter effects and bot animations without heavy libs. |
| Brand Clarity LLM | `@anthropic-ai/sdk` + `OpenRouter` | Dual-provider unified client with Extended Thinking support. |

---

## Roadmap

- [x] Astro SSG/SSR setup
- [x] Drizzle ORM + PostgreSQL integration
- [x] Railway 1-click template with `railway.toml`
- [x] Retro aesthetic design system
- [x] Semantic HTML and SEO foundations
- [x] Reddit scraping engine (Apify + LLM pain-point extraction)
- [x] YouTube comments scraping engine (Apify + LLM pain-point extraction)
- [x] GEO monitor — gap detection across OpenAI / Claude / Gemini
- [x] Admin draft generator — mega-prompt → full article
- [x] Internal linking from Knowledge Base hints
- [x] **Brand Clarity v2** — 5-stage VoC pipeline (LP → 3 LP variants)
- [x] **Brand Clarity — Anthropic Direct API + Extended Thinking**
- [x] **Brand Clarity — LLM settings panel** (`/admin/brand-clarity/settings`)
- [x] **SocialHub — Multi-platform content distribution**
- [x] **SocialHub — Satori Image & WaveSpeed Video generator**
- [ ] Blog markdown pipeline
- [ ] Frint_bot interactive AI chat window
- [ ] RSS Feed generation
- [ ] Perplexity AI integration for live stats
- [ ] Railway 1-click deploy button (public template)

---

## FAQ

**Q: Do I need an NPM account to use this?**

No. Railway automatically pulls your repository from GitHub and installs the necessary NPM dependencies securely on their build servers. You only need a GitHub and Railway account.

**Q: Why does the first deployment take a minute?**

Railway provisions a fresh PostgreSQL database instance, clones the repository, installs all NPM packages, and builds the Astro application. Subsequent deployments are much faster.

**Q: How do I change the text in the Hero section?**

The text is currently configured in `apps/client-przemyslawfilipiak/src/components/Hero.astro`. You can update the typewriter text directly in the JavaScript block at the bottom of the file.

**Q: Can I use MySQL or SQLite instead of PostgreSQL?**

Out of the box, we use PostgreSQL optimized for Railway and Drizzle. You can switch to SQLite or MySQL by modifying `drizzle.config.ts` and installing the respective Drizzle drivers.

**Q: What's Frint_bot?**

Frint_bot is Frinter's pixel-art mascot. Built from the three Frinter brand colors: teal body (`#4a8d83`), violet eyes (`#8a4e64`), gold antenna (`#d6b779`), it acts as your personal AI avatar.

**Q: What is Brand Clarity and who is it for?**

Brand Clarity is a built-in admin tool for anyone who wants to A/B test landing page copy. It automatically discovers YouTube channels in your niche, scrapes comments, extracts the sharpest pain points, and generates 3 LP variants grounded in real customer language — not founder assumptions.

**Q: Which LLM provider should I use for Brand Clarity?**

Start with **OpenRouter** (default) — lower friction, no additional setup. Switch to **Anthropic Direct** if you want Extended Thinking for higher-quality variant generation, especially for Cluster and Generator stages. Configure everything in `/admin/brand-clarity/settings`.

**Q: Does SocialHub post to my accounts automatically?**

Yes. Once you approve the AI-generated copy and media (Satori images or WaveSpeed videos), SocialHub uses the Upload-Post.com API to push your content directly to all your selected platforms (Instagram, TikTok, LinkedIn, Twitter, YouTube, etc.) simultaneously.

---

## Contributing

FrinterHero is open source and contributions are welcome.

**Ways to contribute:**
- [Bug Report](../../issues/new?template=bug_report.md) — Found something broken?
- [Feature Request](../../issues/new?template=feature_request.md) — Have an idea?
- [Pull Request](../../pulls) — Fix a bug or build a feature

**Before contributing, read [`CONTRIBUTING.md`](CONTRIBUTING.md)** for code style, branch naming, and PR checklist.

### Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/FrinterHero.git
cd FrinterHero
npm install
cp .env.example .env.local
npm run dev
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=delta240mvt/FrinterHero&type=Date)](https://star-history.com/#delta240mvt/FrinterHero&Date)

---

## License

MIT — see [`LICENSE`](LICENSE) for details.

---

<div align="center">

**FrinterHero** — part of the [Frinter](https://frinter.app) personal productivity ecosystem

*Built with the Retro Pixel aesthetic. Be recognized. Dominate the search.*

</div>
