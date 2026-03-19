# API + Clients Split - Implementation Order

This document tracks the actual execution order after the `client1` cutover into `apps/client-przemyslawfilipiak`.

## 1. Current truth

Already done:

- root is no longer the Astro app
- `client1` is a real Astro workspace app
- `client2` and `client3` run as BFF shells
- `apps/api` exists as the central HTTP backend
- queue workers exist and are deployable through Railway templates
- `Social Hub` active path is mostly API-first
- `Reddit`, `YouTube` and key `Brand Clarity` admin pages are already SSR-decoupled

Not done yet:

- no remaining architecture-critical split work is open

## 2. Recommended runtime shape

Distributed target:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-general`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`
- optional later:
  - `worker-reddit`
  - `worker-youtube`
  - `worker-geo-drafts`
- `migrate`
- `postgres`

Important nuance:

- dedicated worker workspaces are packaging/runtime split targets
- they still reuse `workers/runner/src/index.ts` today

## 3. Topic ownership

Current worker topic ownership:

- `worker-general`
  - `geo`
  - `draft`
  - `reddit`
  - `youtube`
  - `sh-publish`
- `worker-bc`
  - `bc-scrape`
  - `bc-parse`
  - `bc-selector`
  - `bc-cluster`
  - `bc-generate`
- `worker-sh-copy`
  - `sh-copy`
- `worker-sh-video`
  - `sh-video`

## 4. Remaining implementation order

### Track A - `client1` API decomposition

Completed state:

- `98` route files exist in `apps/client-przemyslawfilipiak/src/pages/api`
- `0` import DB directly
- `0` route files depend on local singleton execution wrappers
### Track B - admin SSR cleanup

Remaining DB-coupled Astro pages:

- none

Execution order:

1. keep SSR pages API-first
2. do not reintroduce `@/db/*` imports into `apps/client-przemyslawfilipiak/src/pages/admin`

### Track C - execution cleanup

Completed inside `client1` route layer:

- parse/scrape/select/generate wrappers moved behind central API
- streams and statuses poll central jobs

### Track D - Social Hub follow-up

Completed:

- `sh_*` tables are tenantized with `siteId`
- Social Hub BFF, API and workers now carry tenant context end-to-end
- seed/template paths are tenant-aware

## 5. Commands

Current root start commands:

```json
{
  "start:api": "npm --workspace apps/api run start",
  "start:client1": "npm --workspace apps/client-przemyslawfilipiak run start",
  "start:client2": "npm --workspace apps/client-focusequalsfreedom run start",
  "start:client3": "npm --workspace apps/client-frinter run start",
  "start:worker": "npm run start:worker:general",
  "start:worker:general": "npm --workspace workers/runner run start -- geo,draft,reddit,youtube,sh-publish",
  "start:worker:bc": "npm run start:worker:bc-scrape",
  "start:worker:bc-scrape": "npm --workspace workers/worker-bc run start",
  "start:worker:sh-copy": "npm --workspace workers/worker-sh-copy run start",
  "start:worker:sh-video": "npm --workspace workers/worker-sh-video run start"
}
```

## 6. Success criteria for saying the split is actually done

The split should only be described as complete when all of the following are true:

- `client1` API routes no longer import DB directly except for explicitly temporary compatibility routes
- no production-critical route depends on local `EventEmitter`, process RAM snapshot or `globalThis` singleton state
- admin pages remain API-first
- active docs no longer describe root `src/pages/*` as the runtime truth

These conditions are now satisfied for `client1`.

Additional completion state:

- `Social Hub` tenantization is now satisfied as well
- the architecture program is complete
