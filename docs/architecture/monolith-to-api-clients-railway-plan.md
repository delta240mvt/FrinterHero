# Plan rozbicia monolitu na API + 3 klienty pod Railway

This is the current architecture document after the workspace cutover of `client1`.

## 1. Goal

The target architecture is:

- one central backend in `apps/api`
- three client runtimes:
  - `apps/client-przemyslawfilipiak`
  - `apps/client-focusequalsfreedom`
  - `apps/client-frinter`
- queue-backed workers in `workers/*`
- Railway deployment from one monorepo

## 2. Current status

The split is structurally real now.

What changed compared to the old monolith:

- root is no longer the Astro application
- `client1` now lives in `apps/client-przemyslawfilipiak`
- `client2` and `client3` are separate BFF runtimes
- `apps/api` is the central service entrypoint
- Railway templates exist for API, clients, workers and migrate

What still remains as follow-up:

- no architecture-blocking split work remains
- future work is now product/domain evolution, not monorepo decomposition

## 3. Repo shape

Current repo shape:

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
infra/
  railway/
docs/
```

Root `src/` is now shared backend and domain code only:

- `src/db`
- `src/lib`
- `src/utils`

## 4. Architectural rules

1. `apps/api` is the only service that should be treated as the database-backed public backend.
2. Clients should become API-first shells, not alternate backend implementations.
3. Long-running execution must not depend on local process RAM, `globalThis` or local `EventEmitter` state.
4. Site-aware behavior should flow from `sites` and `SITE_SLUG`, not hardcoded branding in shared backend code.
5. Docs must describe the real runtime paths, not historical root `src/pages/*` paths.

## 5. What is already working

### `client1` workspace extraction

Done:

- pages, components, styles and public assets moved into `apps/client-przemyslawfilipiak`
- root `package.json` now starts the workspace app
- root is no longer the hidden web runtime

### Central API and workers

Done:

- `apps/api` serves as central HTTP backend
- `worker-general`, `worker-bc`, `worker-sh-copy`, `worker-sh-video` are deployable service targets
- topic ownership is disjoint, with `worker-bc` as the sole owner of `bc-*`
- queue topics exist for:
  - `geo`
  - `draft`
  - `reddit`
  - `youtube`
  - `bc-scrape`
  - `bc-parse`
  - `bc-selector`
  - `bc-cluster`
  - `bc-generate`
  - `sh-copy`
  - `sh-video`
  - `sh-publish`

### Admin/API-first progress

Already decoupled from direct SSR DB access:

- key Reddit admin pages
- key YouTube admin pages
- key Brand Clarity execution pages
- key Social Hub admin pages

## 6. What is still incomplete

### `client1` API is now a thin BFF

As of `2026-03-19`:

- `98` route files exist in `apps/client-przemyslawfilipiak/src/pages/api`
- `0` import DB directly

### Remaining local job orchestration

Still process-local in `client1` route layer:

- none

### Remaining DB-coupled SSR pages

Still coupled:

- none

### Social Hub tenantization

Done:

- all `sh_*` tables are now site-scoped
- API routes, helper libs and workers propagate `siteSlug` and `siteId`
- template uniqueness is tenant-aware via `(site_id, slug)`

## 7. Deployment model

Recommended active Railway service set:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-general`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`
- `migrate`
- `postgres`

Optional dedicated workers later:

- `worker-reddit`
- `worker-youtube`
- `worker-geo-drafts`

## 8. Honest status statement

The correct statement for this repository today is:

- monorepo architecture: done
- workspace extraction of `client1`: done
- distributed deployment topology: done
- full backend decomposition of `client1`: done
- legacy execution cleanup in `client1`: done
- Social Hub tenantization: done
- documentation alignment: done as of this update
