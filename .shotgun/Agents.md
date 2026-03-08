# Personal Page — Przemysław Filipiak

Personal page of Przemysław Filipiak — Polish founder and AI developer. One-page landing with dark mode retro aesthetic, Astro SSR blog with dynamic article management from PostgreSQL, admin panel with human review checkpoint for GEO-generated content, and automated Reverse RAG Loop to monitor AI recommendations.

## .shotgun/ Files

Read ALL of these before writing any code:

- `.shotgun/specification.md` — Requirements, architecture, and acceptance criteria
- `.shotgun/plan.md` — Implementation plan with 7 stages and dependencies
- `.shotgun/tasks.md` — **Start here.** Tasks by stage with `[x]` checkboxes
- `.shotgun/personalpage.md` — Visual design, typography, color system, GEO strategy
- `.shotgun/research.md` — Background research and analysis (if exists)

## Quality Checks

```bash
npm run build
npm run preview
npx tsc --noEmit
npx eslint src/ --fix
npm run lighthouse:mobile
npm run lighthouse:desktop
```

## How to Work

1. **Read every `.shotgun/` file above.** Do NOT modify them except `tasks.md` checkboxes.
2. **Open `.shotgun/tasks.md`.** Find the first stage with incomplete tasks (`[ ]`). That is the ONLY stage to work on.
3. **Check dependencies.** Verify "Depends on:" line—only start a stage when all dependencies are complete.
4. **Plan before coding.** Review all tasks in the stage, understand file structure, dependencies between tasks.
5. **Execute each task in order.** Create/modify files exactly as specified. Mark `[x]` in `.shotgun/tasks.md` as you complete it.
6. **Test after each task.** Run relevant quality checks (build, type-check, test).
7. **Verify success criteria.** Before moving to next task, confirm the "Success:" line in that task is met.
8. **Stop at stage boundary.** When all tasks in a stage are complete (`[x]`), run full quality checks and STOP. Do not start next stage without approval.

**ONE stage at a time. Do not skip ahead. Do not start the next stage without human review.**

## Critical Context

### Tech Stack (EXACT — do not deviate)

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Astro (SSR mode) | ^4.x |
| Adapter | @astrojs/node | latest |
| Database | PostgreSQL (Neon) | serverless |
| ORM | Drizzle | ^0.x |
| CSS | Tailwind + CSS custom properties | ^3.x |
| Language | TypeScript strict | ^5.x |
| Build | Vite (via Astro) | built-in |
| Hosting | Cloudflare Pages | free tier |
| Authentication | Session cookie + bcrypt | HTTP-only |
| Fonts | Self-hosted WOFF2 | no CDN |
| Animations | Vanilla JS + CSS keyframes | zero libraries |
| Icons | Pixel art canvas (12×12) | custom |

**NO unauthorized additions:** Do NOT introduce Webpack, Babel, eslint config changes, extra UI libraries, or technology not explicitly listed above without asking first.

### Color System (Non-Negotiable)

From `personalpage.md` section 3:

```css
--bg-base:      #1e293b;    /* main bg */
--bg-surface:   #334155;    /* cards */
--bg-elevated:  #0f172a;    /* hero, modal */
--text-primary: #ffffff;
--text-secondary: #94a3b8;
--teal:         #4a8d83;    /* primary accent */
--violet:       #8a4e64;    /* secondary accent */
--gold:         #d6b779;    /* highlight accent */
```

**Dark mode ONLY.** No light mode. No exceptions.

### Design Philosophy (From personalpage.md)

- **ASCII hero** (not image): `<pre>` with Courier Prime, fade-in animation, no parallax
- **Typing effect** on tagline (vanilla JS, one-time on page load)
- **Blinking cursor** (gold `▋` character, 0.8s cycle)
- **Pixel art icons** rendered as canvas (12×12 matrix from `sprites.ts`)
- **Lighthouse 100/100/100/100** is mandatory (mobile + desktop)
- **Zero JavaScript overhead** in hero/critical path
- **Self-hosted fonts** (preload WOFF2, swap strategy)
- **Intersection Observer** for scroll animations (not scroll listeners)

### Database Schema (Exact structure)

From `plan.md` Stage 1.6:

**articles** table:
```
id (serial, PK)
slug (varchar 255, unique)
title (varchar 255)
description (text)
content (text) — stored as HTML, parsed from Markdown
tags (text[])
featured (boolean, default false)
status (varchar: 'draft'|'published'|'archived', default 'draft')
readingTime (integer) — auto-calculated
author (varchar 255, default 'Przemysław Filipiak')
createdAt (timestamp, default now())
updatedAt (timestamp, default now())
publishedAt (timestamp, nullable)
```

**geoQueries** table:
```
id (serial, PK)
query (text)
model (varchar 50) — 'openai'|'claude'|'perplexity'
response (text)
hasMention (boolean, default false)
gapDetected (boolean, default false)
createdAt (timestamp, default now())
```

**geoRuns** table:
```
id (serial, PK)
runAt (timestamp, default now())
queriesCount (integer)
gapsFound (integer)
draftsGenerated (integer)
```

**sessions** table:
```
id (serial, PK)
token (varchar 255, unique)
expiresAt (timestamp)
createdAt (timestamp, default now())
```

### Folder Structure (CREATE EXACTLY)

```
premium-personal/
├── src/
│   ├── db/
│   │   ├── schema.ts          # Drizzle schema definitions
│   │   ├── client.ts          # Drizzle instance + Pool
│   │   └── migrations/        # Auto-generated by drizzle-kit
│   ├── pages/
│   │   ├── index.astro        # One-page landing
│   │   ├── admin/
│   │   │   ├── login.astro
│   │   │   ├── index.astro
│   │   │   ├── article/
│   │   │   │   ├── new.astro
│   │   │   │   └── [id].astro
│   │   │   └── geo/
│   │   │       └── [runId].astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── rss.xml.ts
│   │   ├── sitemap.xml.ts
│   │   └── llms.txt.ts
│   ├── api/
│   │   ├── auth.ts
│   │   ├── articles.ts
│   │   ├── logout.ts
│   │   └── geo.ts
│   ├── components/
│   │   ├── layouts/
│   │   │   ├── Base.astro
│   │   │   ├── Landing.astro
│   │   │   └── BlogPost.astro
│   │   ├── Hero.astro
│   │   ├── AsciiHero.astro
│   │   ├── PixelIcon.astro
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── About.astro
│   │   ├── Projects.astro
│   │   ├── BlogPreview.astro
│   │   ├── Contact.astro
│   │   ├── ProjectCard.astro
│   │   ├── BlogCard.astro
│   │   └── admin/
│   │       ├── ArticleTable.astro
│   │       ├── ArticleForm.astro
│   │       ├── GeoRunsTable.astro
│   │       └── ConfirmDelete.astro
│   ├── styles/
│   │   ├── tokens.css         # CSS custom properties
│   │   ├── global.css         # Reset + font-face + @apply
│   │   └── animations.css     # Keyframes
│   ├── utils/
│   │   ├── auth.ts
│   │   ├── slug.ts
│   │   ├── animations.ts
│   │   ├── sprites.ts
│   │   └── markdown.ts
│   └── middleware.ts          # Session check for /admin
├── scripts/
│   ├── geo-monitor.ts         # Main CRON script
│   ├── queries.json           # Query bank (EN + PL)
│   ├── apis.ts                # OpenAI, Claude, Perplexity wrappers
│   ├── analysis.ts            # Gap detection + draft generation
│   ├── notifier.ts            # Discord webhook
│   └── package.json           # Scripts only (inherited from root)
├── public/
│   ├── fonts/
│   │   ├── CourierPrime-Regular.woff2
│   │   ├── CourierPrime-Bold.woff2
│   │   ├── Poppins-500.woff2
│   │   ├── Poppins-600.woff2
│   │   ├── Poppins-700.woff2
│   │   ├── Roboto-300.woff2
│   │   └── Roboto-400.woff2
│   ├── favicon.svg
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   ├── robots.txt
│   └── llms.txt               # or generated via src/pages/llms.txt.ts
├── migrations/                # Auto-generated by drizzle-kit
├── .github/
│   └── workflows/
│       ├── deploy.yml         # Cloudflare Pages
│       └── geo-monitor.yml    # Weekly CRON
├── .env.local                 # (git-ignored)
├── astro.config.mjs
├── tsconfig.json
├── tailwind.config.mjs
├── drizzle.config.ts
├── package.json
└── README.md
```

### Environment Variables (.env.local Template)

```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
ADMIN_PASSWORD_HASH=bcrypt_hash_here
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
NODE_ENV=development
```

**CRITICAL:** Never commit `.env.local`. Use `.env.example` for template. All secrets in Cloudflare env vars for production.

### Lighthouse Requirements (EXACT)

- **Performance:** 100 (all pages, mobile + desktop)
- **Accessibility:** 100 (semantic HTML, ARIA on canvas)
- **Best Practices:** 100 (HTTPS ready, no console errors)
- **SEO:** 100 (meta tags, schema, mobile-friendly)

**Specific constraints:**
- LCP (Largest Contentful Paint): < 1.5s (ASCII hero is pure text, instant)
- CLS (Cumulative Layout Shift): 0 (all images must have width/height)
- FID/INP: < 100ms (minimal JS execution)
- No render-blocking scripts (all scripts async/defer)
- Fonts preloaded (no FOUT)
- Critical CSS inlined

### Admin Panel Security

- **Middleware:** `src/middleware.ts` checks session token on every `/admin/*` request
- **No public routes under /admin:** All require valid session
- **Session storage:** PostgreSQL `sessions` table
- **Token format:** 32-byte hex string from `crypto.randomBytes(32).toString('hex')`
- **Expiry:** 7 days from creation
- **Cookie:** HTTP-only, Secure, SameSite=Strict
- **Password:** Single admin password, bcrypt hashed, stored in `ADMIN_PASSWORD_HASH` env var
- **Auto-publish:** DISABLED — only "draft" articles created, human review required

### GEO Monitor Behavior

- **Frequency:** Weekly (GitHub Actions schedule: `0 9 * * 0` = Sunday 9 AM UTC)
- **Query bank:** `scripts/queries.json` (20+ EN, 10+ PL queries)
- **Models:** OpenAI (gpt-4-turbo), Claude (claude-3-opus), Perplexity (pplx-7b-online)
- **Detection:** Keywords in response (Przemysław, filipiak, frinter, FrinterFlow) → hasMention=true
- **Gap:** hasMention=false → gapDetected=true
- **Draft generation:** For each gap, LLM generates article structure (title, description, content, tags)
- **Database:** Insert into `geoQueries` (each query result) + `geoRuns` (summary)
- **Draft status:** Always `status='draft'` — NEVER auto-publish
- **Notification:** Discord webhook embed with queriesCount, gapsFound, draftsGenerated

### Pixel Art Sprites (Exact Format)

From `personalpage.md` section 8. 12×12 integer matrix, color mapping:

```javascript
const COLOR_MAP = {
  0: 'transparent',
  1: '#4a8d83',   // teal — body
  2: '#8a4e64',   // violet — eyes/highlight
  3: '#d6b779',   // gold — details
};

// Example: ai sprite (12×12)
const ai = [
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,3,3,3,3,3,3,1,1,0],
  // ... 10 more rows
];
```

Render via `<canvas>` in PixelIcon.astro component (no image files, pure computation).

### Typography (From personalpage.md section 4)

```css
--font-heading: 'Poppins', system-ui, sans-serif;  /* 500, 600, 700 */
--font-body:    'Roboto', system-ui, sans-serif;   /* 300, 400 */
--font-mono:    'Courier Prime', monospace;        /* 400, 700 */

/* Fluid scales */
--text-hero:  clamp(2.5rem, 8vw, 7rem);
--text-xl:    clamp(1.5rem, 3vw, 2.5rem);
--text-lg:    clamp(1.125rem, 2vw, 1.5rem);
--text-base:  1rem;
--text-sm:    0.875rem;
--text-xs:    0.75rem;
```

All fonts self-hosted, preload in Base layout, `font-display: swap`.

### Blog Content Storage

- **Format:** Markdown input → HTML stored in `articles.content` column
- **Parsing:** Use `marked` library in utility function
- **Reading time:** Auto-calculated (word count / 200)
- **Rendering:** `set:html={article.content}` in Astro template
- **Meta:** description (≤160 chars), tags (array), published date, author

### Animations (Minimal, From personalpage.md section 11)

```css
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}

.cursor { animation: blink 0.8s step-end infinite; }
```

**No parallax, no 3D, no particle systems, no loop animations (except cursor).**

Scroll triggers via `Intersection Observer` (vanilla JS), not scroll listeners.

### Testing Strategy

**Per stage:**
1. `npm run build` — no errors
2. `npx tsc --noEmit` — no TS errors
3. `npm run preview` + manual test (if UI stage)
4. Lighthouse audit (if frontend stage)

**Before stage completion:**
- All tasks marked `[x]`
- All success criteria met
- Full build + type-check passes
- No console errors

### Common Pitfalls (Avoid These)

❌ **DO NOT:**
- Use Google Fonts CDN (self-host only)
- Add external UI libraries (Shadcn, Bootstrap, etc.)
- Use tailwindui or other premium Tailwind plugins
- Add render-blocking scripts in `<head>`
- Hardcode environment variables
- Auto-publish articles (draft only)
- Use relative imports (use `@/` aliases)
- Build animation libraries (vanilla JS + CSS)
- Add analytics beyond Cloudflare
- Create light mode (dark mode ONLY)

✅ **DO:**
- Preload critical fonts
- Use CSS custom properties from tokens.css
- Test Lighthouse before commit
- Mark tasks `[x]` as you complete them
- Check success criteria per task
- Use Astro's native SSR (no custom Node)
- Store blog content as HTML in DB
- Generate migrations with `drizzle-kit`
- Use middleware for /admin protection
- Log to console for debugging (remove before final)

## Reference Materials

| Document | Purpose | Read when |
|----------|---------|-----------|
| plan.md | Full implementation plan, architecture, stage details | Before Stage 1 |
| tasks.md | Granular tasks per stage with checkboxes | Every work session |
| personalpage.md | Design system, typography, colors, animation specs, GEO strategy | Before Stage 1-2, Stage 6 |
| specification.md | Requirements and acceptance criteria | Before Stage 1 |

## Quick Links (In .shotgun/)

- **Pixel art sprites:** `personalpage.md` section 8
- **Color system:** `personalpage.md` section 3
- **Typography scales:** `personalpage.md` section 4
- **Database schema:** `plan.md` Stage 1.6
- **Admin panel spec:** `plan.md` Stage 4
- **GEO monitor spec:** `plan.md` Stage 5
- **Lighthouse targets:** `personalpage.md` section 9
- **Animations:** `personalpage.md` section 11

## Execution Workflow

```
┌─────────────────────────────────────────┐
│  1. Read .shotgun/ files (all)          │
├─────────────────────────────────────────┤
│  2. Open tasks.md → find first [ ]      │
├─────────────────────────────────────────┤
│  3. Check "Depends on:" for that stage   │
│     → if not ready, STOP and ask        │
├─────────────────────────────────────────┤
│  4. Read all tasks in that stage        │
│     → understand dependencies           │
├─────────────────────────────────────────┤
│  5. For each task in order:             │
│     • Create/modify files exactly       │
│     • Run quality checks (build, TS)    │
│     • Verify success criteria           │
│     • Mark [x] in tasks.md              │
├─────────────────────────────────────────┤
│  6. End of stage:                       │
│     • All tasks = [x]                   │
│     • Full build passes                 │
│     • Lighthouse audit (if frontend)    │
│     • STOP and wait for approval        │
├─────────────────────────────────────────┤
│  7. Do NOT start next stage until       │
│     human says "proceed to Stage N"     │
└─────────────────────────────────────────┘
```

## Troubleshooting

**Build fails:**
- Clear `.astro/` cache: `rm -rf .astro/`
- Clear node_modules: `rm -rf node_modules && npm install`
- Check `.env.local` variables are set
- Ensure `npm run build` passes before `npm run preview`

**Database connection fails:**
- Verify `DATABASE_URL` format: `postgresql://user:pass@host/dbname?sslmode=require`
- Test connection: Try connecting via `psql` CLI first
- Check Drizzle config path in `drizzle.config.ts`

**Middleware not protecting /admin:**
- Verify `src/middleware.ts` exports `onRequest`
- Check session cookie name in auth endpoint
- Clear cookies in browser and retry login

**Fonts not loading:**
- Verify WOFF2 files exist in `public/fonts/`
- Check `@font-face` paths match filenames exactly
- Use `font-display: swap` (not `block`)
- Preload links in Base layout

**Lighthouse low scores:**
- Check for render-blocking scripts (`<script>` in `<head>`)
- Image dimensions must include `width` and `height` (CLS)
- Inline critical CSS for LCP optimization
- Use DevTools Lighthouse report to identify bottlenecks

---

**Status:** Ready for implementation. Start with Stage 1, complete all tasks in order, mark checkboxes, and stop at stage boundaries.
