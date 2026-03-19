# Full Architecture Audit — 2026-03-19

Branch: `base180326-API`
Auditor: Claude Opus 4.6
Scope: Full architecture, dependencies, build pipeline, invariant compliance

---

## 1. Executive Summary

The distributed monorepo split (Codex program) is **structurally complete**. All builds pass, TypeScript compiles cleanly, and the runtime topology matches the documented architecture. However, the audit reveals **several residual debt items** that need attention before the architecture can be considered production-hardened.

### Scorecard

| Area | Status | Grade |
|------|--------|-------|
| Build pipeline | All 10 builds pass | **A** |
| TypeScript | `tsc --noEmit` clean | **A** |
| npm workspaces | Symlinks were stale (fixed by `npm install`) | **B** |
| Invariant A (API = only backend) | Violated in 6 SSR pages + 1 middleware | **C** |
| Invariant C (no process RAM jobs) | 1 legacy route + 10 dead singleton managers | **C** |
| API code structure | 3631-line monolith with `@ts-nocheck` | **D** |
| Client2 / Client3 readiness | BFF shells only, no own source code | **B** (by design) |
| Worker architecture | Clean delegation pattern | **A** |
| api-contract completeness | Missing 2 topics vs runtime | **B** |
| Dependency health | 14 npm audit vulnerabilities (10 mod, 4 high) | **C** |

---

## 2. Build Pipeline Audit

### All builds pass

```
npx tsc --noEmit          ✅ clean (0 errors)
npm run build:api         ✅ noop-build placeholder
npm run build:client1     ✅ Astro full build (8.29s)
npm run build:client2     ✅ noop-build placeholder
npm run build:client3     ✅ noop-build placeholder
npm run build:workers     ✅ 7× noop-build placeholders
```

### Build strategy analysis

| Service | Build type | Runtime strategy |
|---------|-----------|-----------------|
| `apps/api` | noop (dist placeholder) | `tsx src/server.ts` at runtime |
| `apps/client-przemyslawfilipiak` | `astro build` (real) | `node dist/server/entry.mjs` |
| `apps/client-focusequalsfreedom` | noop | `client-bff.mjs` (BFF proxy) |
| `apps/client-frinter` | noop | `client-bff.mjs` (BFF proxy) |
| `workers/*` | noop | `tsx ../runner/src/index.ts <topics>` |

**Observation:** The API and all workers use `tsx` for runtime execution (JIT TypeScript). This means:
- No ahead-of-time compilation — runtime depends on `tsx` being installed
- The noop-build creates `dist/BUILD_INFO.txt` placeholders to satisfy Railway's build step
- This is acceptable for the current scale but will become a bottleneck if cold-start latency matters

---

## 3. Dependency Audit

### npm workspace linkage

After fresh `npm install`, all 13 workspace packages resolve correctly:
- 4 apps (`@frinter/api`, `@frinter/client-*`)
- 7 workers (`@frinter/worker-*`)
- 2 packages (`@frinter/site-config`, `@frinter/api-contract`)

**Issue found:** Before `npm install`, all workspace packages showed as `UNMET DEPENDENCY`. This means the `package-lock.json` was out of sync with the workspace layout introduced by Codex. A `npm install` was required to regenerate symlinks.

### Root dependency concerns

| Package | Issue |
|---------|-------|
| `openai` (devDep) | Listed as devDependency but not imported anywhere in source code — dead dependency |
| `satori` + `satori-html` | Used only by `sh-image-gen.ts` — could be worker-only |
| `discord.js` | Heavy package (180+ transitive deps) — check if actively used |
| `apify-client` | Used by scrape jobs — properly scoped |
| `bcrypt` | Native addon — used by `auth.ts` — correct placement |

### npm audit

```
14 vulnerabilities (10 moderate, 4 high)
```

Recommend running `npm audit` and triaging — especially the 4 high-severity items.

### Shared packages status

| Package | Has source | Exports | Used in codebase |
|---------|-----------|---------|-----------------|
| `@frinter/site-config` | Yes | `SiteSlug`, `DefaultSiteConfig`, `getDefaultSiteConfig()` | Only by `src/lib/site-config.ts` |
| `@frinter/api-contract` | Yes | `JobTopic`, `JobStatus`, DTOs | **Not imported anywhere** |

**`@frinter/api-contract` is dead code.** It defines types that duplicate what `apps/api/src/server.ts` implements inline. No consumer imports from it.

---

## 4. Architectural Invariant Compliance

### Invariant A: `apps/api` is the only DB-backed backend

**VIOLATED** in 6 files inside `apps/client-przemyslawfilipiak`:

| File | Import | Violation |
|------|--------|-----------|
| `src/middleware.ts` | `db`, `sessions` | Direct DB query for session validation |
| `src/pages/blog/[slug].astro` | `db`, `articles`, `articleGenerations`, `knowledgeEntries`, `sites` | Direct DB reads |
| `src/pages/blog/index.astro` | `db`, `articles`, `sites` | Direct DB reads |
| `src/pages/rss.xml.ts` | `db`, `articles`, `sites` | Direct DB reads |
| `src/pages/sitemap.xml.ts` | `db`, `articles`, `sites` | Direct DB reads |
| `src/pages/index.astro` | `db` import via site-config chain | Indirect |

**Context:** These are public-facing SSR pages (blog, RSS, sitemap) and the middleware. They read directly from PostgreSQL instead of going through `apps/api`. The 95 BFF/API routes in `pages/api/*` correctly proxy through `internal-api.ts` to the API.

**Risk:** These pages create a second DB connection pool in the client process, bypass the API's tenant resolution, and mean the client runtime depends on the DATABASE_URL environment variable.

### Invariant B: Clients are API-first shells

**Mostly compliant.** 95/98 API routes are pure BFF proxies. Exceptions:

1. `pages/api/generate-draft.ts` — imports `draftJob` singleton (process-local job manager)
2. `pages/api/run-geo.ts` — spawns `scripts/geo-monitor.ts` via `child_process.spawn()` directly

### Invariant C: No process RAM as production truth

**VIOLATED** by:

1. `pages/api/generate-draft.ts` — uses `DraftJobManager` singleton (EventEmitter + spawn)
2. `pages/api/run-geo.ts` — spawns child process directly from client SSR process

Additionally, **10 legacy singleton job managers** exist in `src/lib/`:

| File | Class |
|------|-------|
| `draft-job.ts` | `DraftJobManager extends EventEmitter` |
| `geo-job.ts` | `GeoJobManager extends EventEmitter` |
| `reddit-scrape-job.ts` | `RedditScrapeJobManager extends EventEmitter` |
| `yt-scrape-job.ts` | `YtScrapeJobManager extends EventEmitter` |
| `bc-scrape-job.ts` | `BcScrapeJobManager extends EventEmitter` |
| `bc-selector-job.ts` | `BcSelectorJobManager extends EventEmitter` |
| `bc-lp-parse-job.ts` | `BcLpParseJobManager extends EventEmitter` |
| `bc-lp-gen-job.ts` | `BcLpGenJobManager extends EventEmitter` |
| `sh-copywriter-job.ts` | `ShCopywriterJobManager extends EventEmitter` |
| `sh-video-job.ts` | `ShVideoJobManager extends EventEmitter` |

**Status:** These are the pre-split in-process job managers. Only `draft-job.ts` is still imported by client code. The API (`server.ts`) does not import any of them — it uses the `app_jobs` queue correctly. The worker runner (`workers/runner/src/index.ts`) also doesn't import them — it calls scripts directly.

These files are **dead code** except for the single `generate-draft.ts` import in client1.

### Invariant D: Tenant context end-to-end

**Compliant.** All `sh_*`, `bc_*`, `reddit_*`, `yt_*` tables carry `siteId`. The API resolves tenants via `siteSlug -> sites.id`. Workers receive `siteId` in job payloads.

### Invariant E: Docs describe current runtime paths

**Compliant.** The `current-architecture-reference.md` accurately reflects the actual runtime topology.

---

## 5. API Code Structure

### `apps/api/src/server.ts` — 3631 lines, `@ts-nocheck`

This is the single largest concern in the codebase. The entire backend API is a single file with:

- `// @ts-nocheck` on line 1 — disabling all TypeScript type checking
- Raw `http.createServer()` with manual routing (no framework)
- All route handlers, middleware, auth, CRUD, orchestration in one file
- 196KB file size

**Why this matters:**
- `@ts-nocheck` means the file that handles all DB writes, auth, and business logic has zero type safety
- A single typo in a column name, a missing null check, or a wrong type coercion will only fail at runtime
- Adding new routes means editing a 3600+ line file
- No separation of concerns — auth, routing, validation, business logic, DB queries all intermixed

### Worker runner: 600 lines

`workers/runner/src/index.ts` is well-structured — it's a queue consumer that dispatches to scripts by topic. This is the correct pattern.

---

## 6. Client Architecture Analysis

### Client1 (`apps/client-przemyslawfilipiak`) — Full application

- 35 Astro pages (admin + public)
- 26 Astro components
- 98 BFF API routes (thin proxy layer)
- Full Astro SSR build with `@astrojs/node`
- Has own `tsconfig.json` and `astro.config.mjs`
- Path aliases resolve `@/db`, `@/lib`, `@/utils` to repo root `src/*`

### Client2 (`apps/client-focusequalsfreedom`) — BFF shell

- No `src/` directory
- No `tsconfig.json` or `astro.config`
- Build is noop
- Runtime is `client-bff.mjs` — a 1241-line Node.js HTTP proxy server with:
  - Hardcoded site configs for all 3 tenants
  - Built-in HTML templates for public pages
  - Proxy to `apps/api` for API routes
  - Basic blog rendering from API data

### Client3 (`apps/client-frinter`) — BFF shell

- Identical structure to Client2
- Same `client-bff.mjs` runtime with different site slug parameter

**Assessment:** Client2 and Client3 are functional BFF proxies that can serve tenant-specific content without their own Astro build. This is a valid bootstrap pattern. The `client-bff.mjs` script at 1241 lines is substantial and contains its own HTML templating — this works but creates a maintenance burden if the UI needs to diverge between tenants.

---

## 7. `api-contract` Package Gap

The `@frinter/api-contract` package defines `JobTopic` but is missing topics that exist in the runtime:

| Topic | In api-contract | In worker runner |
|-------|----------------|-----------------|
| `bc-cluster` | missing | present |
| `sh-publish` | missing | present |
| `bc-generate` | present | present |

Additionally, `api-contract` is not imported by any file in the codebase — making it purely documentation that can drift from reality.

---

## 8. Infrastructure and Deploy

### Railway templates

All 12 Railway service templates in `infra/railway/` are consistent with the documented topology:
- 1 API service
- 3 client services
- 6 worker services (general, bc, sh-copy, sh-video, reddit, youtube)
- 1 migration service (one-shot)

### Root `railway.toml`

Still configured as the legacy monolith default:
```toml
[build]
  builder = "NIXPACKS"
  buildCommand = "npm install && npm run build"
[deploy]
  startCommand = "npm run start"
```

This should be harmless (Railway uses per-service configs from `infra/railway/`) but could cause confusion.

---

## 9. File and Code Health

### Dead/orphan files

| File | Status |
|------|--------|
| `test-satori.ts` (root) | Test/scratch file — should not be in repo root |
| `scripts/queries.json` | Static query templates — actively used by GEO monitor |
| `src/lib/draft-job.ts` | Imported only by 1 client route (legacy) |
| `src/lib/geo-job.ts` | Dead — not imported |
| `src/lib/reddit-scrape-job.ts` | Dead — not imported |
| `src/lib/yt-scrape-job.ts` | Dead — not imported |
| `src/lib/bc-scrape-job.ts` | Dead — not imported |
| `src/lib/bc-selector-job.ts` | Dead — not imported |
| `src/lib/bc-lp-parse-job.ts` | Dead — not imported |
| `src/lib/bc-lp-gen-job.ts` | Dead — not imported |
| `src/lib/sh-copywriter-job.ts` | Dead — not imported |
| `src/lib/sh-video-job.ts` | Dead — not imported |
| `apps/client-przemyslawfilipiak/src/pages/api/run-geo.ts` | Legacy route — spawns script directly |

### TypeScript coverage

- Root `tsconfig.json` extends `astro/tsconfigs/strict` — good
- `apps/api/src/server.ts` has `@ts-nocheck` — **the only file in the codebase with type checking disabled**
- No tsconfig in `apps/api/`, workers, or BFF shells — they inherit from root
- Client1 has its own tsconfig with proper path aliases

---

## 10. TODO List — Improvements by Priority

### P0 — Critical (blocks production confidence)

- [x] **Fix `@ts-nocheck` in `apps/api/src/server.ts`** — Remove the pragma and fix type errors. This is the DB-backed backend handling auth, CRUD, and orchestration without type safety.
- [ ] **Run `npm audit fix`** — Triage 14 vulnerabilities (4 high severity).
- [x] **Remove direct DB imports from client1 SSR pages** — `middleware.ts`, `blog/[slug].astro`, `blog/index.astro`, `rss.xml.ts`, `sitemap.xml.ts` violate Invariant A. Either:
  - (a) Add API endpoints for public blog/RSS/sitemap reads and proxy from client, or
  - (b) Accept this as a documented exception for read-only public SSR content

### P1 — High (architectural debt)

- [x] **Migrate `pages/api/generate-draft.ts`** to use `app_jobs` queue (enqueue via API, poll status) instead of in-process `DraftJobManager` singleton. This is the last Invariant C violation.
- [x] **Remove or archive `pages/api/run-geo.ts`** — spawns child processes directly in client SSR. The queue-based flow (`geo/start.ts` → API → worker) already exists.
- [x] **Delete 10 dead singleton job managers** from `src/lib/`:
  - `draft-job.ts`, `geo-job.ts`, `reddit-scrape-job.ts`, `yt-scrape-job.ts`
  - `bc-scrape-job.ts`, `bc-selector-job.ts`, `bc-lp-parse-job.ts`, `bc-lp-gen-job.ts`
  - `sh-copywriter-job.ts`, `sh-video-job.ts`
- [x] **Split `apps/api/src/server.ts`** into modular route files. 3631 lines in a single file with raw `http.createServer` is the #1 maintainability risk. Suggested structure:
  ```
  apps/api/src/
    server.ts          (entry + http boilerplate)
    router.ts          (route dispatch)
    middleware/         (auth, tenant resolution, CORS)
    routes/
      auth.ts
      articles.ts
      content-gaps.ts
      geo.ts
      reddit.ts
      youtube.ts
      brand-clarity.ts
      social-hub.ts
      jobs.ts
  ```

### P2 — Medium (code quality)

- [x] **Update `@frinter/api-contract` JobTopic** to include `bc-cluster` and `sh-publish`, or delete the package if it's not going to be consumed.
- [ ] **Remove `openai` from root devDependencies** — not imported anywhere.
- [ ] **Evaluate `discord.js` dependency** — confirm it's actively used; if not, remove (heavy transitive dep tree).
- [x] **Delete `test-satori.ts`** from repo root.
- [x] **Regenerate `package-lock.json`** and commit — the lock file was out of sync with workspace layout.
- [x] **Add `tsconfig.json` to `apps/api/`** — currently inherits from root Astro config, but the API is not an Astro app.

### P3 — Low (future readiness)

- [ ] **Consider ahead-of-time compilation for API and workers** — replace `tsx` runtime execution with `tsc` or `tsup` builds for faster cold starts in production.
- [ ] **Add health check endpoints to workers** — currently only `apps/api` has `/health`.
- [ ] **Root `railway.toml`** — update or remove to avoid confusion with per-service configs in `infra/railway/`.
- [ ] **Client BFF template duplication** — `client-bff.mjs` contains hardcoded HTML templates and site configs. Consider extracting shared template logic if client2/client3 UI needs evolve beyond the current BFF proxy.

---

## 11. Architecture Diagram (Verified)

The ASCII diagram in `docs/architecture/current-architecture-reference.md` accurately represents the runtime truth with these notes:

1. The `worker-general` concept maps to `workers/runner` started with `geo,draft,reddit,youtube,sh-publish` topics
2. Client2 and Client3 are BFF proxies (not Astro apps) — this is correct but worth noting in the diagram
3. The direct DB connections from Client1 SSR pages are not shown in the diagram (they should be, or they should be removed)

---

## 12. Conclusion

The Codex architecture program delivered what it set out to do: a clean distributed monorepo with separated concerns, queue-driven workers, and multi-tenant support. The build pipeline works, TypeScript compiles cleanly, and the runtime topology is sound.

The remaining work is **debt cleanup** (dead code, invariant violations, the `@ts-nocheck` monolith) rather than structural rework. The P0 items should be addressed before the next feature development cycle to prevent the debt from compounding.
