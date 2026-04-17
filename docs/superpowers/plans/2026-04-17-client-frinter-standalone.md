# Client Frinter Standalone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `apps/client-frinter` into a fully standalone Astro SSG app with a local-content blog, zero admin/API/DB coupling, strong SEO/GEO defaults, and no intentional landing redesign beyond adding blog discoverability in the footer.

**Architecture:** The current app mixes a static landing with middleware, admin pages, API routes, repo-root aliases, and API-driven blog data. The implementation will first sever all runtime coupling, then replace article data with Astro Content Collections and local SEO helpers, then reshape the landing into local sections without changing its visual structure. The end state is a self-contained Astro static app that can be copied into another project and still build on its own.

**Tech Stack:** Astro 4, TypeScript, Tailwind integration, Astro Content Collections, Markdown/MDX content, static routes (`output: 'static'`), JSON-LD, RSS, sitemap.

---

## File Structure Map

### Files to Modify

- `apps/client-frinter/package.json`
- `apps/client-frinter/astro.config.mjs`
- `apps/client-frinter/tsconfig.json`
- `apps/client-frinter/README.md`
- `apps/client-frinter/package-lock.json`
- `apps/client-frinter/src/pages/index.astro`
- `apps/client-frinter/src/pages/blog/index.astro`
- `apps/client-frinter/src/pages/blog/[...slug].astro`
- `apps/client-frinter/src/components/PixelIcon.astro`
- `apps/client-frinter/src/pages/rss.xml.ts`
- `apps/client-frinter/src/pages/sitemap.xml.ts`
- `apps/client-frinter/src/pages/llms.txt.ts`
- `apps/client-frinter/src/pages/llms-full.txt.ts`
- `apps/client-frinter/src/pages/site.webmanifest.ts`
- `apps/client-frinter/src/pages/privacy-policy.astro`
- `apps/client-frinter/src/pages/polityka-prywatnosci.astro`
- `apps/client-frinter/src/components/BlogPreview.astro`
- `apps/client-frinter/src/components/Footer.astro`
- `apps/client-frinter/src/components/BlogCard.astro`
- `apps/client-frinter/src/components/layouts/Landing.astro`
- `apps/client-frinter/src/styles/global.css`
- `apps/client-frinter/src/styles/tokens.css`

### Files to Create

- `apps/client-frinter/src/config/site.ts`
- `apps/client-frinter/src/config/seo.ts`
- `apps/client-frinter/src/lib/privacy-policy.ts`
- `apps/client-frinter/src/lib/sprites.ts`
- `apps/client-frinter/src/content/config.ts`
- `apps/client-frinter/src/content/blog/getting-started-with-frinter.md`
- `apps/client-frinter/src/content/blog/deep-work-without-willpower.md`
- `apps/client-frinter/src/content/blog/founder-focus-systems.md`
- `apps/client-frinter/src/layouts/BaseLayout.astro`
- `apps/client-frinter/src/layouts/BlogPostLayout.astro`
- `apps/client-frinter/src/components/blog/BlogIndexHeader.astro`
- `apps/client-frinter/src/components/blog/BlogPostMeta.astro`
- `apps/client-frinter/src/components/blog/BlogStructuredData.astro`
- `apps/client-frinter/src/components/sections/HeroSection.astro`
- `apps/client-frinter/src/components/sections/FooterBlogLink.astro`

### Files to Delete

- `apps/client-frinter/server.mjs`
- `apps/client-frinter/src/middleware.ts`
- `apps/client-frinter/src/astro-middleware.d.ts`
- `apps/client-frinter/src/pages/health.ts`
- `apps/client-frinter/src/pages/umami.js.ts`
- `apps/client-frinter/src/pages/blog/[slug].astro`
- `apps/client-frinter/src/pages/blog/[page].astro`
- `apps/client-frinter/src/pages/admin/**`
- `apps/client-frinter/src/pages/api/**`
- `apps/client-frinter/src/components/admin/**`
- `apps/client-frinter/src/components/layouts/Base.astro`
- `apps/client-frinter/src/components/layouts/BlogPost.astro`

If a replacement file from the “create” list makes an old file redundant, remove the old file in the same task so the app converges quickly.

---

### Task 1: Freeze the Runtime Surface

**Files:**
- Modify: `apps/client-frinter/package.json`, `apps/client-frinter/package-lock.json`, `apps/client-frinter/astro.config.mjs`, `apps/client-frinter/tsconfig.json`
- Delete: `apps/client-frinter/server.mjs`, `apps/client-frinter/src/middleware.ts`, `apps/client-frinter/src/astro-middleware.d.ts`, `apps/client-frinter/src/pages/health.ts`, `apps/client-frinter/src/pages/umami.js.ts`
- Test: `apps/client-frinter/package.json`

- [ ] **Step 1: Read the current app package/runtime config**

Open:
```bash
Get-Content -Raw apps/client-frinter/package.json
Get-Content -Raw apps/client-frinter/astro.config.mjs
Get-Content -Raw apps/client-frinter/tsconfig.json
```
Expected: package scripts still reference monorepo runtime and Astro config still references Cloudflare adapter and repo-root aliases.

- [ ] **Step 2: Write the failing verification command**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: build still depends on current mixed runtime assumptions; use this as the before-state checkpoint.

- [ ] **Step 3: Replace runtime with standalone static config**

Update `apps/client-frinter/astro.config.mjs` to:
- use `output: 'static'`
- remove `@astrojs/cloudflare`
- keep only local aliases rooted in `apps/client-frinter/src` if any alias remains
- keep Tailwind integration only if it does not require repo-root config

Minimal target shape:
```js
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'static',
  integrations: [tailwind({ configFile: './tailwind.config.mjs', applyBaseStyles: false })],
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(appDir, 'src'),
      },
    },
  },
});
```

- [ ] **Step 4: Replace scripts with standalone-friendly commands**

Update `apps/client-frinter/package.json` scripts to Astro-native commands only:
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "start": "astro preview"
  }
}
```

Populate `dependencies` / `devDependencies` so the app can build after being copied out of the monorepo. At minimum, add every package the standalone app imports directly for build/runtime, rather than relying on the repo-root manifest.

- [ ] **Step 5: Refresh the app-local lockfile**

Run from inside the app directory:
```bash
Push-Location apps/client-frinter
npm install --workspaces=false
Pop-Location
```
Expected: `apps/client-frinter/package-lock.json` is created or refreshed with app-local dependencies.

- [ ] **Step 6: Remove server, middleware, and non-standalone utility routes**

Delete:
```text
apps/client-frinter/server.mjs
apps/client-frinter/src/middleware.ts
apps/client-frinter/src/astro-middleware.d.ts
apps/client-frinter/src/pages/health.ts
apps/client-frinter/src/pages/umami.js.ts
```

- [ ] **Step 7: Run the build again from the app directory**

Run:
```bash
Push-Location apps/client-frinter
npm run build
Pop-Location
```
Expected: build may still fail on old blog/admin/API imports, but it must no longer depend on adapter or middleware setup.

- [ ] **Step 8: Commit**

```bash
git add apps/client-frinter/package.json apps/client-frinter/package-lock.json apps/client-frinter/astro.config.mjs apps/client-frinter/tsconfig.json apps/client-frinter/server.mjs apps/client-frinter/src/middleware.ts apps/client-frinter/src/astro-middleware.d.ts apps/client-frinter/src/pages/health.ts apps/client-frinter/src/pages/umami.js.ts
git commit -m "refactor(frinter): switch client-frinter to standalone static runtime"
```

---

### Task 2: Remove Admin and API Surface

**Files:**
- Delete: `apps/client-frinter/src/pages/admin/**`, `apps/client-frinter/src/pages/api/**`, `apps/client-frinter/src/components/admin/**`
- Modify: `apps/client-frinter/src/pages/index.astro`, `apps/client-frinter/src/components/Footer.astro`, `apps/client-frinter/src/components/Nav.astro`
- Test: route inventory via Astro build

- [ ] **Step 1: Confirm no public page still needs admin/api paths**

Search:
```bash
Get-ChildItem -Recurse -File apps/client-frinter/src | Select-String -Pattern '/admin','/api/','session','login','switch-tenant','umami.js','health'
```
Expected: identify remaining references that must be removed or replaced before deleting the routes.

- [ ] **Step 2: Delete admin route tree**

Delete:
```text
apps/client-frinter/src/pages/admin
apps/client-frinter/src/components/admin
```

- [ ] **Step 3: Delete internal API route tree**

Delete:
```text
apps/client-frinter/src/pages/api
```

- [ ] **Step 4: Remove dead links from public UI**

Update any public-facing components or pages that link to deleted admin/API flows. Keep the landing layout intact; only remove obsolete destinations. If any surviving base/layout component still injects `/umami.js` or references deleted utility routes, remove that tag in this task.

- [ ] **Step 5: Build to confirm no route references remain**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: build may still fail on content/API helper imports, but not because deleted route files are still referenced.

- [ ] **Step 6: Commit**

```bash
git add apps/client-frinter/src/pages apps/client-frinter/src/components
git commit -m "refactor(frinter): remove admin and api surfaces from standalone app"
```

---

### Task 3: Localize Site Configuration

**Files:**
- Create: `apps/client-frinter/src/config/site.ts`, `apps/client-frinter/src/config/seo.ts`, `apps/client-frinter/src/lib/privacy-policy.ts`, `apps/client-frinter/src/lib/sprites.ts`
- Modify: `apps/client-frinter/src/components/PixelIcon.astro`, `apps/client-frinter/src/pages/rss.xml.ts`, `apps/client-frinter/src/pages/sitemap.xml.ts`, `apps/client-frinter/src/pages/site.webmanifest.ts`, `apps/client-frinter/src/pages/privacy-policy.astro`, `apps/client-frinter/src/pages/polityka-prywatnosci.astro`
- Test: import graph via build

- [ ] **Step 1: Capture current site metadata usage**

Search for repo-root site helpers:
```bash
Get-ChildItem -Recurse -File apps/client-frinter/src | Select-String -Pattern 'site-config','internal-api','canonicalBaseUrl','absoluteUrl','getSitePresentation','getCurrentSiteSlug','@/lib/','@/utils/','@/db/','../../src/lib','../../src/utils','../../src/db'
```
Expected: list all files that still rely on root helpers.

- [ ] **Step 2: Create local site config**

Create `apps/client-frinter/src/config/site.ts` with a single exported object holding:
- site name
- base URL
- locale
- author / organization data
- contact email
- default title/description
- blog title/description
- social links
- footer links
- default OG image

Example skeleton:
```ts
export const siteConfig = {
  name: 'frinter',
  url: 'https://web.frinter.app',
  locale: 'en-US',
  authorName: 'Przemyslaw Filipiak',
  blogTitle: 'Frinter Blog',
  blogDescription: 'Deep work, founder systems, and attention design.',
};
```

- [ ] **Step 3: Create local SEO helpers**

Create `apps/client-frinter/src/config/seo.ts` with helpers such as:
```ts
import { siteConfig } from './site';

export function absoluteUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export function blogCanonical(slug: string) {
  return absoluteUrl(`/blog/${slug}`);
}
```

- [ ] **Step 4: Add local replacements for privacy content and sprites**

Create local modules to replace existing repo-root imports:
- `src/lib/privacy-policy.ts` for privacy policy content/data
- `src/lib/sprites.ts` for pixel sprite data used by `PixelIcon.astro`

- [ ] **Step 5: Replace all repo-root metadata and utility imports**

Update every file still importing root site/internal API helpers to import from local config instead. If a file only existed to bridge the old helpers, replace or remove it.

- [ ] **Step 6: Rebuild**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: remaining failures, if any, now come from blog content implementation gaps rather than missing root helper imports.

- [ ] **Step 7: Commit**

```bash
git add apps/client-frinter/src/config apps/client-frinter/src/lib apps/client-frinter/src/components/PixelIcon.astro apps/client-frinter/src/pages
git commit -m "refactor(frinter): localize site metadata and seo helpers"
```

---

### Task 4: Establish Astro Content Collections

**Files:**
- Create: `apps/client-frinter/src/content/config.ts`, `apps/client-frinter/src/content/blog/getting-started-with-frinter.md`, `apps/client-frinter/src/content/blog/deep-work-without-willpower.md`, `apps/client-frinter/src/content/blog/founder-focus-systems.md`
- Modify: `apps/client-frinter/package.json`
- Test: collection schema validation through build

- [ ] **Step 1: Add content collection schema**

Create `apps/client-frinter/src/content/config.ts` with a `blog` collection schema that validates:
- `title`
- `description`
- `pubDate`
- `updatedDate`
- `draft`
- `tags`
- `heroImage`
- `canonicalUrl`
- `geoFocus`
- `excerpt`
- `featured`
- `faq`

Suggested starting shape:
```ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    heroImage: z.string().optional(),
    canonicalUrl: z.string().url().optional(),
    geoFocus: z.string().optional(),
    excerpt: z.string().optional(),
    featured: z.boolean().optional(),
    faq: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
  }),
});

export const collections = { blog };
```

- [ ] **Step 2: Add seed posts**

Create at least three non-draft posts in `src/content/blog`. They do not need final production copy, but must be structurally real and exercise:
- tags
- excerpt
- optional FAQ
- geo/answer-engine oriented headings

- [ ] **Step 3: Add MD/MDX support only if actually needed**

If posts require MDX features, add the minimal Astro MDX integration. If plain Markdown is enough, do not add extra dependencies.

- [ ] **Step 4: Run build to validate frontmatter**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: collection schema validates and content files parse successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/client-frinter/src/content apps/client-frinter/package.json
git commit -m "feat(frinter): add local astro content collections for blog"
```

---

### Task 5: Rebuild Blog Index From Local Content

**Files:**
- Modify: `apps/client-frinter/src/pages/blog/index.astro`, `apps/client-frinter/src/components/BlogCard.astro`
- Delete: `apps/client-frinter/src/pages/blog/[page].astro`
- Create: `apps/client-frinter/src/components/blog/BlogIndexHeader.astro`
- Test: `apps/client-frinter/src/pages/blog/index.astro`

- [ ] **Step 1: Write the failing behavior check**

Build now and note that `src/pages/blog/index.astro` still depends on runtime fetches:
```bash
Get-Content -Raw apps/client-frinter/src/pages/blog/index.astro
```
Expected: file still imports API/root helpers and needs replacement.

- [ ] **Step 2: Replace API fetches with collection reads**

Update `src/pages/blog/index.astro` to use:
```ts
import { getCollection } from 'astro:content';

const posts = (await getCollection('blog'))
  .filter((entry) => !entry.data.draft)
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
```

Do not keep query-param runtime pagination. Make the page pagination-ready even if only page 1 ships now: structure the page so it can move to Astro `paginate()` without redesign, and remove the old dynamic `src/pages/blog/[page].astro` route in this task if it is no longer needed.

- [ ] **Step 3: Add local blog header/presentation component**

Create `src/components/blog/BlogIndexHeader.astro` and move the list header/filter intro there if it improves readability. Keep the current visual language.

- [ ] **Step 4: Keep SEO metadata and empty-state behavior on the index page**

The `/blog` page should emit:
- title
- description
- canonical
- `WebSite` JSON-LD
- `Organization` or `Person` JSON-LD
- `Blog` JSON-LD
- breadcrumb JSON-LD

Also require a valid empty state when there are no published posts. The page must render successfully with zero published entries.

- [ ] **Step 5: Delete the old paginated runtime route**

Delete:
```text
apps/client-frinter/src/pages/blog/[page].astro
```

- [ ] **Step 6: Rebuild and inspect the generated listing**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: `/blog/index.html` is generated from local content and no network fetch happens.

- [ ] **Step 7: Verify the empty-state path**

Temporarily mark all seed posts as drafts or filter them out, then rebuild once to confirm the `/blog` page renders the empty state without crashing. Restore the published state before committing.

- [ ] **Step 8: Commit**

```bash
git add apps/client-frinter/src/pages/blog/index.astro apps/client-frinter/src/pages/blog/[page].astro apps/client-frinter/src/components/BlogCard.astro apps/client-frinter/src/components/blog
git commit -m "feat(frinter): generate blog index from local astro content"
```

---

### Task 6: Rebuild Blog Post Pages With SEO and GEO Metadata

**Files:**
- Delete: `apps/client-frinter/src/pages/blog/[slug].astro`, `apps/client-frinter/src/components/layouts/Base.astro`, `apps/client-frinter/src/components/layouts/BlogPost.astro`
- Create: `apps/client-frinter/src/pages/blog/[...slug].astro`, `apps/client-frinter/src/layouts/BaseLayout.astro`, `apps/client-frinter/src/layouts/BlogPostLayout.astro`, `apps/client-frinter/src/components/blog/BlogPostMeta.astro`, `apps/client-frinter/src/components/blog/BlogStructuredData.astro`
- Test: blog post generation and JSON-LD output

- [ ] **Step 1: Open the slug page using a literal path**

Run:
```bash
Get-Content -Raw -LiteralPath 'apps/client-frinter/src/pages/blog/[slug].astro'
```
Expected: current implementation still depends on the old article source.

- [ ] **Step 2: Replace slug page with collection-driven catch-all static route**

Use Astro content APIs:
```ts
import { getCollection, getEntryBySlug } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.map((post) => ({ params: { slug: post.slug.split('/') }, props: { post } }));
}
```

Target file: `src/pages/blog/[...slug].astro`

- [ ] **Step 3: Introduce a dedicated base layout**

Create `src/layouts/BaseLayout.astro` for shared `<head>` tags, global meta, favicon links, canonical handling, OG/Twitter fields, and shared wrapper markup.

- [ ] **Step 4: Introduce a blog post layout**

Create `src/layouts/BlogPostLayout.astro` for:
- article title
- description/excerpt
- byline
- publish/update dates
- tags
- optional hero image
- related links / “back to blog”

- [ ] **Step 5: Add structured data**

Create `src/components/blog/BlogStructuredData.astro` that can emit:
- `WebSite`
- `Organization` or `Person`
- `Blog`
- `BlogPosting`
- `BreadcrumbList`
- optional `FAQPage`

Include author and publisher references from `siteConfig`.

- [ ] **Step 6: Preserve GEO-oriented readability**

Make sure the article template renders content in semantic HTML with:
- one `h1`
- descriptive lead paragraph
- clear heading hierarchy
- plain server-rendered content
- optional FAQ block rendered in HTML, not client JS

- [ ] **Step 7: Build and inspect at least one generated post**

Run:
```bash
npm --workspace apps/client-frinter run build
Get-ChildItem -Recurse -File apps/client-frinter/dist | Select-String -Pattern 'application/ld\\+json','BlogPosting','FAQPage'
```
Expected: generated blog post HTML contains expected JSON-LD markers.

- [ ] **Step 8: Remove superseded legacy layouts and route**

Delete:
```text
apps/client-frinter/src/pages/blog/[slug].astro
apps/client-frinter/src/components/layouts/Base.astro
apps/client-frinter/src/components/layouts/BlogPost.astro
```

- [ ] **Step 9: Commit**

```bash
git add apps/client-frinter/src/pages/blog apps/client-frinter/src/layouts apps/client-frinter/src/components/blog apps/client-frinter/src/components/layouts
git commit -m "feat(frinter): add static blog post generation with seo and geo metadata"
```

---

### Task 7: Replace Homepage Blog Preview and Footer Discoverability

**Files:**
- Modify: `apps/client-frinter/src/components/BlogPreview.astro`, `apps/client-frinter/src/components/Footer.astro`, `apps/client-frinter/src/pages/index.astro`
- Create: `apps/client-frinter/src/components/sections/FooterBlogLink.astro`
- Test: homepage build output

- [ ] **Step 1: Replace blog preview data source**

Update `BlogPreview.astro` to read the three latest published content entries from Astro collections instead of calling the API.

- [ ] **Step 2: Keep landing layout unchanged**

Do not redesign the homepage. The goal is only to swap the data source and preserve the present structure.

- [ ] **Step 3: Add blog discoverability in the footer**

Update `Footer.astro` to include a dedicated blog section or blog link in the footer only. Do not add a new top-nav requirement.

- [ ] **Step 4: Patch the actual homepage markup**

Because the current `src/pages/index.astro` renders its own blog preview/footer markup inline, update that file directly so `/` really consumes the local blog data and footer blog entry point. If the page is first migrated to shared components, verify those components are actually used by `/`.

- [ ] **Step 5: Build and inspect `/`**

Run:
```bash
npm --workspace apps/client-frinter run build
Get-Content -Raw 'apps/client-frinter/dist/index.html'
```
Expected: homepage HTML includes blog preview markup and footer blog entry point with no API references.

- [ ] **Step 6: Commit**

```bash
git add apps/client-frinter/src/components/BlogPreview.astro apps/client-frinter/src/components/Footer.astro apps/client-frinter/src/pages/index.astro apps/client-frinter/src/components/sections
git commit -m "feat(frinter): connect homepage and footer to local standalone blog"
```

---

### Task 8: Refactor Landing Into Local Sections Without Redesign

**Files:**
- Modify: `apps/client-frinter/src/pages/index.astro`
- Create: `apps/client-frinter/src/components/sections/HeroSection.astro`
- Modify or create additional `apps/client-frinter/src/components/sections/*` files as needed
- Test: homepage render parity through build

- [ ] **Step 1: Identify stable section boundaries in `index.astro`**

Open:
```bash
Get-Content -Raw apps/client-frinter/src/pages/index.astro
```
Expected: one large page file with multiple visually distinct sections.

- [ ] **Step 2: Extract one section at a time**

Move stable chunks into local `src/components/sections/*` files. Start with a low-risk section such as hero or footer-adjacent content.

Example:
```astro
--- import HeroSection from '@/components/sections/HeroSection.astro'; ---
<HeroSection />
```

- [ ] **Step 3: Keep styles functionally equivalent**

If styles can stay inline without harming portability, keep them. If extraction improves maintainability, move them into local CSS files under `src/styles/*`. Do not change the visual hierarchy or CTA flow.

- [ ] **Step 4: Remove obsolete components left from pre-carveout architecture**

If `About.astro`, `AsciiHero.astro`, `Projects.astro`, or other legacy components are unused after extraction, delete them in the same task.

- [ ] **Step 5: Build and compare**

Run:
```bash
npm --workspace apps/client-frinter run build
```
Expected: no visual redesign implied by code changes; homepage still builds and preserves structure.

- [ ] **Step 6: Commit**

```bash
git add apps/client-frinter/src/pages/index.astro apps/client-frinter/src/components/sections apps/client-frinter/src/styles apps/client-frinter/src/components
git commit -m "refactor(frinter): split landing into local section components"
```

---

### Task 9: Rebuild Static Publishing Outputs

**Files:**
- Modify: `apps/client-frinter/src/pages/rss.xml.ts`, `apps/client-frinter/src/pages/sitemap.xml.ts`, `apps/client-frinter/src/pages/llms.txt.ts`, `apps/client-frinter/src/pages/llms-full.txt.ts`, `apps/client-frinter/src/pages/site.webmanifest.ts`, `apps/client-frinter/public/robots.txt`
- Test: generated XML/TXT/manifest files

- [ ] **Step 1: Replace RSS data source**

Update `rss.xml.ts` to generate feed items from `getCollection('blog')`, not API fetches.

- [ ] **Step 2: Replace sitemap data source**

Update `sitemap.xml.ts` to include:
- `/`
- `/blog`
- all published post URLs
- privacy pages
- RSS
- `llms.txt` and `llms-full.txt` if kept

- [ ] **Step 3: Update machine-readable LLM surfaces**

Ensure `llms.txt` and `llms-full.txt` describe the standalone site correctly and, if appropriate, include the blog inventory or content categories without relying on runtime queries.

- [ ] **Step 4: Verify manifest and robots**

Make sure `site.webmanifest.ts` and `public/robots.txt` reference the standalone site URL and do not mention removed admin/API paths.

- [ ] **Step 5: Confirm homepage/blog empty states do not break publishing outputs**

Run one build with no published posts to confirm RSS, sitemap, `llms.txt`, and homepage/blog pages still generate valid outputs. Restore published posts before committing.

- [ ] **Step 6: Build and inspect outputs**

Run:
```bash
npm --workspace apps/client-frinter run build
Get-Content -Raw 'apps/client-frinter/dist/rss.xml'
Get-Content -Raw 'apps/client-frinter/dist/sitemap-index.xml'
```

If Astro emits `dist/sitemap.xml` instead of `sitemap-index.xml`, inspect that file instead. Expected: generated outputs reference static pages and content entries only.

- [ ] **Step 7: Commit**

```bash
git add apps/client-frinter/src/pages apps/client-frinter/public/robots.txt
git commit -m "feat(frinter): rebuild static publishing outputs for standalone blog"
```

---

### Task 10: Standalone Readme and Final Verification

**Files:**
- Modify: `apps/client-frinter/README.md`
- Test: full standalone verification commands

- [ ] **Step 1: Document standalone usage**

Update `apps/client-frinter/README.md` with:
- what this app is
- required Node/npm version if relevant
- local dev command
- build command
- where blog content lives
- which files to edit when moving to another project

- [ ] **Step 2: Audit for forbidden imports and routes**

Run:
```bash
Get-ChildItem -Recurse -Include *.astro,*.ts,*.tsx,*.js,*.mjs,*.json -File apps/client-frinter/src,apps/client-frinter | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\' -and $_.Name -ne 'package-lock.json' } | Select-String -Pattern "@/db/","internal-api","getCurrentSiteSlug","getSitePresentation","/admin","/api/"
@'
const fs = require("fs");
const path = require("path");
const root = path.resolve("apps/client-frinter");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(astro|ts|tsx|js|mjs)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
const importRe = /(?:from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importRe)) {
    const spec = match[1] || match[2] || match[3];
    if (!spec || !spec.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), spec);
    if (!resolved.startsWith(root)) offenders.push(`${file} -> ${spec} -> ${resolved}`);
  }
}
if (offenders.length) {
  console.error(offenders.join("\n"));
  process.exit(1);
}
'@ | node
Get-Content -Raw apps/client-frinter/astro.config.mjs
Get-Content -Raw apps/client-frinter/tsconfig.json
```
Expected:
- no code import should traverse outside `apps/client-frinter`
- no alias/config entry should point to repo-root paths
- no runtime code should mention removed admin/API coupling
- docs may mention these strings, but implementation/config files must not

- [ ] **Step 3: Run final build from the app directory**

Run:
```bash
Push-Location apps/client-frinter
npm run build
Pop-Location
```
Expected: success.

- [ ] **Step 4: Verify true standalone install/build**

Run from the app directory after removing any reliance on the monorepo workspace:
```bash
Push-Location apps/client-frinter
npm install --workspaces=false
npm run build
Pop-Location
```
Expected: success with only app-local manifest/lockfile dependencies.

- [ ] **Step 5: Verify standalone dev mode**

Run from the app directory:
```bash
Push-Location apps/client-frinter
$job = Start-Job { Set-Location 'C:/Users/delta/Desktop/FRINTER.APP + PERSONAL BRAND/FRINTER - CURSOR - 26.11.25/FrinterHero/apps/client-frinter'; npm run dev -- --host 127.0.0.1 --port 4321 }
Start-Sleep -Seconds 10
Invoke-WebRequest http://127.0.0.1:4321 -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Stop-Job $job
Remove-Job $job
Pop-Location
```
Expected: HTTP 200 from the standalone dev server.

- [ ] **Step 6: Verify copied-folder portability**

Copy `apps/client-frinter` to a temporary directory outside the monorepo and verify:
```bash
$tmp = Join-Path $env:TEMP 'client-frinter-standalone-check'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Copy-Item -Recurse apps/client-frinter $tmp
Push-Location $tmp
Remove-Item -Recurse -Force node_modules,dist -ErrorAction SilentlyContinue
npm install
npm run build
Pop-Location
```
Expected: success from the copied folder.

- [ ] **Step 7: Preview the standalone app**

Run:
```bash
Push-Location apps/client-frinter
npm run preview
Pop-Location
```
Expected: local preview serves homepage, blog index, blog posts, RSS, sitemap, privacy pages.

- [ ] **Step 8: Spot-check final output**

Verify:
```bash
Get-ChildItem -Recurse -File apps/client-frinter/dist
```
Expected routes/assets include:
- `index.html`
- `blog/index.html`
- one HTML file per seed post
- `rss.xml`
- `sitemap.xml` or `sitemap-index.xml`
- `llms.txt`
- `llms-full.txt`
- `site.webmanifest`

- [ ] **Step 9: Commit**

```bash
git add apps/client-frinter/README.md apps/client-frinter
git commit -m "docs(frinter): document standalone app and verify final static output"
```

---

## Plan Review Notes

This environment supports subagents, but this session was not explicitly authorized for delegated agent work. Because of that, the usual plan-document review subagent loop is intentionally not executed here. If you want, the next execution session can include a dedicated review pass before implementation starts.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-client-frinter-standalone.md`.

Two execution options:

1. Subagent-Driven (default and recommended when subagents are available) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints
