# Cloudflare Native Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate FrinterHero end-to-end to a Cloudflare-native architecture with one shared backend, three tenant surfaces, one shared PostgreSQL database, Cloudflare Queues/Workflows/R2 for async and assets, and a production-ready cutover path that preserves current tenant and data invariants.

**Architecture:** The migration keeps the approved system shape: one backend, three tenants, one shared Postgres. Implementation proceeds in ordered slices: Cloudflare runtime foundation, shared DB/runtime seams, tenant app migration, full async pipeline migration for all current job topics, R2 storage migration, observability and env hardening, production validation, and final cutover preparation. The Node/Railway paths remain temporarily as fallback until Cloudflare parity is verified.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Hyperdrive, Queues, Workflows, R2, Astro, Drizzle ORM, node:test, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-03-27-cloudflare-native-migration-design.md`

## Execution Status

Completed before plan execution:

- `Task 0`: `f68b960` - restore TypeScript baseline for `includeSiteSlug`

Completed implementation tasks:

- `Task 1`: `ebbc081`, `8c3f386`
- `Task 2`: `1003185`
- `Task 3`: `6a619ec`, `b3ca2b1`
- `Task 4`: `a1c80b7`, `dd75c39`
- `Task 5`: `8fee0d6`, `95197e1`, `20446f5`
- `Task 6`: `c20058e`, `1bfe858`, `6a9ccdc`, `e6b0fe5`
- `Task 7`: `24d67ea`, `497df3a`, `31fc6a9`
- `Task 8`: `bad2464`, `497e5a2`
- `Task 9`: `64f5c2a`, `c2c2633`
- `Task 10`: `4ec2b8d`
- `Task 11`: `62460cf`
- `Task 12`: `11c7112`
- `Task 13`: `0d21755`
- `Task 14`: (this commit)

Current stop point:

- `Task 15` is next: production-readiness checklist before cutover

---

## File Structure

### Shared Cloudflare runtime and contracts

```text
apps/api/
  wrangler.jsonc
  src/cloudflare/
    index.ts
    env.ts
    env.test.ts
    router.ts
    router.test.ts
    tenant.ts
    tenant.test.ts
    jobs/
      enqueue.ts
      status.ts
      results.ts
    queues/
      index.ts
      index.test.ts
    workflows/
      geo-run.ts
      reddit-run.ts
      youtube-run.ts
      bc-scrape.ts
      bc-parse.ts
      bc-selector.ts
      bc-cluster.ts
      bc-generate.ts
      sh-copy.ts
      sh-video.ts
      sh-publish.ts
      *.test.ts
```

### Shared DB/runtime seams

```text
src/db/
  client.ts
  client.node.ts
  client.cloudflare.ts
  runtime.ts
  runtime.test.ts

src/lib/cloudflare/
  bindings.ts
  bindings.test.ts
  job-payloads.ts
  job-payloads.test.ts
  storage.ts
  storage.test.ts
  workflow-results.ts
  workflow-results.test.ts
```

### Migrated execution modules

```text
src/lib/jobs/
  geo.ts
  geo.test.ts
  reddit.ts
  reddit.test.ts
  youtube.ts
  youtube.test.ts
  bc-scrape.ts
  bc-scrape.test.ts
  bc-parse.ts
  bc-parse.test.ts
  bc-selector.ts
  bc-selector.test.ts
  bc-cluster.ts
  bc-cluster.test.ts
  bc-generate.ts
  bc-generate.test.ts
  sh-copy.ts
  sh-copy.test.ts
  sh-video.ts
  sh-video.test.ts
  sh-publish.ts
  sh-publish.test.ts
```

### Tenant app migration files

```text
apps/client-przemyslawfilipiak/astro.config.mjs
apps/client-focusequalsfreedom/astro.config.mjs
apps/client-frinter/astro.config.mjs
apps/client-przemyslawfilipiak/src/middleware.ts
apps/client-focusequalsfreedom/src/middleware.ts
apps/client-frinter/src/middleware.ts
apps/client-przemyslawfilipiak/src/pages/api/**/*.ts
apps/client-focusequalsfreedom/src/pages/api/**/*.ts
apps/client-frinter/src/pages/api/**/*.ts
```

### Infra and docs

```text
package.json
infra/cloudflare/README.md
infra/cloudflare/env/api.env.example
infra/cloudflare/env/client.env.example
docs/architecture/current-architecture-reference.md
docs/deployment/cloudflare-native-migration-runbook.md
docs/superpowers/plans/2026-03-27-cloudflare-native-full-migration.md
```

## Task 1: Scaffold the shared Cloudflare API runtime

**Files:**
- Create: `apps/api/wrangler.jsonc`
- Create: `apps/api/src/cloudflare/env.ts`
- Create: `apps/api/src/cloudflare/env.test.ts`
- Create: `apps/api/src/cloudflare/index.ts`
- Create: `apps/api/src/cloudflare/router.ts`
- Create: `apps/api/src/cloudflare/router.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Create: `infra/cloudflare/README.md`
- Create: `infra/cloudflare/env/api.env.example`

- [ ] **Step 1: Write the failing env test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiEnv } from './env.ts';

test('readApiEnv requires Cloudflare bindings', () => {
  assert.throws(() => readApiEnv({}), /HYPERDRIVE|JOB_QUEUE|ASSETS_BUCKET/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/src/cloudflare/env.test.ts`
Expected: FAIL because `env.ts` does not exist.

- [ ] **Step 3: Write minimal env and Worker entrypoint**

Create:
- `apps/api/src/cloudflare/env.ts`
- `apps/api/src/cloudflare/index.ts`
- `apps/api/src/cloudflare/router.ts`

Minimum behavior:
- validate bindings
- implement `GET /health`
- return JSON `404` for unknown routes

- [ ] **Step 4: Add Wrangler config and package scripts**

Update:
- `apps/api/wrangler.jsonc`
- `apps/api/package.json`
- root `package.json`

Add scripts:
- `dev:api:cf`
- `deploy:api:cf`
- `test:api:cf`

- [ ] **Step 5: Run tests**

Run: `node --test apps/api/src/cloudflare/env.test.ts apps/api/src/cloudflare/router.test.ts`
Expected: PASS

- [ ] **Step 6: Verify Wrangler config**

Run: `npx wrangler deploy --dry-run`
Expected: config parses without schema errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/wrangler.jsonc apps/api/src/cloudflare apps/api/package.json package.json package-lock.json infra/cloudflare/README.md infra/cloudflare/env/api.env.example
git commit -m "chore: scaffold shared cloudflare api runtime"
```

## Task 2: Split DB access into Node and Cloudflare adapters

**Files:**
- Create: `src/db/client.node.ts`
- Create: `src/db/client.cloudflare.ts`
- Create: `src/db/runtime.ts`
- Create: `src/db/runtime.test.ts`
- Modify: `src/db/client.ts`

- [ ] **Step 1: Write the failing runtime-selection test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDbRuntime } from './runtime.ts';

test('selectDbRuntime defaults to node and allows cloudflare override', () => {
  assert.equal(selectDbRuntime({}), 'node');
  assert.equal(selectDbRuntime({ CF_PAGES: '1' }), 'cloudflare');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/db/runtime.test.ts`
Expected: FAIL because `runtime.ts` does not exist

- [ ] **Step 3: Move current implementation into `client.node.ts`**

Copy the existing `src/db/client.ts` implementation into `src/db/client.node.ts`.

- [ ] **Step 4: Add Cloudflare seam**

Create `src/db/client.cloudflare.ts` with explicit init/get functions for a Hyperdrive-backed Drizzle instance.

- [ ] **Step 5: Re-export stable API from `src/db/client.ts`**

Keep existing Node imports working while exposing the Cloudflare accessor for new runtime code.

- [ ] **Step 6: Run tests and typecheck**

Run:
- `node --test src/db/runtime.test.ts`
- `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/client.ts src/db/client.node.ts src/db/client.cloudflare.ts src/db/runtime.ts src/db/runtime.test.ts
git commit -m "refactor: split db adapters for node and cloudflare"
```

## Task 3: Add shared tenant, queue, workflow, and storage contracts

**Files:**
- Create: `apps/api/src/cloudflare/tenant.ts`
- Create: `apps/api/src/cloudflare/tenant.test.ts`
- Create: `src/lib/cloudflare/bindings.ts`
- Create: `src/lib/cloudflare/bindings.test.ts`
- Create: `src/lib/cloudflare/job-payloads.ts`
- Create: `src/lib/cloudflare/job-payloads.test.ts`
- Create: `src/lib/cloudflare/storage.ts`
- Create: `src/lib/cloudflare/storage.test.ts`
- Create: `src/lib/cloudflare/workflow-results.ts`
- Create: `src/lib/cloudflare/workflow-results.test.ts`

- [ ] **Step 1: Write the failing tenant test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantRequest } from '../../../apps/api/src/cloudflare/tenant.ts';

test('resolveTenantRequest maps frinter host to frinter site slug', () => {
  const result = resolveTenantRequest(new URL('https://frinter.pl/admin'), {
    FRINTER_HOST: 'frinter.pl',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });
  assert.equal(result.siteSlug, 'frinter');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `node --test apps/api/src/cloudflare/tenant.test.ts`
- `node --test src/lib/cloudflare/job-payloads.test.ts`

Expected: FAIL because modules do not exist

- [ ] **Step 3: Implement shared contracts**

Add:
- hostname-to-tenant mapping
- queue payload builders carrying explicit `siteId` and `siteSlug`
- R2 object-key builder
- workflow result helpers for standardized job result payloads

- [ ] **Step 4: Run focused tests**

Run:
- `node --test apps/api/src/cloudflare/tenant.test.ts`
- `node --test src/lib/cloudflare/*.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/tenant.ts apps/api/src/cloudflare/tenant.test.ts src/lib/cloudflare
git commit -m "feat: add cloudflare tenant and payload contracts"
```

## Task 4: Port HTTP job ingress and status reads into the Worker runtime

**Files:**
- Create: `apps/api/src/cloudflare/jobs/enqueue.ts`
- Create: `apps/api/src/cloudflare/jobs/status.ts`
- Create: `apps/api/src/cloudflare/jobs/results.ts`
- Modify: `apps/api/src/cloudflare/router.ts`

- [ ] **Step 1: Write failing queue-dispatch tests**

Create tests covering:
- `POST /jobs/geo`
- `POST /jobs/reddit`
- `POST /jobs/youtube`
- `GET /jobs/:id`

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test apps/api/src/cloudflare/router.test.ts`
Expected: FAIL because job routes are not implemented

- [ ] **Step 3: Implement enqueue handlers**

Implement request handlers that:
- create `app_jobs` rows
- validate tenant context
- publish queue payloads to `JOB_QUEUE`
- return `202 Accepted`

- [ ] **Step 4: Implement status/result readers**

Support Worker-side reads of:
- job status
- job result
- job progress

- [ ] **Step 5: Run focused tests**

Run: `node --test apps/api/src/cloudflare/router.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/jobs apps/api/src/cloudflare/router.ts apps/api/src/cloudflare/router.test.ts
git commit -m "feat: add worker job ingress and status routes"
```

## Task 5: Extract all current runtime job logic out of `scripts/*` into reusable modules

**Files:**
- Create: `src/lib/jobs/geo.ts`
- Create: `src/lib/jobs/reddit.ts`
- Create: `src/lib/jobs/youtube.ts`
- Create: `src/lib/jobs/bc-scrape.ts`
- Create: `src/lib/jobs/bc-parse.ts`
- Create: `src/lib/jobs/bc-selector.ts`
- Create: `src/lib/jobs/bc-cluster.ts`
- Create: `src/lib/jobs/bc-generate.ts`
- Create: `src/lib/jobs/sh-copy.ts`
- Create: `src/lib/jobs/sh-video.ts`
- Create: `src/lib/jobs/sh-publish.ts`
- Create: matching `*.test.ts`
- Modify: `scripts/geo-monitor.ts`
- Modify: `scripts/reddit-scraper.ts`
- Modify: `scripts/yt-scraper.ts`
- Modify: `scripts/bc-scraper.ts`
- Modify: `scripts/bc-lp-parser.ts`
- Modify: `scripts/bc-pain-selector.ts`
- Modify: `scripts/bc-pain-clusterer.ts`
- Modify: `scripts/bc-lp-generator.ts`
- Modify: `scripts/sh-copywriter.ts`
- Modify: `scripts/sh-video-render.ts`
- Modify: `scripts/sh-publish.ts`

- [ ] **Step 1: Write one failing extraction test per job family**

Examples:
- `src/lib/jobs/geo.test.ts`
- `src/lib/jobs/reddit.test.ts`
- `src/lib/jobs/bc-scrape.test.ts`
- `src/lib/jobs/sh-copy.test.ts`

Each test should assert that the extracted module accepts typed inputs and returns structured result objects.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/jobs/*.test.ts`
Expected: FAIL because modules do not exist

- [ ] **Step 3: Extract minimal job modules**

Move core business logic from each script into reusable functions in `src/lib/jobs/*`.

Rule:
- CLI/env parsing remains in `scripts/*`
- business execution moves to `src/lib/jobs/*`

- [ ] **Step 4: Update existing scripts to become thin wrappers**

Each script should:
- parse env/args
- call the extracted module
- print only the required markers/metrics

- [ ] **Step 5: Run tests and smoke checks**

Run:
- `node --test src/lib/jobs/*.test.ts`
- `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs scripts/geo-monitor.ts scripts/reddit-scraper.ts scripts/yt-scraper.ts scripts/bc-scraper.ts scripts/bc-lp-parser.ts scripts/bc-pain-selector.ts scripts/bc-pain-clusterer.ts scripts/bc-lp-generator.ts scripts/sh-copywriter.ts scripts/sh-video-render.ts scripts/sh-publish.ts
git commit -m "refactor: extract runtime job modules from scripts"
```

## Task 6: Implement Cloudflare queue consumer dispatch for all supported topics

**Files:**
- Create: `apps/api/src/cloudflare/queues/index.ts`
- Create: `apps/api/src/cloudflare/queues/index.test.ts`

- [ ] **Step 1: Write failing dispatch test**

Cover topics:
- `geo`
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

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/src/cloudflare/queues/index.test.ts`
Expected: FAIL because consumer dispatch does not exist

- [ ] **Step 3: Implement dispatch**

Queue consumer should:
- parse `JobQueueMessage`
- route each topic to the correct workflow starter
- reject unsupported topics loudly

- [ ] **Step 4: Run focused tests**

Run: `node --test apps/api/src/cloudflare/queues/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/queues
git commit -m "feat: add queue dispatch for all workflow topics"
```

## Task 7: Implement Cloudflare workflows for GEO, Reddit, and YouTube

**Files:**
- Create: `apps/api/src/cloudflare/workflows/geo-run.ts`
- Create: `apps/api/src/cloudflare/workflows/reddit-run.ts`
- Create: `apps/api/src/cloudflare/workflows/youtube-run.ts`
- Create: matching `*.test.ts`
- Modify: `apps/api/wrangler.jsonc`

- [ ] **Step 1: Write failing workflow tests**

Each workflow test should assert the step contract:
- `reserve`
- `execute`
- `finalize`

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test apps/api/src/cloudflare/workflows/geo-run.test.ts apps/api/src/cloudflare/workflows/reddit-run.test.ts apps/api/src/cloudflare/workflows/youtube-run.test.ts`
Expected: FAIL because files do not exist

- [ ] **Step 3: Implement workflows**

Each workflow should:
- load the job row
- execute the extracted module from `src/lib/jobs/*`
- persist structured result and status back to `app_jobs`

- [ ] **Step 4: Register bindings**

Update `wrangler.jsonc` for all three workflows and their queue starts.

- [ ] **Step 5: Run tests**

Run:
- `node --test apps/api/src/cloudflare/workflows/geo-run.test.ts apps/api/src/cloudflare/workflows/reddit-run.test.ts apps/api/src/cloudflare/workflows/youtube-run.test.ts`
- `npm run test:api:cf`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/workflows apps/api/wrangler.jsonc
git commit -m "feat: add cloudflare workflows for geo reddit and youtube"
```

## Task 8: Implement Cloudflare workflows for Brand Clarity

**Files:**
- Create: `apps/api/src/cloudflare/workflows/bc-scrape.ts`
- Create: `apps/api/src/cloudflare/workflows/bc-parse.ts`
- Create: `apps/api/src/cloudflare/workflows/bc-selector.ts`
- Create: `apps/api/src/cloudflare/workflows/bc-cluster.ts`
- Create: `apps/api/src/cloudflare/workflows/bc-generate.ts`
- Create: matching `*.test.ts`
- Modify: `apps/api/wrangler.jsonc`

- [ ] **Step 1: Write failing workflow tests**

One test file per Brand Clarity topic.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test apps/api/src/cloudflare/workflows/bc-*.test.ts`
Expected: FAIL because workflow files do not exist

- [ ] **Step 3: Implement workflows**

Each workflow should:
- load the required project/iteration/job context
- call the extracted Brand Clarity execution module
- persist result metrics and status

- [ ] **Step 4: Register bindings**

Update `wrangler.jsonc` with all Brand Clarity workflow definitions.

- [ ] **Step 5: Run focused tests**

Run:
- `node --test apps/api/src/cloudflare/workflows/bc-*.test.ts`
- `npm run test:api:cf`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/workflows apps/api/wrangler.jsonc
git commit -m "feat: add cloudflare brand clarity workflows"
```

## Task 9: Implement Cloudflare workflows for Social Hub

**Files:**
- Create: `apps/api/src/cloudflare/workflows/sh-copy.ts`
- Create: `apps/api/src/cloudflare/workflows/sh-video.ts`
- Create: `apps/api/src/cloudflare/workflows/sh-publish.ts`
- Create: matching `*.test.ts`
- Modify: `apps/api/wrangler.jsonc`

- [ ] **Step 1: Write failing workflow tests**

One test file per Social Hub topic.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test apps/api/src/cloudflare/workflows/sh-*.test.ts`
Expected: FAIL because workflow files do not exist

- [ ] **Step 3: Implement workflows**

Each workflow should:
- load brief/copy/publish context
- call the extracted Social Hub module
- persist queue/job/publish state
- store external render/publish artifacts through the storage seam where needed

- [ ] **Step 4: Register bindings**

Update `wrangler.jsonc` with all Social Hub workflow definitions.

- [ ] **Step 5: Run focused tests**

Run:
- `node --test apps/api/src/cloudflare/workflows/sh-*.test.ts`
- `npm run test:api:cf`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/workflows apps/api/wrangler.jsonc
git commit -m "feat: add cloudflare social hub workflows"
```

## Task 10: Add R2-backed storage for generated artifacts

**Files:**
- Modify: `src/lib/cloudflare/storage.ts`
- Modify: `src/lib/sh-video-gen.ts`
- Modify: `src/lib/sh-image-gen.ts`
- Modify: `src/lib/jobs/sh-video.ts`
- Modify: `src/lib/jobs/bc-generate.ts`
- Modify: `src/lib/jobs/sh-publish.ts`

- [ ] **Step 1: Write failing storage tests**

Add tests asserting:
- deterministic object keys
- artifact metadata shape
- upload result mapping to persisted DB references

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/cloudflare/storage.test.ts`
Expected: FAIL until upload/reference logic exists

- [ ] **Step 3: Implement storage seam**

Add:
- `putArtifact`
- `getArtifactUrl`
- metadata mapping for DB persistence

- [ ] **Step 4: Update artifact-producing modules**

Use the storage seam in:
- Social Hub video/image generation
- Brand Clarity generated assets where relevant
- publish/export paths

- [ ] **Step 5: Run tests and typecheck**

Run:
- `node --test src/lib/cloudflare/storage.test.ts`
- `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloudflare/storage.ts src/lib/sh-video-gen.ts src/lib/sh-image-gen.ts src/lib/jobs/sh-video.ts src/lib/jobs/bc-generate.ts src/lib/jobs/sh-publish.ts
git commit -m "feat: add r2-backed artifact storage"
```

## Task 11: Switch all three tenant clients to Cloudflare runtime

**Files:**
- Modify: `apps/client-przemyslawfilipiak/astro.config.mjs`
- Modify: `apps/client-focusequalsfreedom/astro.config.mjs`
- Modify: `apps/client-frinter/astro.config.mjs`
- Modify: `apps/client-przemyslawfilipiak/src/middleware.ts`
- Modify: `apps/client-focusequalsfreedom/src/middleware.ts`
- Modify: `apps/client-frinter/src/middleware.ts`
- Modify: `apps/client-przemyslawfilipiak/src/pages/api/**/*.ts`
- Modify: `apps/client-focusequalsfreedom/src/pages/api/**/*.ts`
- Modify: `apps/client-frinter/src/pages/api/**/*.ts`

- [ ] **Step 1: Write failing build expectation**

Use existing build commands as the failure signal for Node-only runtime assumptions.

Run:
- `npm run build:client1`
- `npm run build:client2`
- `npm run build:client3`

Expected: at least one build reveals Node adapter assumptions after Cloudflare adapter switch.

- [ ] **Step 2: Switch Astro adapters**

Replace `@astrojs/node` with `@astrojs/cloudflare` in all three clients while preserving aliases and tenant constants.

- [ ] **Step 3: Update middleware and API forwarding**

Make all tenant request forwarding target the shared Worker backend and preserve:
- cookies
- auth headers
- `siteSlug`
- tenant hostname context

- [ ] **Step 4: Remove any remaining direct DB/runtime assumptions from client API paths**

Ensure client-side API/BFF routes are forwarding shells only.

- [ ] **Step 5: Run builds**

Run:
- `npm run build:client1`
- `npm run build:client2`
- `npm run build:client3`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/client-przemyslawfilipiak apps/client-focusequalsfreedom apps/client-frinter
git commit -m "feat: switch all tenant clients to cloudflare runtime"
```

## Task 12: Migrate the remaining API route parity into the Worker runtime

**Files:**
- Modify: `apps/api/src/cloudflare/router.ts`
- Create/Modify: `apps/api/src/cloudflare/routes/*.ts`
- Add matching test files under `apps/api/src/cloudflare/**/*.test.ts`

- [ ] **Step 1: Write failing parity tests**

Add route tests covering the current top-level route families:
- `auth`
- `admin`
- `articles`
- `brand-clarity`
- `content-gaps`
- `geo`
- `jobs`
- `knowledge`
- `reddit`
- `sites`
- `social-hub`
- `youtube`
- `yolo`

- [ ] **Step 2: Run tests to verify missing parity**

Run: `npm run test:api:cf`
Expected: FAIL because only partial route coverage exists

- [ ] **Step 3: Port route families into Worker-compatible handlers**

Implement route modules that reuse existing shared business logic and avoid Node `IncomingMessage` / `ServerResponse`.

- [ ] **Step 4: Run Worker tests**

Run: `npm run test:api:cf`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare
git commit -m "feat: complete api route parity in cloudflare worker"
```

## Task 13: Add Cloudflare env documentation, observability, and runbook

**Files:**
- Create: `infra/cloudflare/env/client.env.example`
- Create: `docs/deployment/cloudflare-native-migration-runbook.md`
- Modify: `infra/cloudflare/README.md`
- Modify: `apps/api/src/cloudflare/index.ts`

- [ ] **Step 1: Write the failing observability expectation**

Add a Worker test expecting request logs or structured error payloads from the Worker entrypoint.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/api/src/cloudflare/router.test.ts`
Expected: FAIL until structured error handling/observability is added

- [ ] **Step 3: Implement runtime observability**

Add:
- structured request logging
- queue/workflow error logging
- environment docs for required bindings/secrets
- cutover/runback operational notes

- [ ] **Step 4: Run tests**

Run:
- `npm run test:api:cf`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add infra/cloudflare docs/deployment/cloudflare-native-migration-runbook.md apps/api/src/cloudflare/index.ts
git commit -m "docs: add cloudflare env and migration runbook"
```

## Task 14: Full verification and architecture documentation update

**Files:**
- Modify: `docs/architecture/current-architecture-reference.md`
- Modify: `docs/superpowers/plans/2026-03-27-cloudflare-native-full-migration.md`

- [ ] **Step 1: Update architecture reference**

Rewrite the runtime topology to show:
- shared Cloudflare Worker backend
- Hyperdrive to PostgreSQL
- Queue -> Workflow execution paths
- R2 artifact storage
- three tenant surfaces on Cloudflare

- [ ] **Step 2: Run the full verification suite**

Run:
- `node --test apps/api/src/cloudflare/*.test.ts apps/api/src/cloudflare/**/*.test.ts src/db/*.test.ts src/lib/cloudflare/*.test.ts src/lib/jobs/*.test.ts`
- `npx tsc --noEmit`
- `npm run build:api`
- `npm run build:client1`
- `npm run build:client2`
- `npm run build:client3`
- `npm run build:workers`
- `npx wrangler deploy --dry-run`

Expected:
- all focused tests PASS
- typecheck PASS
- all builds PASS
- Wrangler dry run PASS

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/current-architecture-reference.md docs/superpowers/plans/2026-03-27-cloudflare-native-full-migration.md
git commit -m "docs: finalize cloudflare native migration plan and architecture"
```

## Task 15: Production-readiness checklist before cutover

**Files:**
- Modify: `docs/deployment/cloudflare-native-migration-runbook.md`

- [ ] **Step 1: Verify binding inventory**

Confirm the runbook lists:
- Hyperdrive binding
- Queue bindings
- Workflow bindings
- R2 bucket bindings
- per-environment hostnames
- required secrets

- [ ] **Step 2: Verify rollback path**

Document:
- how to revert traffic to the old runtime
- which Node/Railway services must remain alive during cutover
- which verification endpoints to check before and after switch

- [ ] **Step 3: Add final checklist**

Include:
- tenant hostname validation
- auth smoke checks
- job enqueue smoke checks
- workflow completion smoke checks
- artifact upload smoke checks
- admin route smoke checks

- [ ] **Step 4: Commit**

```bash
git add docs/deployment/cloudflare-native-migration-runbook.md
git commit -m "docs: add cutover readiness checklist for cloudflare migration"
```

## Execution Notes

- Keep the existing Node `apps/api/src/server.ts` path working until the Worker runtime is validated in staging.
- Do not switch PostgreSQL providers in this plan. Railway remains the active DB provider until Cloudflare parity is complete.
- Preserve `siteId` and `siteSlug` in every HTTP, queue, workflow, and storage boundary.
- Do not redesign the domain schema during migration.
- Treat `scripts/*` as temporary compatibility wrappers once extracted job modules exist.
- Durable Objects remain optional and should only be introduced if a concrete coordination case appears during implementation.
