# Monorepo Split Audit - 2026-03-19

This document records the actual repository state after the `client1` workspace cutover and the distributed Railway split work.

## Executive Summary

What is complete:

- root is no longer the hidden Astro app
- `client1` is a real workspace app in `apps/client-przemyslawfilipiak`
- central `apps/api` exists and handles a significant part of auth, CRUD and job orchestration
- worker topology exists in `workers/*` and `infra/railway/*`
- `Social Hub` active admin path is largely API-first
- `Social Hub` data model is now tenantized by `siteId`
- `Reddit`, `YouTube` and key `Brand Clarity` admin pages have already been decoupled from direct SSR DB access

What is not complete:
- no architecture-blocking split work remains

## Runtime Layout

Current runtime directories:

- `apps/api`
- `apps/client-przemyslawfilipiak`
- `apps/client-focusequalsfreedom`
- `apps/client-frinter`
- `workers/runner`
- `workers/worker-bc`
- `workers/worker-geo-drafts`
- `workers/worker-reddit`
- `workers/worker-youtube`
- `workers/worker-sh-copy`
- `workers/worker-sh-video`

## Audit Findings

### 1. `client1` API surface is now BFF-first

In `apps/client-przemyslawfilipiak/src/pages/api`:

- total route files: `98`
- route files with direct DB imports: `0`
- local-backend ratio: `0%`

Implication:

- the `client1` workspace extraction is complete
- `client1` is now BFF-first across its API surface
- DB-backed backend logic has been centralized into `apps/api`

### 2. Remaining process-local job flows

Current count in `apps/client-przemyslawfilipiak/src/pages/api`:

- local singleton job wrappers: `0`

What is better than before:

- `Social Hub` no longer relies on local `shCopywriterJob` for the main copy stream path
- `briefs/[id]/stream.ts` now polls central job status instead of consuming a local event emitter
- `geo`, `reddit` and `youtube` start/status/stream routes now run through central jobs
- `Social Hub` residual utility routes now proxy to `apps/api`
- `Brand Clarity` routes now use `apps/api` for CRUD, job enqueue, status and stream polling

### 3. Remaining SSR admin pages with direct DB access

Current count:

- admin pages still coupled to DB: `0`

State:

- remaining admin pages now fetch through local API/BFF routes instead of importing `@/db/*`

### 4. Worker split is operational, but not fully physical

Actual code supports two layers at once:

- a shared queue consumer in `workers/runner`
- thin dedicated worker workspaces that invoke the same runner with different topics

Current topic reality:

- `worker-general`
  - `geo`, `draft`, `reddit`, `youtube`, `sh-publish`
- `worker-bc`
  - `bc-scrape`, `bc-parse`, `bc-selector`, `bc-cluster`, `bc-generate`
- `worker-sh-copy`
  - `sh-copy`
- `worker-sh-video`
  - `sh-video`

Implication:

- BC topic ownership is now explicit and disjoint
- `worker-general` no longer duplicates any `bc-*` consumption

### 5. Dead bootstrap artifacts were present

The repo still had bootstrap leftovers that should not be treated as runtime truth:

- `scripts/monorepo/api-server.mjs`
- `scripts/monorepo/worker-runner.mjs`

### 6. Generated runtime artifacts are cleaned out

Current repo hygiene state:

- no `dist` directories remain under `apps/*` or `workers/*`
- no `.astro` cache directory remains under `apps/client-przemyslawfilipiak`
- working tree changes are now source and documentation changes only

### 7. Social Hub tenantization is complete

Current tenantization state:

- all `sh_*` tables have `site_id`
- existing Social Hub rows are backfilled through `migrations/0009_social_hub_site_scope.sql`
- active Social Hub API routes resolve `siteSlug` and scope reads and writes by site
- worker-executed `sh-copy`, `sh-video` and `sh-publish` jobs now receive `SITE_ID`
- tenant-local template uniqueness is enforced by `(site_id, slug)`

## Verdict

The monorepo split is structurally real and deployable.

The runtime split and `client1` backend cutoff are complete.

The correct statement today is:

- runtime split: done
- deployment split: done
- documentation split: done
- `client1` backend split: done
- legacy execution cleanup inside `client1`: done
- worker topic ownership cleanup: done
- generated-artifact cleanup: done
- Social Hub tenantization: done
- architecture program: done
