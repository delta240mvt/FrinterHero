# Client Frinter Standalone Astro Design

## Summary

Prepare `apps/client-frinter` as a fully standalone Astro SSG app that can be copied into another repository and run independently. The carved-out app must include the existing landing page, a local-content blog, and all assets/configuration required to build without depending on monorepo-root code, database access, runtime API calls, auth, middleware, or admin routes.

The output is not a generic extraction. It is a productized standalone site folder with a clear internal structure, local content collections, strong SEO/GEO defaults for the blog, and minimal layout change. The only intentional navigation/layout addition is a blog section or link in the footer. No panel, no database, no login flow, no tenant switching, no server-side personalization.

## Goals

- Make `apps/client-frinter` self-contained and portable.
- Keep the current landing layout and visual language intact unless a change is required for portability or blog integration.
- Add a fully static Astro blog based on local Markdown/MDX content.
- Ensure the blog is strongly SEO-compliant and GEO-ready at build time.
- Make the app runnable as a standalone Astro project with `npm install && npm run dev` / `npm run build`.

## Non-Goals

- No admin panel or editorial UI.
- No database-backed article storage.
- No runtime API fetches for landing or blog content.
- No SSR, no middleware auth, no Cloudflare-specific runtime requirements.
- No redesign of the landing page beyond extraction-driven cleanup and the footer blog entry point.
- No CMS integration at this stage.

## Current State

`apps/client-frinter` already contains a significant amount of Astro UI and public assets, but it is not standalone:

- `astro.config.mjs` points aliases at repo-root `src/db`, `src/lib`, and `src/utils`.
- `src/middleware.ts` performs auth checks for `/admin` routes.
- `src/pages/admin/*` and `src/components/admin/*` implement panel-related flows.
- `src/components/BlogPreview.astro` fetches article data from the internal API during build/runtime.
- `package.json` uses a monorepo start helper.
- The landing is largely concentrated in a very large `src/pages/index.astro`.

This means copying the folder elsewhere would currently fail or require manual reconstruction of hidden dependencies.

## Target Architecture

### App Runtime

`apps/client-frinter` becomes a pure Astro static site:

- `output: 'static'`
- no adapter
- no middleware
- no runtime auth
- no runtime backend calls

The app owns every file it needs to build:

- Astro config
- TypeScript config
- package manifest
- content collection schema
- pages
- components
- styles
- fonts and public assets
- site configuration

### Internal Structure

The app should be organized as a small standalone product instead of a monolith page file:

- `package.json`
- `astro.config.mjs`
- `tsconfig.json`
- `README.md`
- `src/config/site.ts`
- `src/content/config.ts`
- `src/content/blog/*`
- `src/layouts/BaseLayout.astro`
- `src/pages/index.astro`
- `src/pages/blog/index.astro`
- `src/pages/blog/[...slug].astro`
- `src/pages/privacy-policy.astro`
- `src/pages/polityka-prywatnosci.astro`
- `src/pages/rss.xml.ts`
- `src/pages/sitemap.xml.ts`
- `src/pages/site.webmanifest.ts`
- `src/components/sections/*`
- `src/components/blog/*`
- `src/components/ui/*`
- `src/styles/*`
- `public/*`

The critical portability rule is simple: nothing inside `client-frinter` may import from outside `apps/client-frinter`.

### Landing Page

The landing page keeps its current layout and visual direction. The carveout should avoid unnecessary redesign. The main structural change is implementation-level decomposition:

- extract section components from the giant `index.astro`
- move reusable styles/config into local files
- remove dead dependencies and historical coupling

The homepage may continue to show a blog preview, but that preview must come from local content collections, not API responses.

The only intended layout/navigation addition is a blog entry in the footer. No new top-nav blog item is required unless the current implementation already has one. This keeps the existing experience stable while still making the blog discoverable and indexable.

### Blog

The blog ships immediately as part of the standalone carveout.

Content source:

- Astro Content Collections
- Markdown or MDX files stored in `src/content/blog`

Required frontmatter:

- `title`
- `description`
- `pubDate`
- `updatedDate?`
- `draft`
- `tags`
- `heroImage?`
- `canonicalUrl?` when needed for syndication/cross-posting

Recommended frontmatter:

- `geoFocus?`
- `excerpt?`
- `featured?`
- `faq?`
- `toc?`

Routes:

- `/blog`
- `/blog/<slug>`
- RSS feed
- sitemap inclusion

Homepage integration:

- latest entries rendered from local collection
- empty-state copy if the collection has no published posts

### Site Configuration

All site-level values should move into `src/config/site.ts`, for example:

- site name
- title template
- production site URL
- default meta description
- organization/person metadata
- social links
- footer links
- CTA URLs
- default OG image

This allows future reuse in another Astro project by editing one local config module instead of hunting string literals across the app.

## SEO and GEO Requirements

The blog must be implemented as a first-class publishing surface, not just a content directory. It should be 100% static and as SEO/GEO-compliant as practical at build time.

### Technical SEO Baseline

Every blog page should support:

- unique title and meta description
- canonical URL
- Open Graph tags
- Twitter card tags
- language and locale metadata
- correct heading hierarchy
- crawlable internal links
- inclusion in sitemap
- inclusion in RSS
- clean permalink generation
- readable publish/update dates
- optional noindex handling for drafts or excluded pages

The blog index should support:

- indexable listing page metadata
- pagination-ready structure even if page 1 ships first
- tag/topic discoverability if lightweight and worthwhile

### Structured Data

Add JSON-LD generated at build time for relevant pages:

- `WebSite`
- `Organization` or `Person`
- `Blog`
- `BlogPosting`
- `BreadcrumbList`
- `FAQPage` when a post explicitly includes FAQ content

Structured data should be derived from local content/config and kept deterministic.

### GEO Readiness

Interpret GEO here as generative-engine optimization and answer-engine readability. The implementation should favor content formatting and metadata that make posts easy for LLM systems and search engines to extract, summarize, and cite.

Blog templates should therefore support:

- explicit descriptions and excerpts
- strong semantic section structure
- direct question/answer blocks where relevant
- byline and clear publication metadata
- updated timestamp when content changes materially
- clean plain-text readable HTML without client-side rendering dependence
- durable canonical URLs
- internal cross-linking between related posts and core landing pages

The existing `llms.txt` and related machine-readable surfaces should remain static-friendly and should be updated if they reference blog inventory or site structure.

## Removal Scope

The carveout removes all panel and backend coupling from the app:

- `src/pages/admin/*`
- `src/components/admin/*`
- `src/middleware.ts`
- auth/session handling
- tenant selection logic
- imports from repo-root aliases
- API-driven article listing
- monorepo-specific start flow

If a page or component only exists to support admin/editorial workflows, it should be deleted rather than preserved behind dead routes.

## Migration Strategy

### Phase 1: Decouple Runtime

Remove every dependency that prevents standalone execution:

- switch Astro config to static output
- remove Cloudflare adapter
- remove repo-root aliases
- remove middleware and auth checks
- replace API/build fetches with local collection access
- replace monorepo-specific `start` script with local Astro-native commands

### Phase 2: Localize Content and Config

Add local content and config primitives:

- site config module
- content collection schema
- initial blog posts or seed content
- SEO metadata helpers
- reusable layout for pages/posts

### Phase 3: Refactor Without Redesign

Split the landing implementation into focused local components while preserving the current appearance and sequence:

- keep section order and visual identity
- avoid redesigning copy/layout except where extraction needs it
- add footer blog section/link only

### Phase 4: Static Publishing Outputs

Ensure the app emits static publishing artifacts:

- sitemap
- RSS
- manifest
- robots compatibility
- machine-readable surfaces such as `llms.txt` if intentionally kept

## Error Handling

This app has no server runtime logic, so failures should happen early and clearly:

- invalid frontmatter should fail the build
- missing required config should fail the build
- empty blog collection should render a valid empty state, not crash
- optional media should degrade gracefully

The preferred model is build-time validation over defensive runtime fallback.

## Verification Criteria

The carveout is complete only when all of the following are true:

- `apps/client-frinter` builds as a static Astro site
- no imports in `apps/client-frinter` point outside the folder
- no admin routes or admin components remain in use
- no middleware or auth flow remains
- no database or API dependency is required
- `/`, `/blog`, blog post pages, RSS, sitemap, manifest, and privacy pages generate successfully
- footer includes the blog entry point
- landing layout remains materially unchanged outside of extraction and footer blog addition
- blog pages emit proper metadata and structured data

## Risks and Design Guardrails

### Risk: Hidden Monorepo Coupling

The biggest risk is leaving a stray import or shared helper behind. Guardrail: explicitly audit imports and remove all external alias usage.

### Risk: Over-Refactoring the Landing

Breaking up `index.astro` can turn into an accidental redesign. Guardrail: decomposition is allowed, redesign is not. Preserve markup and styling behavior unless a change directly supports portability, maintainability, or blog integration.

### Risk: Thin Blog SEO

A static blog can still be weak if it only has bare markdown pages. Guardrail: ship metadata helpers, JSON-LD, canonical generation, RSS, sitemap, and good semantic page templates from the start.

### Risk: False Standalone Promise

If the folder still relies on root `node_modules` layout assumptions or monorepo scripts, portability will be misleading. Guardrail: make package scripts and dependencies valid for local standalone execution.

## Acceptance Criteria

This design is successful when `apps/client-frinter` can be copied into another Astro-compatible codebase or extracted as its own repository and still provide:

- the current Frinter landing page
- a static local-content blog
- SEO/GEO-ready publishing behavior
- footer blog discoverability
- zero admin, auth, DB, or API coupling

The result should feel like a clean product folder, not a detached fragment of a larger monorepo.
