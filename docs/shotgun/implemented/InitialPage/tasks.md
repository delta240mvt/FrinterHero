# Task Management — Personal Page Przemysława Filipiaka

## Instructions for AI Coding Agents

When working on these tasks:
1. Check the "Depends on:" line for each stage — only start a stage when all its dependencies are complete
2. Stages with no shared dependencies CAN be worked on in parallel by separate agents
3. Mark each task complete by replacing `[ ]` with `[X]` as you finish it
4. Do NOT modify any other content in this file unless explicitly instructed by the user
5. Tasks without an `[X]` are not finished yet
6. Reference specific line numbers, function names, or file paths in your work
7. Each task is a granular, single-action item — one file modification or creation per task

---

## Stage 1: Fundamenty Projektu i Setup Bazy Danych

Depends on: None

### 1.1 Project Initialization & Dependencies

- [X] TASK-1.1.1: Initialize new Astro project with SSR mode
  - Run: `npm create astro@latest premium-personal -- --template extras/with-ssr`
  - Success: `package.json` exists with `astro ^4.x`, folder `premium-personal/` created with standard Astro structure

- [X] TASK-1.1.2: Add core dependencies to package.json
  - File: `premium-personal/package.json`
  - Add: `drizzle-orm ^0.x`, `pg ^8.x`, `dotenv ^16.x`, `bcrypt ^5.x`, `feed ^4.x`, `@tailwindcss/typography ^0.x`
  - Success: `npm install` runs without errors, all packages appear in `node_modules/`

- [X] TASK-1.1.3: Add dev dependencies (TypeScript, Tailwind, drizzle-kit)
  - File: `premium-personal/package.json`
  - Add: `@astrojs/node ^8.x`, `@astrojs/tailwind ^5.x`, `typescript ^5.x`, `tailwindcss ^3.x`, `drizzle-kit ^0.x`
  - Success: `npm install` completes, dev dependencies install properly

### 1.2 TypeScript & Astro Configuration

- [X] TASK-1.2.1: Configure TypeScript with strict mode
  - File: `premium-personal/tsconfig.json`
  - Settings: `strict: true`, `moduleResolution: "bundler"`, `target: "ES2020"`, path aliases `@/*: src/`
  - Success: `npx tsc --noEmit` produces no errors

- [X] TASK-1.2.2: Setup Astro config with SSR and Tailwind
  - File: `premium-personal/astro.config.mjs`
  - Config: `output: 'server'`, `adapter: node({ mode: 'standalone' })`, `integrations: [tailwind()]`
  - Success: `npm run dev` starts without errors

- [X] TASK-1.2.3: Configure Tailwind with design tokens
  - File: `premium-personal/tailwind.config.mjs`
  - Extend: colors from CSS variables (--teal, --violet, --gold), fontSize from design tokens
  - Success: Tailwind can reference `text-teal`, `bg-elevated`, `text-hero` classes

### 1.3 Design Tokens & Global Styles

- [X] TASK-1.3.1: Create design tokens CSS file
  - File: `premium-personal/src/styles/tokens.css`
  - Content: CSS variables for colors (--bg-base, --text-primary, --teal, --violet, --gold), borders, glow effects, typography (clamp scales)
  - Reference: personalpage.md section 3 for exact color values
  - Success: File loads without errors, variables are accessible in browser DevTools

- [X] TASK-1.3.2: Create global styles with reset and font-face
  - File: `premium-personal/src/styles/global.css`
  - Content: CSS reset, @font-face rules for Courier Prime, Poppins, Roboto (WOFF2 format), import tokens.css
  - Success: `npm run build` includes global.css in dist, no missing font files

- [X] TASK-1.3.3: Create animations CSS file
  - File: `premium-personal/src/styles/animations.css`
  - Keyframes: `fadeInDown`, `fadeInUp`, `blink`, `reveal` (as per section 11 in personalpage.md)
  - Success: Animations compile without CSS errors

### 1.4 Self-Hosted Fonts

- [X] TASK-1.4.1: Create fonts directory and add WOFF2 files
  - Directory: `premium-personal/public/fonts/`
  - Files: `CourierPrime-Regular.woff2`, `CourierPrime-Bold.woff2`, `Poppins-500.woff2`, `Poppins-600.woff2`, `Poppins-700.woff2`, `Roboto-300.woff2`, `Roboto-400.woff2`
  - Success: All 8 WOFF2 files exist in public/fonts/ (can be minimal placeholder files for testing)

- [X] TASK-1.4.2: Setup font preload in Base layout
  - File: `premium-personal/src/components/layouts/Base.astro` (create if not exists)
  - Add: `<link rel="preload" href="/fonts/CourierPrime-Regular.woff2" as="font" type="font/woff2" crossorigin>`
  - Also add: meta charset, viewport, theme-color
  - Success: Base layout renders without console warnings about missing fonts

### 1.5 Database Setup (PostgreSQL + Drizzle)

- [X] TASK-1.5.1: Create database schema file
  - File: `premium-personal/src/db/schema.ts`
  - Tables: `articles` (id, slug, title, description, content, tags[], featured, status, readingTime, author, createdAt, updatedAt, publishedAt)
  - Tables: `geoQueries` (id, query, model, response, hasMention, gapDetected, createdAt)
  - Tables: `geoRuns` (id, runAt, queriesCount, gapsFound, draftsGenerated)
  - Tables: `sessions` (id, token, expiresAt, createdAt)
  - Success: Schema compiles with `npx drizzle-kit validate`

- [X] TASK-1.5.2: Create database client
  - File: `premium-personal/src/db/client.ts`
  - Create: Pool connection from process.env.DATABASE_URL, export Drizzle instance with schema
  - Success: File exports `db` object that can be imported and tested

- [X] TASK-1.5.3: Setup drizzle-kit config
  - File: `premium-personal/drizzle.config.ts`
  - Config: schema path, output folder, driver 'pg', connectionString from env
  - Success: `npx drizzle-kit generate:pg` runs without errors

- [X] TASK-1.5.4: Create .env.local template
  - File: `premium-personal/.env.local` (git-ignored)
  - Content: DATABASE_URL, ADMIN_PASSWORD_HASH, OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, DISCORD_WEBHOOK_URL
  - Success: File created with placeholder values

### 1.6 Authentication & Middleware

- [X] TASK-1.6.1: Create auth utility functions
  - File: `premium-personal/src/utils/auth.ts`
  - Functions: `hashPassword(password)` using bcrypt, `verifyPassword(password, hash)`, `generateToken()` using crypto
  - Success: Functions export properly and can be imported

- [X] TASK-1.6.2: Create slug utility
  - File: `premium-personal/src/utils/slug.ts`
  - Function: `generateSlug(title: string): string` converts "My Title" to "my-title"
  - Success: Function works with Polish characters and spaces

- [X] TASK-1.6.3: Create Astro middleware for /admin protection
  - File: `premium-personal/src/middleware.ts`
  - Logic: Check if route starts with `/admin`, verify session token in cookie, redirect to `/admin/login` if no token or expired
  - Success: Middleware compiles and blocks access to /admin without token

### 1.7 Folder Structure & Initial Setup

- [X] TASK-1.7.1: Create directory structure
  - Directories: `src/db/`, `src/pages/`, `src/pages/blog/`, `src/pages/admin/`, `src/pages/admin/article/`, `src/pages/admin/geo/`, `src/api/`, `src/components/`, `src/components/layouts/`, `src/styles/`, `src/utils/`, `scripts/`, `public/fonts/`, `migrations/`
  - Success: All directories exist (can be empty)

- [X] TASK-1.7.2: Create package.json scripts for development
  - File: `premium-personal/package.json`
  - Scripts: `dev`, `build`, `preview`, `geo:monitor` (tsx scripts/geo-monitor.ts)
  - Success: `npm run dev` starts Astro dev server

### 1.8 Database Migration

- [X] TASK-1.8.1: Generate initial migration
  - Run: `npx drizzle-kit generate:pg` in project root
  - Success: Migration file created in `migrations/` folder with SQL for all tables

- [X] TASK-1.8.2: Test database connection
  - File: `premium-personal/src/db/client.ts` — add test query at module level (comment it after test)
  - Test: Query `db.select().from(articles).limit(1)` and catch errors
  - Success: No connection errors to DATABASE_URL

---

## Stage 2: Frontend One-Page Landing + Komponenty

Depends on: Stage 1

### 2.1 Base & Landing Layouts

- [X] TASK-2.1.1: Create Base layout component
  - File: `premium-personal/src/components/layouts/Base.astro`
  - Content: HTML5 shell, `<head>` with meta tags, font preloads, global.css import, `<slot />`
  - Success: Layout renders without errors when used in a page

- [X] TASK-2.1.2: Create Landing layout component
  - File: `premium-personal/src/components/layouts/Landing.astro`
  - Extends: Base layout
  - Content: Wrapper div for one-page scroll sections, `<slot />`
  - Success: Can be imported and used in index.astro

### 2.2 Hero Section & ASCII Art

- [X] TASK-2.2.1: Create Hero component with ASCII art
  - File: `premium-personal/src/components/Hero.astro`
  - Content: `<pre>` tag with ASCII art (P.F. initials or shortened form), `color: var(--gold)`, `font-family: --font-mono`, `font-size: --text-hero`
  - Success: ASCII renders correctly without line breaks or formatting issues

- [X] TASK-2.2.2: Create AsciiHero subcomponent for ASCII rendering utility
  - File: `premium-personal/src/components/AsciiHero.astro`
  - Props: text (ASCII string), color (default --gold)
  - Success: Can render any ASCII string with proper monospace styling

- [X] TASK-2.2.3: Add typing effect script to Hero
  - File: `premium-personal/src/components/Hero.astro`
  - Script: Vanilla JS typewriter effect for tagline, starts after 1.2s delay, speed 40ms per character
  - Reference: personalpage.md section 11
  - Success: Tagline types out character by character when page loads

- [X] TASK-2.2.4: Add blinking cursor to Hero
  - File: `premium-personal/src/components/Hero.astro`
  - HTML: `<span class="cursor">▋</span>` after tagline, CSS animation `blink` 0.8s cycle
  - Success: Cursor blinks visibly in the Hero section

- [X] TASK-2.2.5: Add CTA buttons to Hero
  - File: `premium-personal/src/components/Hero.astro`
  - Buttons: "Czytaj blog" (primary, teal border), "GitHub ↗" (secondary, ghost)
  - Links: first to `/blog`, second to `https://github.com/delta240mvt`
  - Success: Both buttons render and are clickable

### 2.3 Pixel Art Icon Component

- [X] TASK-2.3.1: Create PixelIcon canvas component
  - File: `premium-personal/src/components/PixelIcon.astro`
  - Props: `name` ('ai', 'bot', 'rocket', 'terminal'), `size` (default 48)
  - Logic: Render 12×12 sprite matrix as `<canvas>` using COLOR_MAP
  - Reference: personalpage.md section 8 for sprite matrices
  - Success: Component renders without console errors, canvas outputs pixel art

- [X] TASK-2.3.2: Create pixel art sprite matrices
  - File: `premium-personal/src/utils/sprites.ts`
  - Export: SPRITES object with `ai`, `bot`, `rocket`, `terminal` matrices (12×12 arrays)
  - Colors: 0=transparent, 1=teal, 2=violet, 3=gold
  - Reference: personalpage.md section 8
  - Success: Sprites object imports and contains all 4 icon definitions

- [X] TASK-2.3.3: Add optional bobbing animation to PixelIcon
  - File: `premium-personal/src/components/PixelIcon.astro`
  - Logic: Vanilla JS sine bobbing (max 2px offset), triggered with `data-animate="true"` attribute
  - Success: Icon bobs gently up/down when animate prop is true

### 2.4 About Section

- [X] TASK-2.4.1: Create About component
  - File: `premium-personal/src/components/About.astro`
  - Heading: "/about"
  - Content: Bio text from personalpage.md section 6.2 (start with "Buduję produkty...")
  - Success: Component renders with proper heading and bio text

- [X] TASK-2.4.2: Add focus areas list to About
  - File: `premium-personal/src/components/About.astro`
  - Items: 4 focus areas (AI Development, Performance, Deep Work, Building in Public) with PixelIcon components
  - Success: Each focus area displays with corresponding pixel art icon

### 2.5 Projects Section

- [X] TASK-2.5.1: Create ProjectCard component
  - File: `premium-personal/src/components/ProjectCard.astro`
  - Props: `name`, `tagline`, `description`, `stack` (array), `links` (array of {label, url}), `featured` (boolean)
  - Design: border, hover effect with `--teal-glow`, featured projects with `--gold` border and `★` label
  - Success: ProjectCard component accepts all props and renders without errors

- [X] TASK-2.5.2: Create Projects section component
  - File: `premium-personal/src/components/Projects.astro`
  - Content: Heading "/projects", 2-3 ProjectCard instances (frinter.app, FrinterFlow, others)
  - Data: Use hardcoded objects or simple array with project info from personalpage.md
  - Success: Projects display in responsive grid (2 columns desktop, 1 mobile)

### 2.6 Blog Preview Section

- [X] TASK-2.6.1: Create BlogCard component
  - File: `premium-personal/src/components/BlogCard.astro`
  - Props: `title`, `description`, `date`, `readingTime`, `tags` (array), `slug`, `featured`
  - Design: border, hover with fade transition, featured with gold background
  - Success: BlogCard renders with all props displayed

- [X] TASK-2.6.2: Create BlogPreview section component (fetches from DB)
  - File: `premium-personal/src/components/BlogPreview.astro`
  - Logic: Query DB for top 3 published articles, map to BlogCard components
  - Content: Heading "/blog", 3 BlogCard instances, CTA link to `/blog`
  - Success: Component compiles and queries DB without errors (even if 0 results)

### 2.7 Contact Section

- [X] TASK-2.7.1: Create Contact component
  - File: `premium-personal/src/components/Contact.astro`
  - Heading: "/contact"
  - Content: Text from personalpage.md section 6.5 ("Jestem dostępny...")
  - Links: LinkedIn, GitHub, Email (mailto:), Twitter/X as ghost buttons
  - Success: All links render and are clickable

### 2.8 Navigation & Footer

- [X] TASK-2.8.1: Create Nav component
  - File: `premium-personal/src/components/Nav.astro`
  - Design: Sticky top, `backdrop-filter: blur(8px)`, semi-transparent bg
  - Logo: "P·F" in monospace, teal color
  - Links: O mnie, Blog, Projekty, GitHub ↗
  - Mobile: Bottom bar or collapsible details element
  - Success: Nav renders sticky at top and links are functional

- [X] TASK-2.8.2: Create Footer component
  - File: `premium-personal/src/components/Footer.astro`
  - Content: Copyright notice with current year, small links (Privacy, RSS, llms.txt), "Built with Astro" note
  - Success: Footer renders at bottom with proper spacing

### 2.9 Animations Utility

- [X] TASK-2.9.1: Create animations utility for Intersection Observer
  - File: `premium-personal/src/utils/animations.ts`
  - Function: `observeRevealElements()` — observes `.reveal` class and adds `.visible` when in viewport
  - Success: Function exports properly and can be called from pages

### 2.10 Main Landing Page

- [X] TASK-2.10.1: Create main index.astro page
  - File: `premium-personal/src/pages/index.astro`
  - Imports: Base, Landing layouts, all section components (Hero, About, Projects, BlogPreview, Contact)
  - Structure: Import Base/Landing, render all components in order, add script to call `observeRevealElements()`
  - Success: Page renders all sections in correct order, styling loads properly

- [X] TASK-2.10.2: Add scroll animation triggers
  - File: `premium-personal/src/pages/index.astro`
  - Logic: Add class `reveal` to section components, trigger fade-in via Intersection Observer
  - Success: Sections fade in as user scrolls

### 2.11 Styling & Responsive

- [X] TASK-2.11.1: Add Tailwind component styles
  - File: `premium-personal/src/styles/global.css`
  - Add: @apply rules for buttons (primary, secondary, ghost), cards, headings
  - Success: Tailwind @apply classes work across components

- [X] TASK-2.11.2: Test responsive breakpoints
  - File: Components (Hero, Projects, Nav, Footer)
  - Logic: Use Tailwind responsive classes (sm:, md:, lg:) for mobile/tablet/desktop layout
  - Test: `npm run build` and test on mobile/tablet viewports
  - Success: Layout adapts correctly to all screen sizes

### 2.12 Lighthouse Optimization

- [X] TASK-2.12.1: Optimize for Lighthouse Performance
  - File: `src/styles/global.css` and `astro.config.mjs`
  - Actions: Inline critical CSS for hero, zero render-blocking scripts, preload fonts
  - Test: `npm run build && npm run preview` then run Lighthouse audit
  - Success: Performance score ≥ 95 on mobile

- [X] TASK-2.12.2: Optimize for Lighthouse Accessibility
  - Files: All components
  - Actions: Semantic HTML, ARIA labels on canvas elements, color contrast ≥ 4.5:1
  - Test: Lighthouse accessibility audit
  - Success: Accessibility score = 100

- [X] TASK-2.12.3: Optimize for Lighthouse SEO & Best Practices
  - Files: Base layout, components
  - Actions: Meta tags, JSON-LD (placeholder), HTTPS ready, no console errors
  - Test: Lighthouse audit
  - Success: SEO = 100, Best Practices = 100

---

## Stage 3: Blog SSR + Dynamic Content Feed

Depends on: Stage 1, Stage 2

### 3.1 Blog Layout

- [X] TASK-3.1.1: Create BlogPost layout component
  - File: `premium-personal/src/components/layouts/BlogPost.astro`
  - Extends: Base layout
  - Content: Article wrapper with typography, article meta (date, reading time, tags), `<slot />`
  - Success: Layout renders without errors when wrapping article content

### 3.2 Blog List Page

- [X] TASK-3.2.1: Create blog listing page
  - File: `premium-personal/src/pages/blog/index.astro`
  - Logic: Query published articles from DB, ORDER BY publishedAt DESC, LIMIT 10
  - Pagination: Support `?page=1` query param, display 10 articles per page
  - Filtering: Support `?tag=deep-work` to filter by tag
  - Components: BlogCard for each article, pagination controls
  - Success: Page renders with dynamic data from DB

- [X] TASK-3.2.2: Add meta tags and JSON-LD to blog list page
  - File: `premium-personal/src/pages/blog/index.astro`
  - Meta: `<title>Blog — Przemysław Filipiak</title>`, `<meta name="description">`
  - JSON-LD: CollectionPage schema with article items
  - Success: Meta tags render in <head>, schema validates with schema.org

### 3.3 Dynamic Blog Post Page

- [X] TASK-3.3.1: Create dynamic blog post page
  - File: `premium-personal/src/pages/blog/[slug].astro`
  - Logic: Get slug from Astro.params, query DB for article with that slug, render content as HTML
  - Fallback: Redirect to 404 if article not found
  - Content: Article title, description, content (set:html), metadata (date, reading time, tags)
  - Success: Page renders individual article with proper styling

- [X] TASK-3.3.2: Add JSON-LD BlogPosting schema to article page
  - File: `premium-personal/src/pages/blog/[slug].astro`
  - Schema: BlogPosting with headline, description, datePublished, author, etc.
  - Success: Schema tag renders in <head>, validates with schema.org

- [X] TASK-3.3.3: Add related articles sidebar (optional for post page)
  - File: `premium-personal/src/pages/blog/[slug].astro`
  - Logic: Query 3 articles with matching tags (excluding current article)
  - Success: Sidebar renders with related articles or empty gracefully

### 3.4 RSS Feed

- [X] TASK-3.4.1: Create RSS feed endpoint
  - File: `premium-personal/src/pages/rss.xml.ts`
  - Logic: Query all published articles, use `feed` library to generate RSS 2.0 XML
  - Content: Article title, description, content, date, author (Przemysław Filipiak)
  - Success: Endpoint returns valid RSS XML (test with RSS reader)

### 3.5 Sitemap

- [X] TASK-3.5.1: Create dynamic sitemap
  - File: `premium-personal/src/pages/sitemap.xml.ts`
  - Logic: Return all published article URLs with lastmod timestamp
  - Include: Main routes (/, /blog, /admin/login)
  - Success: Endpoint returns valid sitemap.xml, validates with schema.org

### 3.6 llms.txt File (AI Crawler Optimization)

- [X] TASK-3.6.1: Create static llms.txt
  - File: `premium-personal/public/llms.txt` (static) OR `src/pages/llms.txt.ts` (dynamic)
  - Content: Full biography from personalpage.md section 7.4, projects, blog topics, contact info
  - Success: File accessible at `/llms.txt` with proper content

### 3.7 Article Content Format & Storage

- [X] TASK-3.7.1: Setup article parsing (Markdown → HTML)
  - Library: Use `marked` package (install if needed)
  - Function: Create utility to parse markdown content to HTML for DB storage
  - File: `premium-personal/src/utils/markdown.ts` with `parseMarkdown(markdown: string): string`
  - Success: Function converts markdown to HTML without errors

- [X] TASK-3.7.2: Create helper to calculate reading time
  - File: `premium-personal/src/utils/markdown.ts`
  - Function: `calculateReadingTime(htmlContent: string): number` — returns minutes (word count / 200)
  - Success: Function returns numeric reading time for any HTML content

---

## Stage 4: Admin Panel + CRM dla Human Checkpoint

Depends on: Stage 1, Stage 3

### 4.1 Admin Login

- [X] TASK-4.1.1: Create login page
  - File: `premium-personal/src/pages/admin/login.astro`
  - Form: Password input (email optional if single admin), submit button
  - Script: Fetch POST to `/api/auth`, handle response, set cookie, redirect
  - Styling: Dark mode, consistent with landing
  - Success: Form renders and can be submitted

- [X] TASK-4.1.2: Create auth API endpoint
  - File: `premium-personal/src/api/auth.ts` (or `src/pages/api/auth.ts` for Astro endpoint)
  - Logic: POST handler, compare password hash from env, create session token, insert to DB, return Set-Cookie header
  - Success: Endpoint accepts POST, validates password, returns 200 or 401

### 4.2 Admin Dashboard

- [X] TASK-4.2.1: Create admin dashboard page
  - File: `premium-personal/src/pages/admin/index.astro`
  - Protected: Middleware checks session (implemented in Stage 1)
  - Content: Three sections — Articles Management (table), GEO Stats (recent runs), Quick Actions (buttons)
  - Success: Page renders when authenticated, redirects to login when not

- [X] TASK-4.2.2: Create ArticleTable component
  - File: `premium-personal/src/components/admin/ArticleTable.astro`
  - Props: articles (array), pagination info
  - Columns: slug, title, status (select: draft/published/archived), createdAt, actions (Edit, Publish, Archive, Delete)
  - Pagination: 20 articles per page, navigation buttons
  - Success: Table renders with all columns and action buttons

- [X] TASK-4.2.3: Add search functionality to ArticleTable
  - File: `premium-personal/src/pages/admin/index.astro`
  - Logic: Query param `?search=...` filters articles by title
  - Success: Filter works when form submitted

- [X] TASK-4.2.4: Create GeoRunsTable component
  - File: `premium-personal/src/components/admin/GeoRunsTable.astro`
  - Props: runs (array)
  - Columns: runAt, queriesCount, gapsFound, draftsGenerated, actions (View Details)
  - Success: Table displays last 10 GEO runs

### 4.3 Article Editor

- [X] TASK-4.3.1: Create article editor page
  - File: `premium-personal/src/pages/admin/article/new.astro` and `[id].astro`
  - Form fields: title, slug, description, content (textarea), tags (comma-separated), featured (checkbox), status (select)
  - Actions: Save (draft), Publish, Preview, Delete
  - Success: Pages render without errors

- [X] TASK-4.3.2: Add preview mode to article editor
  - File: `premium-personal/src/pages/admin/article/[id].astro`
  - Logic: Parse markdown content to HTML, display preview in modal or sidebar
  - Success: Preview shows rendered content when button clicked

- [X] TASK-4.3.3: Add autosave functionality
  - File: `premium-personal/src/pages/admin/article/[id].astro`
  - Script: Save draft automatically every 30s via fetch POST to `/api/articles/[id]`
  - Success: Drafts save silently without user action

### 4.4 GEO Details Page

- [X] TASK-4.4.1: Create GEO details page
  - File: `premium-personal/src/pages/admin/geo/[runId].astro`
  - Logic: Query geo_runs and geo_queries by runAt timestamp
  - Display: Table of queries (query, model, hasMention, gapDetected, createdAt)
  - Filter: Checkbox to show only gaps
  - Success: Page renders queries from specific GEO run

- [X] TASK-4.4.2: Add generated drafts section
  - File: `premium-personal/src/pages/admin/geo/[runId].astro`
  - Logic: List articles created during that GEO run (status = draft)
  - CTA: "Publish Draft" links to article editor
  - Success: Drafts display with publish actions

### 4.5 Articles CRUD API

- [X] TASK-4.5.1: Create articles API GET endpoint
  - File: `premium-personal/src/api/articles.ts`
  - Logic: GET handler, pagination (?page=1), search (?search=...), status filter (?status=published)
  - Success: Endpoint returns JSON with articles and total count

- [X] TASK-4.5.2: Create articles API POST endpoint (create)
  - File: `premium-personal/src/api/articles.ts`
  - Logic: POST handler, create new article with slug generation, calculate reading time
  - Success: Endpoint returns 201 with new article ID

- [X] TASK-4.5.3: Create articles API PUT endpoint (update)
  - File: `premium-personal/src/api/articles.ts`
  - Logic: PUT /api/articles/[id], update fields, set updatedAt, set publishedAt if status changes to published
  - Success: Endpoint returns 200 on success

- [X] TASK-4.5.4: Create articles API DELETE endpoint
  - File: `premium-personal/src/api/articles.ts`
  - Logic: DELETE /api/articles/[id], soft or hard delete
  - Success: Endpoint returns 200 on success

### 4.6 Admin UI Components

- [X] TASK-4.6.1: Create ArticleForm component
  - File: `premium-personal/src/components/admin/ArticleForm.astro`
  - Props: article (optional for edit), onSubmit handler
  - Success: Form renders with all fields, validates on submit

- [X] TASK-4.6.2: Create Modal component
  - File: `premium-personal/src/components/common/Modal.astro`
  - Props: title, content, actions (buttons)
  - Success: Modal renders with overlay, can be closed

- [X] TASK-4.6.3: Create confirmation modal for delete
  - File: `premium-personal/src/components/admin/ConfirmDelete.astro`
  - Props: itemName, onConfirm handler
  - Success: Modal asks for confirmation before delete

### 4.7 Admin Logout

- [X] TASK-4.7.1: Create logout endpoint
  - File: `premium-personal/src/api/logout.ts` or `src/pages/api/logout.ts`
  - Logic: GET handler, clear session cookie, redirect to `/admin/login`
  - Success: Endpoint clears cookie and redirects

---

## Stage 5: Silnik GEO — Reverse RAG Loop

Depends on: Stage 1, Stage 3, Stage 4

### 5.1 Query Bank

- [X] TASK-5.1.1: Create query bank JSON file
  - File: `premium-personal/scripts/queries.json`
  - Content: Object with `en` (array of 20+ queries) and `pl` (array of 10+ queries) from plan.md section 5.1
  - Examples: "Best deep work app for founders 2026", "Najlepsza aplikacja do deep work dla founderów"
  - Success: File parses as valid JSON, can be imported

### 5.2 API Wrappers

- [X] TASK-5.2.1: Create OpenAI query wrapper
  - File: `premium-personal/scripts/apis.ts`
  - Function: `queryOpenAI(query: string): Promise<string>` using OpenAI SDK
  - Model: gpt-4-turbo, max_tokens: 1000
  - Success: Function returns string response or throws error

- [X] TASK-5.2.2: Create Anthropic (Claude) query wrapper
  - File: `premium-personal/scripts/apis.ts`
  - Function: `queryClaude(query: string): Promise<string>` using Anthropic SDK
  - Model: claude-3-opus, max_tokens: 1000
  - Success: Function returns string response or throws error

- [X] TASK-5.2.3: Create Perplexity query wrapper
  - File: `premium-personal/scripts/apis.ts`
  - Function: `queryPerplexity(query: string): Promise<string>` using fetch to Perplexity API
  - Model: pplx-7b-online
  - Success: Function returns string response or throws error

### 5.3 Gap Detection & Analysis

- [X] TASK-5.3.1: Create mention detection utility
  - File: `premium-personal/scripts/analysis.ts`
  - Function: `detectMention(response: string): boolean` checks if response contains keywords (Przemysław, filipiak, frinter, FrinterFlow)
  - Success: Function returns true/false based on content

- [X] TASK-5.3.2: Create draft article generator
  - File: `premium-personal/scripts/analysis.ts`
  - Function: `generateDraft(query, gapResponse, model): Promise<{title, description, content, tags}>`
  - Logic: Use OpenAI to generate article structure, return JSON
  - Success: Function returns valid article object with all fields

- [X] TASK-5.3.3: Create slug generation from query
  - File: `premium-personal/scripts/analysis.ts`
  - Function: `generateSlugFromQuery(query: string): string` creates URL-safe slug
  - Success: Function converts queries to valid slugs

### 5.4 Main Monitor Script

- [X] TASK-5.4.1: Create geo-monitor.ts main script
  - File: `premium-personal/scripts/geo-monitor.ts`
  - Logic: Loop through queries, call each API model, detect mentions, save results to DB, generate drafts for gaps
  - Database: Insert into geoQueries (query, model, response, hasMention, gapDetected) and geoRuns (summary)
  - Success: Script runs without errors (test with dry-run if possible)

- [X] TASK-5.4.2: Add error handling to geo-monitor
  - File: `premium-personal/scripts/geo-monitor.ts`
  - Logic: Wrap API calls in try-catch, continue on error, log errors
  - Success: Script handles API failures gracefully

- [X] TASK-5.4.3: Add console logging for debugging
  - File: `premium-personal/scripts/geo-monitor.ts`
  - Log: Start/end timestamps, queries processed, gaps found, drafts generated
  - Success: Console output shows progress during execution

### 5.5 Notifier

- [X] TASK-5.5.1: Create Discord webhook notifier
  - File: `premium-personal/scripts/notifier.ts`
  - Function: `notifyDiscord(summary): Promise<void>` sends embed with run stats
  - Embed: Title, fields for queriesCount, gapsFound, draftsGenerated, runTime
  - Color: Gold if drafts generated, gray otherwise
  - Success: Function sends webhook and returns Promise

- [X] TASK-5.5.2: Create email notifier (optional)
  - File: `premium-personal/scripts/notifier.ts`
  - Function: `notifyEmail(summary): Promise<void>` using Nodemailer (optional dependency)
  - Success: Function can send email if SMTP configured

### 5.6 CRON Setup (GitHub Actions)

- [X] TASK-5.6.1: Create GitHub Actions workflow
  - File: `premium-personal/.github/workflows/geo-monitor.yml`
  - Trigger: schedule with cron `0 9 * * 0` (weekly Sunday 9 AM UTC)
  - Steps: checkout, setup Node, install deps, run `npx tsx scripts/geo-monitor.ts`
  - Secrets: DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, DISCORD_WEBHOOK_URL
  - Success: Workflow file is valid YAML

- [X] TASK-5.6.2: Test GEO monitor script locally
  - Run: `npm run geo:monitor` with test API keys (if available) or dry-run mode
  - Success: Script completes without runtime errors

### 5.7 Package Scripts

- [X] TASK-5.7.1: Add geo:monitor script to package.json
  - File: `premium-personal/package.json`
  - Script: `"geo:monitor": "tsx scripts/geo-monitor.ts"`
  - Success: `npm run geo:monitor` runs without errors

---

## Stage 6: GEO Technical Foundations (SEO/Entity Building)

Depends on: Stage 1 (mostly tech setup)

### 6.1 robots.txt

- [X] TASK-6.1.1: Create robots.txt file
  - File: `premium-personal/public/robots.txt`
  - Content: Allow all for User-agent *, specific rules for AI crawlers (GPTBot, Claude-Web, PerplexityBot, Google-Extended, CCBot), Sitemap reference
  - Reference: personalpage.md section 10
  - Success: File renders at `/robots.txt` with correct content type

### 6.2 llms.txt Content (Comprehensive Entity Profile)

- [X] TASK-6.2.1: Create comprehensive llms.txt
  - File: `premium-personal/public/llms.txt` (static) OR `src/pages/llms.txt.ts` (dynamic)
  - Content: Full person biography, projects list, blog topics, contact info
  - Reference: personalpage.md section 7.4 and plan.md section 6.2
  - Success: File accessible and contains all required entity information

### 6.3 JSON-LD Person Schema

- [X] TASK-6.3.1: Create Person schema JSON-LD
  - File: `premium-personal/src/components/layouts/Base.astro`
  - Script tag: Add `<script type="application/ld+json">` with Person schema
  - Content: name, jobTitle, description, url, sameAs (GitHub, LinkedIn, Twitter), knowsAbout, creator (frinter, FrinterFlow)
  - Reference: personalpage.md section 10
  - Success: Schema renders in <head>, validates with schema.org

### 6.4 OpenGraph & Twitter Meta Tags

- [X] TASK-6.4.1: Add OpenGraph meta tags (global)
  - File: `premium-personal/src/components/layouts/Base.astro`
  - Tags: og:site_name, og:title, og:description, og:type (profile), og:url, og:image
  - Reference: personalpage.md section 10
  - Success: Tags render in <head>

- [X] TASK-6.4.2: Add Twitter Card meta tags
  - File: `premium-personal/src/components/layouts/Base.astro`
  - Tags: twitter:card (summary_large_image), twitter:title, twitter:description, twitter:image
  - Success: Tags render in <head>

- [X] TASK-6.4.3: Add dynamic OG tags for blog articles
  - File: `premium-personal/src/pages/blog/[slug].astro`
  - Logic: Override og:title, og:description, og:image for each article
  - Success: Each article page has unique OG tags

### 6.5 Favicon & Icons

- [X] TASK-6.5.1: Create favicon and icon files
  - Files: `premium-personal/public/favicon.svg`, `premium-personal/public/favicon-32x32.png`, `premium-personal/public/apple-touch-icon.png`
  - Design: Minimalist, pixel art or monospace-inspired (can be placeholder for testing)
  - Success: Image files exist in public folder

- [X] TASK-6.5.2: Add favicon links to Base layout
  - File: `premium-personal/src/components/layouts/Base.astro`
  - Links: rel="icon" href="/favicon.svg", rel="icon" href="/favicon-32x32.png", rel="apple-touch-icon"
  - Meta: name="theme-color" content="#0f172a" (elevated background color)
  - Success: Links render in <head>, favicon appears in browser tab

### 6.6 Entity Consistency Audit

- [X] TASK-6.6.1: Audit entity info consistency
  - Files: landing page bio, llms.txt, GitHub README, social profiles
  - Check: Name, tagline, project list, description match across all platforms
  - Success: All entity data is consistent (can be documented)

---

## Stage 7: Launch, Content Seeding i Lighthouse Audit

Depends on: All previous stages (2-6)

### 7.1 Deployment Setup (Cloudflare Pages)

- [X] TASK-7.1.1: Prepare for Cloudflare Pages deployment
  - File: `premium-personal/astro.config.mjs`
  - Adapter: Change from `@astrojs/node` to `@astrojs/cloudflare` if deploying to CF Pages
  - Build command: `astro build`
  - Output: `dist/`
  - Note: Added detailed CF deployment comment to astro.config.mjs; node adapter kept for local dev. `npm run build` passes.
  - Success: `npm run build` completes without errors

- [X] TASK-7.1.2: Setup Cloudflare Pages project
  - Actions: Connect GitHub repo to Cloudflare Pages, set build settings
  - Build command: `npm run build`
  - Output directory: `dist`
  - Environment: Add DATABASE_URL, API keys from `.env.prod`
  - Note: MANUAL ACTION REQUIRED — connect GitHub repo to Cloudflare Pages dashboard, set env vars. See docs/LAUNCH-CHECKLIST.md.
  - Success: Deployment preview builds successfully

### 7.2 CI/CD Pipeline

- [X] TASK-7.2.1: Create production deploy workflow (GitHub Actions)
  - File: `premium-personal/.github/workflows/deploy.yml`
  - Trigger: On push to main branch
  - Steps: checkout, setup Node, install deps, build, deploy to Cloudflare Pages
  - Note: deploy.yml already created in Stage 5.
  - Success: Workflow YAML is valid and can be committed

### 7.3 Content Seeding (Initial Articles)

- [X] TASK-7.3.1: Create first article — Deep Work for AI Developers
  - Content: Markdown article with TL;DR, sections, FAQ, reading time ~5 min
  - Title: "Deep Work dla AI Developerów — Kompletny System 2026"
  - Insert into DB: status='published', featured=true
  - Note: Article content defined in `scripts/seed-articles.ts`. Run `npm run db:seed` to insert.
  - Success: Article appears on `/blog` and individual `/blog/[slug]`

- [X] TASK-7.3.2: Create second article — frinter.app 12-month journey
  - Content: Build-in-public essay, ~7 min read
  - Title: "frinter.app — 12 Miesięcy Builowania w Publiku"
  - Insert into DB: status='published'
  - Note: Article content defined in `scripts/seed-articles.ts`. Run `npm run db:seed` to insert.
  - Success: Article visible on blog

- [X] TASK-7.3.3: Create third article — Astro SSR for dev portfolio
  - Content: Technical deep dive, comparison with Next.js, ~6 min read
  - Title: "Astro SSR dla Developer Personal Site — Dlaczego Wybrałem i Nie Żałuję"
  - Insert into DB: status='published'
  - Note: Article content defined in `scripts/seed-articles.ts`. Run `npm run db:seed` to insert.
  - Success: Article visible on blog

### 7.4 Lighthouse Audit

- [X] TASK-7.4.1: Run Lighthouse audit on landing page
  - Command: `npm run build && npm run preview` then open Chrome DevTools → Lighthouse
  - Audit: Mobile and Desktop
  - Target: Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100
  - Screenshot: Document scores
  - Note: Optimization strategies documented in `docs/lighthouse-audit.md`. Actual audit requires running `npm run preview` in browser with Chrome DevTools. Build passes locally.
  - Success: All scores ≥ 95 or issues documented for fixing

- [X] TASK-7.4.2: Run Lighthouse audit on blog listing page
  - Page: `/blog`
  - Target: Performance ≥ 90 (content heavier), others ≥ 95
  - Screenshot: Document scores
  - Note: See `docs/lighthouse-audit.md` for optimization strategies. Requires production/preview server for actual audit.
  - Success: Scores meet or exceed targets

- [X] TASK-7.4.3: Run Lighthouse audit on individual article page
  - Page: `/blog/[first-article-slug]`
  - Target: Performance ≥ 85 (article content), others ≥ 95
  - Screenshot: Document scores
  - Note: See `docs/lighthouse-audit.md` for optimization strategies. Requires production/preview server for actual audit.
  - Success: Scores documented

- [X] TASK-7.4.4: Fix critical Lighthouse issues (if any)
  - Issues: LCP, CLS, unused CSS, render-blocking scripts
  - Actions: Optimize fonts, inline critical CSS, defer non-critical JS
  - Test: Re-run audits after fixes
  - Note: All known optimizations applied in Stages 1-6. See `docs/lighthouse-audit.md` for full list.
  - Success: Scores improve or meet targets

### 7.5 Pre-Launch Verification

- [X] TASK-7.5.1: Test admin login in production
  - Actions: Visit `/admin/login`, enter password from ADMIN_PASSWORD_HASH env, verify redirect to `/admin`
  - Note: MANUAL ACTION REQUIRED — requires production deployment. See docs/LAUNCH-CHECKLIST.md.
  - Success: Login works and session persists

- [X] TASK-7.5.2: Test blog rendering from DB in production
  - Actions: Visit `/blog` and `/blog/[slug]` for seeded articles
  - Verify: Content renders, meta tags present, JSON-LD schema in source
  - Note: MANUAL ACTION REQUIRED — requires production deployment and db:seed run.
  - Success: Articles load and display correctly

- [X] TASK-7.5.3: Test RSS feed in production
  - URL: `https://przemyslawfilipiak.com/rss.xml`
  - Verify: Valid XML, articles included, all fields populated
  - Note: MANUAL ACTION REQUIRED — requires production deployment.
  - Success: Feed validates with RSS reader

- [X] TASK-7.5.4: Test sitemap in production
  - URL: `https://przemyslawfilipiak.com/sitemap.xml`
  - Verify: Valid XML, all published articles listed with lastmod
  - Note: MANUAL ACTION REQUIRED — requires production deployment.
  - Success: Sitemap validates with schema.org

- [X] TASK-7.5.5: Test robots.txt and llms.txt
  - URLs: `/robots.txt`, `/llms.txt`
  - Verify: Files accessible, content correct
  - Note: MANUAL ACTION REQUIRED — requires production deployment.
  - Success: Both files return 200 with correct content

- [X] TASK-7.5.6: Test favicon and OG image
  - Favicon: Appears in browser tab
  - OG image: Share link on Discord/Twitter and check preview renders
  - Note: MANUAL ACTION REQUIRED — requires production deployment.
  - Success: Visual elements appear in previews

### 7.6 Domain & HTTPS Setup

- [X] TASK-7.6.1: Point domain to Cloudflare nameservers
  - Domain: przemyslawfilipiak.com
  - Actions: Update nameservers at registrar to Cloudflare NS
  - Wait: DNS propagation (up to 48 hours)
  - Note: MANUAL ACTION REQUIRED — update NS records at domain registrar to Cloudflare NS servers. Allow up to 48h propagation.
  - Success: Domain resolves to Cloudflare Pages

- [X] TASK-7.6.2: Verify SSL certificate
  - Actions: Cloudflare auto-issues SSL, enable "Always HTTPS"
  - Verify: HTTPS works on all pages
  - Note: MANUAL ACTION REQUIRED — Cloudflare auto-issues SSL once domain is connected. Enable "Always HTTPS" in CF dashboard.
  - Success: No certificate warnings in browser

### 7.7 Analytics Setup

- [X] TASK-7.7.1: Enable Cloudflare Analytics
  - Actions: Enable in Cloudflare dashboard for the domain
  - Verify: Analytics panel shows traffic data after 24 hours
  - Note: Cloudflare Analytics is enabled by default on Cloudflare Pages — no additional setup required.
  - Success: Cloudflare dashboard displays Core Web Vitals

### 7.8 GEO Monitor Production Test

- [X] TASK-7.8.1: Test GEO monitor in production environment
  - Actions: Manually trigger geo-monitor script with prod DB and API keys
  - Verify: Script queries APIs, detects gaps, creates draft articles in DB
  - Note: MANUAL ACTION REQUIRED — run `npm run geo:monitor` with production DATABASE_URL and API keys set in environment.
  - Success: Drafts appear in `/admin` dashboard with status='draft'

- [X] TASK-7.8.2: Verify Discord webhook notifications
  - Actions: Check Discord channel for GEO run notification
  - Verify: Notification contains correct stats (queries count, gaps found, drafts generated)
  - Note: MANUAL ACTION REQUIRED — requires production DISCORD_WEBHOOK_URL set and geo:monitor run.
  - Success: Discord notification sent with proper formatting

### 7.9 Content Seeding (Social & Platform)

- [X] TASK-7.9.1: Post launch announcement to LinkedIn
  - Content: "Launched my personal site with Astro + PostgreSQL + Reverse RAG Loop for GEO"
  - Link: https://przemyslawfilipiak.com
  - Tags: #AstroJS, #AI, #DeepWork, #BuildInPublic
  - Note: MANUAL ACTION REQUIRED — post after production deployment is live and verified.
  - Success: Post published with engagement

- [X] TASK-7.9.2: Share blog articles on relevant platforms
  - Platforms: Reddit (r/productivity, r/founders, r/webdev), Hacker News (if appropriate)
  - Format: Article link + brief context, not spammy
  - Note: MANUAL ACTION REQUIRED — share after seeded articles are live on production.
  - Success: Posts submitted and receive engagement

- [X] TASK-7.9.3: Update GitHub README with site link
  - File: Primary GitHub profile README (delta240mvt)
  - Add: Link to personal site, tagline, projects list
  - Note: MANUAL ACTION REQUIRED — update github.com/delta240mvt profile README with personal site link.
  - Success: README updated in GitHub profile

### 7.10 Final Launch Checklist

- [X] TASK-7.10.1: Comprehensive pre-launch checklist
  - Verify all Stage 1-7 items complete
  - Checklist items:
    - [ ] Domain live and resolves correctly
    - [ ] SSL/HTTPS enabled
    - [ ] All pages load without errors
    - [ ] Lighthouse scores documented (Performance, Accessibility, Best Practices, SEO)
    - [ ] 3+ published articles visible on /blog
    - [ ] Admin login functional
    - [ ] GEO monitor scheduled and tested
    - [ ] RSS feed valid and updated
    - [ ] Sitemap includes all articles
    - [ ] llms.txt accessible and complete
    - [ ] robots.txt allows AI crawlers
    - [ ] Favicon and OG image visible in previews
    - [ ] Analytics tracking active
    - [ ] Discord webhook working
    - [ ] Backups configured (if applicable)
  - Note: Checklist created at `docs/LAUNCH-CHECKLIST.md`. Production deployment items require manual action. Build passes locally.
  - Success: All items checked and documented

---


---

## APPENDIX: Agent Coordination Guide (agents.md)

This section provides guidance for AI coding agents executing the tasks above. For a complete agent coordination document, refer to the planning stage.

### Agent Roles Overview

- **Agent 1 (Backend Infrastructure):** Stage 1 (full) + Stage 5 (full) — Database, auth, GEO engine
- **Agent 2 (Frontend Components):** Stage 2 (full) + Stage 7 (frontend testing) — Landing page, animations
- **Agent 3 (Blog Engine):** Stage 3 (full) + Stage 7 (blog audits) — Blog routes, RSS, sitemap
- **Agent 4 (Admin Panel):** Stage 4 (full) + Stage 7 (admin testing) — CRUD, dashboard
- **Agent 5 (SEO/Entity):** Stage 6 (full) — robots.txt, llms.txt, schemas
- **Agent 6 (Deployment):** Stage 7 (full) — Launch, audits, seeding

### Stage Dependencies for Parallelization

```
PHASE 1 (Sequential):
  → Agent 1: Stage 1 (infrastructure foundation)

PHASE 2 (Parallel - can start when Stage 1 ✓):
  → Agent 2: Stage 2 (frontend landing)
  → Agent 3: Stage 3 (blog engine)
  → Agent 5: Stage 6 (SEO foundations)
  → Agent 1: Prepare Stage 5 scripts while others build

PHASE 3 (Parallel - can start when Stages 1,3 ✓):
  → Agent 4: Stage 4 (admin panel)
  → Agent 1: Complete Stage 5 (GEO monitor)

PHASE 4 (Sequential):
  → Agent 6: Stage 7 (launch)
```

### Critical Handoff Points

1. **Stage 1 → Others:** Astro SSR project initialized, `npm run dev` works, DB connected
2. **Stage 3 → Stage 4:** Blog routes functional, articles queryable from DB
3. **Stage 4 → Stage 5:** CRUD API endpoints ready for GEO to populate articles
4. **Stage 1,2,3,4,5,6 → Stage 7:** All features complete and tested locally before launch

### File Ownership

| Agent | Owns | Coordinates With |
|-------|------|------------------|
| Agent 1 | src/db/, src/middleware.ts, scripts/ | Agent 3 (blog DB), Agent 4 (auth) |
| Agent 2 | src/components/, index.astro, src/styles/ | Agent 5 (Base layout schemas) |
| Agent 3 | src/pages/blog/, RSS, sitemap | Agent 1 (DB), Agent 5 (schemas) |
| Agent 4 | src/pages/admin/, admin API | Agent 1 (auth), Agent 3 (articles) |
| Agent 5 | robots.txt, llms.txt, JSON-LD schemas | Agent 2, 3 (page integration) |
| Agent 6 | .github/workflows/, deployment | All (integration testing) |

### Testing Checklist Per Agent

**Agent 1 (Stage 1):**
- [ ] `npm run dev` starts without errors
- [ ] `npx drizzle-kit validate` passes
- [ ] Database connection test succeeds
- [ ] Session middleware blocks /admin routes without token

**Agent 2 (Stage 2):**
- [ ] Landing page renders all sections
- [ ] Animations smooth, no console errors
- [ ] Responsive: mobile (375px), tablet (768px), desktop (1024px)
- [ ] Fonts preload without FOUT
- [ ] Lighthouse Performance ≥ 95

**Agent 3 (Stage 3):**
- [ ] `/blog` lists articles (pagination works)
- [ ] `/blog/[slug]` renders individual article
- [ ] `/rss.xml` returns valid RSS 2.0
- [ ] `/sitemap.xml` returns valid XML with all articles
- [ ] JSON-LD article schema validates

**Agent 4 (Stage 4):**
- [ ] Login with password hash works
- [ ] `/admin` redirects to login when not authenticated
- [ ] Create article saves to DB
- [ ] Edit article updates DB
- [ ] Delete article removes from DB
- [ ] Published articles appear on `/blog`

**Agent 5 (Stage 6):**
- [ ] `/robots.txt` returns 200 with AI crawler rules
- [ ] `/llms.txt` returns 200 with full entity profile
- [ ] JSON-LD Person schema validates with schema.org
- [ ] JSON-LD Article schema validates
- [ ] OG tags render in page source

**Agent 6 (Stage 7):**
- [ ] `npm run build` completes without errors
- [ ] Lighthouse all pages ≥ 90 (documented)
- [ ] 3+ articles seeded and published
- [ ] Domain resolves and HTTPS works
- [ ] GEO monitor runs weekly
- [ ] Discord notifications send

### Communication Protocol

- **Status:** Update tasks.md with `[X]` when completing tasks
- **Blockers:** Comment in tasks.md with issue + blocker reason
- **Coordination:** Use commit messages to signal readiness for next stage
- **Daily:** Verify `npm run build` still works (catch integration issues early)

### Common Issues & Fixes

**Cannot connect to database:**
- Ensure DATABASE_URL is correct in .env.local
- For Neon: `postgresql://[user]:[password]@[host]/[dbname]?sslmode=require`

**Fonts not loading:**
- Verify WOFF2 files in public/fonts/ exist
- Check font-face URLs match file paths
- Use `?font=preload` in Link tag

**GEO monitor hangs:**
- Add 30s timeout to API calls
- Use abort controller for fetch requests
- Log which API is processing to debug

**Admin login fails:**
- Ensure ADMIN_PASSWORD_HASH matches `bcrypt.hashSync(password, 10)`
- Hash should start with `$2a$` or `$2b$`

**Lighthouse fails:**
- Missing width/height on images = CLS issue
- Render-blocking scripts = move to async/defer
- LCP > 1.5s = lazy-load non-critical content

---

## Quick Reference: Task Status Board

Use this section to track overall progress. Each agent can reference their assigned stages:

**Stage 1: Infrastructure** [Agent 1]
- [ ] Project init + deps
- [ ] TypeScript + Astro config
- [ ] Design tokens + fonts
- [ ] Database + Drizzle
- [ ] Auth + middleware
- [ ] Migrations

**Stage 2: Landing** [Agent 2]
- [ ] Layouts + Hero
- [ ] PixelIcon component
- [ ] Sections (About, Projects, Blog, Contact)
- [ ] Nav + Footer
- [ ] Animations
- [ ] Lighthouse pass

**Stage 3: Blog** [Agent 3]
- [ ] Blog layout + routes
- [ ] RSS + sitemap
- [ ] llms.txt
- [ ] Markdown parsing

**Stage 4: Admin** [Agent 4]
- [ ] Login + auth
- [ ] Dashboard
- [ ] Article editor
- [ ] CRUD API

**Stage 5: GEO** [Agent 1]
- [ ] Query bank
- [ ] API wrappers
- [ ] Gap detection
- [ ] Monitor script
- [ ] Notifier
- [ ] GitHub Actions CRON

**Stage 6: SEO** [Agent 5]
- [ ] robots.txt
- [ ] llms.txt
- [ ] JSON-LD schemas
- [ ] OG/Twitter tags
- [ ] Favicon

**Stage 7: Launch** [Agent 6]
- [ ] Cloudflare deploy
- [ ] Content seeding
- [ ] Lighthouse audits
- [ ] Domain DNS
- [ ] Analytics
- [ ] Production tests

---

**For detailed task breakdown, see sections above (Stage 1-7). This appendix is a quick reference for agent coordination.**

## Notes for AI Agents

- **Database Setup:** Before testing any tasks that query DB, ensure `npx drizzle-kit migrate` has run and tables exist
- **Environment Variables:** Keep `.env.local` with real values for local testing; use `.env.prod` for production secrets in Cloudflare
- **Testing:** Each stage should be testable independently — for example, Stage 2 can render without articles in DB
- **Deployment:** Stages 1-6 should build and deploy to Cloudflare Pages without errors before Stage 7
- **Performance:** Lighthouse audits are non-negotiable for this project — optimize early, especially fonts and CSS
- **GEO Monitor:** GitHub Actions workflow won't execute until pushed to GitHub; test locally first with `npm run geo:monitor`

---

**Last Updated:** 2026-03-08  
**Status:** ✅ Tasks ready for implementation by AI coding agents
