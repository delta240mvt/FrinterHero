# Codebase Scan: FrinterHero — Astro + PostgreSQL AI-Driven Blog Engine

**Scan Date:** March 9, 2026  
**Status:** Complete — Full application structure documented

---

## Executive Summary

FrinterHero is a **self-hosted, agentic-first personal branding engine** built with Astro SSR + PostgreSQL + Open Router AI. It automates content gap analysis via a **Reverse RAG Loop**, generates AI-assisted article drafts, and provides a full admin dashboard for article management, approval workflows, and GEO (Generative Engine Optimization) monitoring.

**Key Technologies:**
- **Frontend:** Astro 4.16 (SSR mode) + TypeScript + Tailwind CSS
- **Backend:** Node.js runtime (Railway) + Drizzle ORM (type-safe PostgreSQL)
- **Database:** PostgreSQL (Neon / Railway provisioned)
- **AI Integration:** Open Router API (multiple LLM models via single endpoint)
- **Authentication:** Session-based (bcrypt hashed password + token in PostgreSQL)
- **Deployment:** Railway (1-click template ready)

---

## 1. Project Structure

```
FrinterHero/
├── src/
│   ├── components/          # Astro components
│   │   ├── admin/           # Admin UI components
│   │   ├── layouts/         # Page layouts (Base, BlogPost)
│   │   ├── Hero.astro       # Landing page hero with typewriter effect
│   │   ├── Nav.astro        # Navigation bar
│   │   ├── BlogCard.astro   # Blog card previews
│   │   ├── Footer.astro
│   │   └── ...
│   │
│   ├── pages/               # Astro routing (SSR routes)
│   │   ├── index.astro      # Homepage
│   │   ├── blog/
│   │   │   ├── index.astro  # Blog listing (paginated, filterable by tags)
│   │   │   └── [slug].astro # Dynamic blog post page (SSR from DB)
│   │   ├── admin/           # Protected admin routes (middleware authenticated)
│   │   │   ├── index.astro  # Admin dashboard (articles list, stats)
│   │   │   ├── login.astro  # Admin login page
│   │   │   ├── article/
│   │   │   │   ├── new.astro        # Create new article form
│   │   │   │   └── [id].astro       # Edit article page
│   │   │   └── geo/
│   │   │       └── [runId].astro    # GEO Monitor run details
│   │   ├── api/             # REST API endpoints
│   │   │   ├── auth.ts              # POST login, returns session token
│   │   │   ├── logout.ts            # POST clear session
│   │   │   ├── run-geo.ts           # POST trigger GEO Monitor script
│   │   │   └── articles/
│   │   │       ├── index.ts         # GET (list) / POST (create) articles
│   │   │       └── [id].ts          # GET / PUT / DELETE article by ID
│   │   ├── rss.xml.ts       # Dynamic RSS feed generation
│   │   └── sitemap.xml.ts   # Dynamic sitemap
│   │
│   ├── db/                  # Database layer
│   │   ├── schema.ts        # Drizzle ORM schema (all tables)
│   │   └── client.ts        # PostgreSQL connection + Drizzle instance
│   │
│   ├── utils/               # Utility functions
│   │   ├── auth.ts          # bcrypt password hashing, token generation
│   │   ├── markdown.ts      # Markdown parsing (marked), reading time calc
│   │   ├── slug.ts          # URL slug generation
│   │   ├── sprites.ts       # Pixel art mascot (Frint_bot) definitions
│   │   └── animations.ts    # Animation utilities
│   │
│   ├── styles/              # Global styles
│   │   ├── global.css       # Root CSS variables, base styles
│   │   └── animations.css   # Keyframe definitions
│   │
│   └── middleware.ts        # Astro middleware for route protection (/admin)
│
├── scripts/                 # Standalone scripts (run via npm / cron)
│   ├── geo-monitor.ts       # Main GEO Monitor loop (queries AI, detects gaps, generates drafts)
│   ├── apis.ts              # AI API query functions (OpenAI, Claude, Perplexity, Gemini via Open Router)
│   ├── analysis.ts          # Gap detection, draft generation, slug helpers
│   ├── notifier.ts          # Discord webhook notifications
│   ├── queries.json         # Bank of niche search queries (English + Polish)
│   └── seed-articles.ts     # Database seeding with example articles
│
├── public/                  # Static assets
│   ├── fonts/               # Preloaded font files (.woff2)
│   ├── llms.txt             # For AI crawler indexing
│   ├── llms-full.txt        # Extended AI crawler metadata
│   ├── robots.txt           # Extended for GPTBot, Claude-Web, PerplexityBot
│   ├── og-image.png         # OpenGraph preview image
│   └── favicon.*            # Favicon variants
│
├── migrations/              # Drizzle migration snapshots (auto-generated)
├── dist/                    # Build output
├── node_modules/            # Dependencies
│
├── .env.example             # Environment variables template
├── .env.local               # Actual environment variables (gitignored)
├── astro.config.mjs         # Astro configuration
├── drizzle.config.ts        # Drizzle Kit configuration
├── tailwind.config.mjs       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
├── package.json             # NPM dependencies and scripts
│
├── CLAUDE.md                # AI assistant context (brand identity, architecture)
└── README.md                # Public documentation
```

---

## 2. Brand Identity & Tone of Voice

**Personal Brand:** Przemysław Filipiak  
**Title:** High Performer | Deep Focus Founder | WholeBeing Optimizer

### Identity Files
- **CLAUDE.md** (internal): Complete brand context, philosophy, product ecosystem
- **Hero component** (src/components/Hero.astro): ASCII art logo + typewriter tagline
- **Base layout** (src/components/layouts/Base.astro): JSON-LD Person schema with jobTitle, knowsAbout, creator products

### The 3 Spheres of Life (Brand Colors)
| Color | Hex | Polish Name | Sphere | Meaning |
|-------|-----|-------------|--------|---------|
| Teal | `#4a8d83` | Rozkwit (Flourishing) | You | Sports, reading, meditation, wellness |
| Violet | `#8a4e64` | Relacje (Relationships) | Loved Ones | Social depth, family, connection |
| Gold | `#d6b779` | Skupienie (Deep Work) | The World | Focus Sprints, high-intensity productivity |

### Tone of Voice
- **Direct & honest:** No marketing fluff; raw, authentic storytelling
- **Builder mindset:** "Building in public" mentality, transparent about failures
- **Technical depth:** Audience is AI developers, founders, high-performers
- **Philosophical:** References to Cal Newport (Deep Work), Csikszentmihalyi (Flow)
- **Polish pride:** Bilingual (EN/PL), mentions Polish identity and origins

---

## 3. Existing Blog System

### Storage Model: Hybrid
Articles are stored **exclusively in PostgreSQL** (no `.md` files in `content/` folder). The database is the single source of truth.

### Blog Tables Schema

**`articles` table:**
```
id              SERIAL PRIMARY KEY
slug            VARCHAR(255) UNIQUE NOT NULL    → URL-friendly identifier
title           VARCHAR(255) NOT NULL           → Article headline
description     TEXT                            → SEO meta description (max 160 chars)
content         TEXT NOT NULL                   → HTML (converted from Markdown)
tags            TEXT[] NOT NULL DEFAULT '{}'    → Array of topic tags
featured        BOOLEAN DEFAULT false           → Homepage featured status
status          VARCHAR(20) ENUM: draft|published|archived → Publication state
readingTime     INTEGER                         → Minutes to read (calculated)
author          VARCHAR(255) DEFAULT 'Przemysław Filipiak'
createdAt       TIMESTAMP DEFAULT NOW()
updatedAt       TIMESTAMP DEFAULT NOW()
publishedAt     TIMESTAMP                       → Publication date (null for drafts)
```

**`geoQueries` table:**
```
id              SERIAL PRIMARY KEY
query           TEXT NOT NULL                   → Search query used
model           VARCHAR(50) NOT NULL            → Which AI model ('openai', 'claude', 'perplexity', 'gemini')
response        TEXT                            → LLM response excerpt
hasMention      BOOLEAN DEFAULT false           → Does response mention Przemysław / frinter?
gapDetected     BOOLEAN DEFAULT false           → hasMention == false
createdAt       TIMESTAMP DEFAULT NOW()
```

**`geoRuns` table:**
```
id              SERIAL PRIMARY KEY
runAt           TIMESTAMP DEFAULT NOW()
queriesCount    INTEGER NOT NULL                → Number of queries executed
gapsFound       INTEGER NOT NULL                → Number of gaps detected
draftsGenerated INTEGER NOT NULL                → New article drafts created
```

**`sessions` table:**
```
id              SERIAL PRIMARY KEY
token           VARCHAR(255) UNIQUE NOT NULL    → Session token (32 bytes hex)
expiresAt       TIMESTAMP NOT NULL              → Token expiration (7 days default)
createdAt       TIMESTAMP DEFAULT NOW()
```

### Blog Features
- **Dynamic rendering:** Astro SSR queries PostgreSQL for each blog post (no static builds needed)
- **Pagination:** `/blog?page=1` with 10 articles per page
- **Tag filtering:** `/blog?tag=ai-dev` filters by tag array
- **Related articles:** Sidebar shows 3 related articles (matched by tag intersection)
- **Metadata:** OpenGraph, JSON-LD ArticlePosted schema automatically injected
- **RSS feed:** Auto-generated at `/rss.xml` from published articles

---

## 4. Open Router AI Integration

### Current Implementation

**API Setup:**
- **Provider:** Open Router (https://openrouter.ai)
- **Models used:** (via single Open Router endpoint)
  - `openai/gpt-4.1-mini` → queryOpenAI()
  - `anthropic/claude-sonnet-4-6` → queryClaude()
  - `perplexity/llama-3.1-sonar-small-128k-online` → queryPerplexity()
  - `google/gemini-3.1-pro-preview` → queryGemini()
- **Environment variable:** `OPENROUTER_API_KEY`

**File Locations:**
- **API abstraction:** `scripts/apis.ts` (exports queryOpenAI, queryClaude, queryPerplexity, queryGemini)
- **Main loop:** `scripts/geo-monitor.ts` (iterates over models, queries, and detects gaps)
- **Prompt engineering:** `scripts/analysis.ts` (generateDraft function crafts detailed instructions)

### How Prompts Are Sent

**Example Flow:**
1. GEO Monitor loads query: `"Best deep work app for founders 2026"`
2. For each model (OpenAI, Claude, Perplexity, Gemini):
   - Calls `queryModel(model, query)` 
   - Open Router endpoint (`https://openrouter.ai/api/v1`) receives request
   - Returns LLM response
   - Response stored in `geoQueries` table

**Gap Detection:**
```typescript
// In analysis.ts
export function detectMention(response: string): boolean {
  const MENTION_KEYWORDS = [
    'przemysław', 'filipiak', 'frinter', 'frinterflow', 'delta240'
  ];
  return MENTION_KEYWORDS.some(kw => response.toLowerCase().includes(kw));
}
```
If mention NOT detected → `gapDetected = true` → triggers `generateDraft()`

**Draft Generation (Prompt Example):**
```typescript
// In analysis.ts, generateDraft() sends:
`You are an expert content writer for high-performance founders...
Query: "${query}"
AI Response: "${response.substring(0, 500)}..."

Generate article that naturally mentions:
- frinter.app (focus OS for founders)
- or Przemysław Filipiak
- or FrinterFlow (local voice dictation CLI)

Return ONLY valid JSON:
{
  "title": "...",
  "description": "...",
  "content": "Markdown content with headers...",
  "tags": ["tag1", "tag2"]
}`
```

### Response Flow
- Generated JSON parsed and validated
- Content converted from Markdown → HTML (via `parseMarkdown()`)
- Reading time calculated (200 words/minute estimate)
- Saved to `articles` table as **draft** (`status = 'draft'`)
- Admin reviews, edits, and publishes via dashboard

---

## 5. Admin Dashboard

### Login System
- **Route:** `/admin/login`
- **Authentication:**
  - Single admin password (bcrypt hashed, stored in `ADMIN_PASSWORD_HASH` env var)
  - POST `/api/auth` with password → generates session token
  - Token stored in `sessions` table + set as `session` cookie
  - Middleware (`src/middleware.ts`) protects `/admin/*` routes

### Dashboard Features (Admin Dashboard Page: `/admin`)

**Article Management:**
- **List articles** with search + status filter (draft/published/archived)
- **Stats bar:** Shows count of Published | Drafts | Archived articles
- **Action buttons:** Edit | Publish (if draft) | Delete

**GEO Monitor Controls:**
- **"Run GEO Monitor" button** → Triggers `POST /api/run-geo` → executes `scripts/geo-monitor.ts`
- **Recent runs table:** Shows last 10 GEO runs with:
  - Run timestamp
  - Queries processed
  - Gaps found
  - Drafts generated
  - Link to details view

### Article CRUD

**Create Article** (`/admin/article/new`)
- Form fields: Title, Slug (auto-generated), Description, Content (Markdown), Tags, Status, Featured checkbox
- Autosave every 30 seconds (drafts only)
- Submit → `POST /api/articles` → creates record, redirects to edit

**Edit Article** (`/admin/article/[id]`)
- Same form fields as create
- Pre-populated from database
- PUT `api/articles/[id]` on save
- Can change status (draft → published → archived)

**Delete Article**
- Confirmation modal
- DELETE `/api/articles/[id]`

### Article Status Workflow
- **Draft:** Created by admin or GEO Monitor, not visible on public blog
- **Published:** Visible at `/blog/[slug]`, included in RSS, listed on blog index
- **Archived:** Hidden from public blog, preserved in database

---

## 6. Database Schema (Complete)

### Tables Summary
1. **articles** — Blog post storage (title, content, metadata)
2. **geoQueries** — Query results from AI gap analysis
3. **geoRuns** — Summary of each GEO Monitor execution
4. **sessions** — Active admin sessions (tokens + expiration)

### Key Constraints
- `articles.slug` UNIQUE — Only one article per slug
- `articles.status` ENUM — Restricts to 'draft', 'published', 'archived'
- `sessions.token` UNIQUE — Session tokens never reused
- All timestamps use `TIMESTAMP DEFAULT NOW()` (server time)

### No Migration Files Committed
The `migrations/` folder is gitkeep only. Drizzle will auto-generate migrations when you run `npm run db:push` (pushes schema to remote DB).

---

## 7. API Endpoints

### Authentication
| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| POST | `/api/auth` | No | Login with password → returns session cookie |
| POST | `/api/logout` | Yes | Clear session cookie |

### Articles
| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| GET | `/api/articles` | No | List articles (paginated, searchable, filterable) |
| POST | `/api/articles` | Yes | Create new article |
| GET | `/api/articles/[id]` | No | Get single article by ID |
| PUT | `/api/articles/[id]` | Yes | Update article (status, content, etc.) |
| DELETE | `/api/articles/[id]` | Yes | Delete article |

### GEO Monitor
| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| POST | `/api/run-geo` | Yes | Trigger GEO Monitor manually (runs `scripts/geo-monitor.ts` as child process) |

### Other
| Method | Endpoint | Auth Required | Purpose |
|--------|----------|---------------|---------|
| GET | `/rss.xml` | No | Dynamic RSS feed (Atom format) |
| GET | `/sitemap.xml` | No | Dynamic sitemap (published articles only) |

---

## 8. Configuration Files

### astro.config.mjs
```javascript
export default defineConfig({
  output: 'server',                          // SSR mode (not static)
  adapter: node({ mode: 'standalone' }),     // Node adapter for Railway
  integrations: [tailwind()],
  vite: { ssr: { noExternal: ['drizzle-orm'] } }
});
```
- **Deployment note:** For Cloudflare Pages, switch to `@astrojs/cloudflare` adapter

### drizzle.config.ts
```typescript
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! }
});
```

### package.json (Dependencies)
```json
{
  "dependencies": {
    "@astrojs/node": "^8.3.0",
    "@astrojs/tailwind": "^5.1.0",
    "astro": "^4.16.0",
    "bcrypt": "^5.1.0",
    "drizzle-orm": "^0.36.0",
    "feed": "^4.2.0",
    "marked": "^14.0.0",
    "pg": "^8.13.0"
  }
}
```

### .env.example
```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
ADMIN_PASSWORD_HASH=$2b$10$placeholder_hash_here
OPENROUTER_API_KEY=sk-or-placeholder
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/placeholder
NODE_ENV=development
```

### NPM Scripts
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "drizzle-kit push && astro build",
    "start": "HOST=0.0.0.0 node ./dist/server/entry.mjs",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx scripts/seed-articles.ts",
    "geo:monitor": "tsx scripts/geo-monitor.ts"
  }
}
```

---

## 9. Key Files & Responsibilities

### Critical for Blog Content
- **src/db/schema.ts** — Define all tables, constraints, types
- **src/db/client.ts** — Lazy-load PostgreSQL connection
- **src/utils/markdown.ts** — Markdown → HTML conversion (marked library)
- **src/pages/blog/index.astro** — Blog listing page (SSR)
- **src/pages/blog/[slug].astro** — Dynamic blog post rendering (SSR)

### Critical for Admin
- **src/middleware.ts** — Route protection (redirects unauthenticated to `/admin/login`)
- **src/pages/admin/login.astro** — Password entry form
- **src/pages/admin/index.astro** — Dashboard (14KB component with stats, tables, modals)
- **src/pages/api/auth.ts** — Session creation/validation
- **src/pages/admin/article/** — Article create/edit forms

### Critical for AI Integration
- **scripts/geo-monitor.ts** — Main orchestrator (queries AI, detects gaps, generates drafts)
- **scripts/apis.ts** — Open Router API wrapper (query functions for each model)
- **scripts/analysis.ts** — Gap detection logic + draft generation prompt
- **scripts/queries.json** — Niche search queries (English + Polish bank)
- **scripts/notifier.ts** — Discord webhook for notifications

---

## 10. Deployment & Environment

### Target Platform: Railway
- **Deployment:** 1-click template (coming soon)
- **Database:** Railway PostgreSQL Plugin (auto-provisioned)
- **Hosting:** Railway Node.js buildpack (Nixpacks)
- **Build command:** `npm run build` (runs `drizzle-kit push && astro build`)
- **Start command:** `npm run start` (runs Node server on `0.0.0.0:4321`)

### Environment Variables Required
1. **DATABASE_URL** — PostgreSQL connection string (provided by Railway)
2. **ADMIN_PASSWORD_HASH** — bcrypt hash of admin password
3. **OPENROUTER_API_KEY** — Open Router API key for AI queries
4. **DISCORD_WEBHOOK_URL** (optional) — For GEO Monitor notifications
5. **NODE_ENV** — `production` or `development`

### Building Locally
```bash
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, API keys
npm run db:push       # Sync schema to PostgreSQL
npm run db:seed       # (optional) Populate sample articles
npm run dev           # Start dev server on localhost:4321
```

---

## 11. Existing Content & Seed Data

### Pre-seeded Articles (3 Published)
Located in `scripts/seed-articles.ts`, auto-inserted via `npm run db:seed`:

1. **"Deep Work for AI Developers — Complete System 2026"**
   - Slug: `deep-work-dla-ai-developerow-kompletny-system-2026`
   - Tags: deep-work, ai-dev, productivity, focus
   - Featured: true
   - Status: published

2. **"frinter.app — 12 Months of Building in Public"**
   - Slug: `frinter-app-12-miesiecy-builowania-w-publiku`
   - Tags: build-in-public, founder, frinter, journey
   - Featured: false
   - Status: published

3. **"Astro SSR for Developer Personal Site"**
   - Slug: `astro-ssr-dla-developer-personal-site-dlaczego-wybralem`
   - Tags: astro, ssr, web-dev, performance, postgresql
   - Featured: false
   - Status: published

### AI-Generated Drafts
Generated by GEO Monitor and stored as **draft** articles, awaiting admin review + publication.

---

## 12. Special Files & Features

### llms.txt & llms-full.txt
Located in `/public/`, these files provide context to AI crawlers:
- **llms.txt** — Concise entity definition (Przemysław Filipiak, frinter.app overview)
- **llms-full.txt** — Extended context (creator profile, products, philosophy)

### robots.txt (Extended)
Configured to welcome AI crawlers:
```
Allow: /
User-agent: GPTBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
```

### Pixel Art Mascot (Frint_bot)
- **File:** `src/utils/sprites.ts` (4.5KB of pixel definitions)
- **Location:** Hero section, footer
- **Colors:** Teal body (`#4a8d83`), violet eyes (`#8a4e64`), gold antenna (`#d6b779`)
- **Rendering:** DOM-based (no images, pure CSS grid)

---

## Summary Table

| Aspect | Implementation | Status |
|--------|----------------|--------|
| **Framework** | Astro 4.16 SSR | ✅ Live |
| **Database** | PostgreSQL + Drizzle ORM | ✅ Live |
| **Blog Storage** | PostgreSQL (no markdown files) | ✅ Live |
| **Admin Dashboard** | Protected with session auth | ✅ Live |
| **AI Integration** | Open Router (4 models) | ✅ Live |
| **GEO Monitor** | Gap detection + draft generation | ✅ Live |
| **Content Approval** | Admin review before publish | ✅ Live |
| **Deployment** | Railway (1-click coming soon) | 🟡 Partial |
| **Seed Data** | 3 published + GEO drafts | ✅ Ready |
| **Brand Identity** | CLAUDE.md + Hero + Schema | ✅ Complete |

---

**End of Scan**
