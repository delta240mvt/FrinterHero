# Current Architecture Reference

This document is the operational reference for the repository after the monolith split was completed on `2026-03-19`.

Use this file when you need the current runtime truth, service boundaries, ownership rules, or deployment-level architecture in one place.

## 1. Executive Summary

The repository is now a distributed monorepo with:

- one central backend in `apps/api`
- three client runtimes in `apps/*`
- queue-driven workers in `workers/*`
- shared domain and data code in repo-root `src/*`
- Railway-oriented deployment templates in `infra/railway/*`

The architecture program is complete.

This means:

- root is no longer the hidden Astro runtime
- `client1` is fully extracted into `apps/client-przemyslawfilipiak`
- `client1` no longer owns DB-backed backend routes
- route-level singleton job managers are no longer part of production-critical execution
- `Social Hub` is tenant-aware end-to-end through `siteId`

## 2. Runtime Topology

### Core services

- `apps/api`
  - central HTTP backend
  - the only runtime that should be treated as the DB-backed public backend
- `apps/client-przemyslawfilipiak`
  - primary Astro client
  - current full client application for site slug `przemyslawfilipiak`
- `apps/client-focusequalsfreedom`
  - BFF shell for site slug `focusequalsfreedom`
- `apps/client-frinter`
  - BFF shell for site slug `frinter`

### Worker services

- `workers/runner`
  - shared queue-consumer implementation
- `workers/worker-bc`
  - deployable wrapper for `bc-*`
- `workers/worker-sh-copy`
  - deployable wrapper for `sh-copy`
- `workers/worker-sh-video`
  - deployable wrapper for `sh-video`
- `workers/worker-geo-drafts`
  - optional split target
- `workers/worker-reddit`
  - optional split target
- `workers/worker-youtube`
  - optional split target

## 3. Code Ownership Boundaries

### `apps/api`

Owns:

- authentication
- DB-backed CRUD
- orchestration endpoints
- job enqueue
- job status reads
- tenant-aware site boundary enforcement

Must not become:

- a second frontend
- a dumping ground for client rendering concerns

### Clients

Own:

- UI
- SSR page composition
- cookie-forwarding BFF layer
- site-specific presentation

Must not own:

- direct DB access for admin/API runtime logic
- long-running orchestration
- process-local execution state as production truth

### Shared root `src/*`

Owns:

- DB schema
- DB client
- shared libraries
- domain helpers
- cross-runtime utilities

Current active shared backend directories:

- `src/db`
- `src/lib`
- `src/utils`

## 4. Request and Data Flow

### UI / admin flow

1. Browser calls a client route or SSR page.
2. Client route in `apps/client-przemyslawfilipiak/src/pages/api/*` acts as a thin BFF.
3. BFF forwards auth cookies and `siteSlug` to `apps/api`.
4. `apps/api` resolves the authenticated session and target site.
5. `apps/api` performs scoped DB reads/writes or enqueues a job.
6. UI polls status or consumes SSE-style polling streams from the BFF layer.

### Long-running execution flow

1. Client or API route enqueues a record in `app_jobs`.
2. Worker reserves a job by topic from `app_jobs`.
3. Worker runs the corresponding script with environment context.
4. Script writes results back to DB tables and job result payloads.
5. API exposes status and result reads.
6. Client stream/status routes consume the API result, not process RAM.

## 5. Queue Topic Ownership

Topic ownership is intentionally disjoint.

### `worker-general`

Owns:

- `geo`
- `draft`
- `reddit`
- `youtube`
- `sh-publish`

### `worker-bc`

Owns:

- `bc-scrape`
- `bc-parse`
- `bc-selector`
- `bc-cluster`
- `bc-generate`

### `worker-sh-copy`

Owns:

- `sh-copy`

### `worker-sh-video`

Owns:

- `sh-video`

Rule:

- `worker-general` must not consume `bc-*`

## 6. Site and Tenant Model

### Source of tenant truth

The tenant boundary is represented by:

- `sites`
- `SITE_SLUG`
- `siteId`

### Runtime tenant resolution

- clients forward `siteSlug`
- `apps/api` resolves `siteSlug -> sites.id`
- API routes enforce session access against `session.siteId`
- shared helper functions are scoped by `siteId`

### Social Hub tenantization

The following `sh_*` tables are site-scoped:

- `sh_settings`
- `sh_social_accounts`
- `sh_content_briefs`
- `sh_generated_copy`
- `sh_templates`
- `sh_media_assets`
- `sh_publish_log`
- `sh_post_metrics`
- `sh_queue`

Important rule:

- template uniqueness is tenant-local via `(site_id, slug)`

## 7. Module State

### Fully centralized behind `apps/api`

- auth
- articles
- knowledge base
- content gaps
- GEO orchestration
- Reddit orchestration and read models
- YouTube orchestration and read models
- Brand Clarity CRUD and execution
- Social Hub CRUD, execution, queue and analytics

### Admin SSR state

Current truth:

- admin SSR pages do not directly import DB as runtime source of truth
- admin pages fetch via API/BFF routes

## 8. Architectural Invariants

These are the rules that should not be broken in future work.

### Invariant A

`apps/api` is the only DB-backed public backend runtime.

### Invariant B

Clients are API-first shells, not alternate backend implementations.

### Invariant C

Long-running execution must not depend on:

- `globalThis`
- process RAM snapshots
- local `EventEmitter` state

### Invariant D

Any new multi-tenant feature must carry tenant context end-to-end:

- request
- DB write
- background job payload
- worker script env
- result reads

### Invariant E

Docs must describe the current runtime paths, not historical root `src/pages/*` paths.

## 9. Migration and Deploy Flow

### Local / CI migration flow

`npm run migrate` now performs:

1. `db:push`
2. `seed:sites`
3. `backfill:sh-site-scope`

### Why the backfill matters

The Social Hub tenantization included:

- schema support in TypeScript
- SQL migration in `migrations/0009_social_hub_site_scope.sql`
- operational backfill path in `scripts/backfill-sh-site-scope.ts`

This ensures the repo contains both:

- declarative schema intent
- an executable operational migration step

## 10. Repo Shape

```text
apps/
  api/
  client-przemyslawfilipiak/
  client-focusequalsfreedom/
  client-frinter/
workers/
  runner/
  worker-bc/
  worker-geo-drafts/
  worker-reddit/
  worker-youtube/
  worker-sh-copy/
  worker-sh-video/
packages/
  site-config/
src/
  db/
  lib/
  utils/
infra/
  railway/
docs/
```

## 11. Verification Checklist

When validating future architectural work, prefer this checklist:

- `npx tsc --noEmit`
- `npm run build:api`
- `npm run build:client1`
- `npm run build:workers`
- confirm no unexpected `dist` or `.astro` artifacts remain in `apps/*` and `workers/*`
- confirm active docs still match runtime truth
- confirm new routes do not reintroduce direct DB imports into client API or admin page layers

## 12. Current Completion Statement

The correct statement for the repository today is:

- monorepo split: complete
- distributed runtime split: complete
- `client1` extraction: complete
- `client1 -> apps/api` backend cutoff: complete
- worker topic ownership cleanup: complete
- Social Hub tenantization: complete
- architecture documentation alignment: complete

Any remaining work should now be treated as:

- product evolution
- module refinement
- feature development

not as unresolved monorepo architecture work.
