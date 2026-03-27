# Cloudflare Native Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the shared Cloudflare-native foundation for FrinterHero: one Worker app/backend for all three tenants, Hyperdrive-ready database access, queue/workflow infrastructure, R2 storage seam, and one verified async job slice running end-to-end against the existing shared PostgreSQL database.

**Architecture:** This plan deliberately covers the shared platform tranche first because the approved migration spec spans multiple independent subsystems. The work creates a Workers-compatible runtime seam inside `apps/api`, moves shared DB/runtime code behind explicit Node vs Cloudflare adapters, establishes queue/workflow/storage contracts, and migrates one real job path end-to-end to prove the architecture before module-by-module follow-up plans.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Hyperdrive, Queues, Workflows, R2, Astro, Drizzle ORM, node:test.

**Spec:** `docs/superpowers/specs/2026-03-27-cloudflare-native-migration-design.md`

---

## Scope Check

The approved spec covers multiple independent subsystems:

- shared request runtime
- tenant-aware frontend/runtime integration
- database/runtime compatibility
- async orchestration
- object storage
- module-specific migrations for Brand Clarity, GEO, Reddit, YouTube, Social Hub

That is too broad for a single execution plan that still produces working, testable software. This plan therefore covers the shared Cloudflare foundation plus one real async vertical slice. After this plan lands, write separate follow-up plans for:

- Brand Clarity workflows
- Reddit and YouTube workflows
- Social Hub render/publish workflows
- remaining tenant UI/admin cutover cleanup

## File Structure

### New Cloudflare runtime files

```text
apps/api/
  wrangler.jsonc                      — Worker config, bindings, queues, workflows, R2, Hyperdrive
  src/cloudflare/
    index.ts                          — Worker fetch entrypoint
    env.ts                            — typed Cloudflare bindings and runtime env parsing
    env.test.ts                       — node:test coverage for env parsing and binding validation
    router.ts                         — request router for Web Request/Response runtime
    router.test.ts                    — route-level tests for health, tenant resolution, and not-found handling
    tenant.ts                         — hostname/siteSlug resolution helpers
    tenant.test.ts                    — tenant mapping tests
    jobs/
      enqueue.ts                      — queue producer entrypoints from HTTP handlers
      status.ts                       — job status reads
    queues/
      index.ts                        — queue consumer dispatch
      index.test.ts                   — queue payload routing tests
    workflows/
      geo-run.ts                      — first real workflow slice
      geo-run.test.ts                 — workflow step contract tests
```

### Shared runtime-seam files

```text
src/db/
  client.ts                           — stable import surface re-exporting runtime-specific client accessors
  client.node.ts                      — existing pg/node-postgres implementation
  client.cloudflare.ts                — Hyperdrive/Workers-compatible implementation
  runtime.ts                          — runtime detection helpers kept minimal and explicit
  runtime.test.ts                     — node:test coverage for runtime selection logic

src/lib/cloudflare/
  bindings.ts                         — shared binding types used across app/runtime code
  job-payloads.ts                     — queue/workflow payload contracts
  job-payloads.test.ts                — payload validation tests
  storage.ts                          — R2 object key strategy + storage seam
  storage.test.ts                     — object key and metadata tests
```

### Client/runtime integration files

```text
apps/client-przemyslawfilipiak/astro.config.mjs   — Cloudflare adapter + backend binding config
apps/client-focusequalsfreedom/astro.config.mjs   — Cloudflare adapter + backend binding config
apps/client-frinter/astro.config.mjs              — Cloudflare adapter + backend binding config
apps/client-przemyslawfilipiak/src/middleware.ts  — tenant/backend request forwarding adjustments
apps/client-focusequalsfreedom/src/middleware.ts  — tenant/backend request forwarding adjustments
apps/client-frinter/src/middleware.ts             — tenant/backend request forwarding adjustments
```

### Infra/docs files

```text
package.json                          — workspace scripts for wrangler dev/deploy/test
infra/cloudflare/README.md            — environment and binding setup notes
infra/cloudflare/env/api.env.example  — Worker/Hyperdrive/R2 binding documentation
docs/architecture/current-architecture-reference.md — runtime topology update after foundation lands
```

## Task 1: Scaffold Cloudflare runtime and local dev commands

**Files:**
- Create: `apps/api/wrangler.jsonc`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Create: `infra/cloudflare/README.md`
- Create: `infra/cloudflare/env/api.env.example`

- [ ] **Step 1: Add failing config smoke test**

Create `apps/api/src/cloudflare/env.test.ts` with a minimal binding-shape assertion:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiEnv } from './env.ts';

test('readApiEnv requires app binding primitives', () => {
  assert.throws(() => readApiEnv({}), /API_BASE_URL|HYPERDRIVE/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test apps/api/src/cloudflare/env.test.ts
```

Expected: FAIL because `apps/api/src/cloudflare/env.ts` does not exist yet.

- [ ] **Step 3: Add Wrangler config and env parser**

Create `apps/api/wrangler.jsonc` with:

- Worker name for the shared backend
- `main` pointing at `src/cloudflare/index.ts`
- bindings stubs for `HYPERDRIVE`, `ASSETS_BUCKET`, `JOB_QUEUE`
- workflow binding for the first workflow
- local `vars` for `APP_ENV`, `API_BASE_URL`, and tenant hostnames

Create `apps/api/src/cloudflare/env.ts` with:

```ts
export interface ApiEnv {
  APP_ENV: string;
  API_BASE_URL: string;
  HYPERDRIVE: Hyperdrive;
  ASSETS_BUCKET: R2Bucket;
  JOB_QUEUE: Queue<unknown>;
}

export function readApiEnv(env: Partial<ApiEnv>): ApiEnv {
  if (!env.API_BASE_URL) throw new Error('API_BASE_URL is required');
  if (!env.HYPERDRIVE) throw new Error('HYPERDRIVE binding is required');
  if (!env.ASSETS_BUCKET) throw new Error('ASSETS_BUCKET binding is required');
  if (!env.JOB_QUEUE) throw new Error('JOB_QUEUE binding is required');
  return env as ApiEnv;
}
```

- [ ] **Step 4: Add workspace scripts**

Update `apps/api/package.json`:

```json
{
  "scripts": {
    "dev:cf": "wrangler dev",
    "deploy:cf": "wrangler deploy",
    "test:cf": "node --test src/cloudflare/*.test.ts src/cloudflare/**/*.test.ts"
  }
}
```

Update root `package.json`:

```json
{
  "scripts": {
    "dev:api:cf": "npm --workspace apps/api run dev:cf",
    "deploy:api:cf": "npm --workspace apps/api run deploy:cf",
    "test:api:cf": "npm --workspace apps/api run test:cf"
  },
  "devDependencies": {
    "wrangler": "...",
    "@cloudflare/workers-types": "..."
  }
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test apps/api/src/cloudflare/env.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify Wrangler config parses**

Run:

```bash
npx wrangler deploy --dry-run
```

Expected: Wrangler resolves `apps/api/wrangler.jsonc` without schema errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/wrangler.jsonc apps/api/package.json apps/api/src/cloudflare/env.ts apps/api/src/cloudflare/env.test.ts package.json package-lock.json infra/cloudflare/README.md infra/cloudflare/env/api.env.example
git commit -m "chore: scaffold cloudflare runtime for shared api"
```

## Task 2: Split shared DB access into explicit Node and Cloudflare adapters

**Files:**
- Create: `src/db/client.node.ts`
- Create: `src/db/client.cloudflare.ts`
- Modify: `src/db/client.ts`
- Create: `src/db/runtime.ts`
- Create: `src/db/runtime.test.ts`

- [ ] **Step 1: Write failing runtime-selection test**

Create `src/db/runtime.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDbRuntime } from './runtime.ts';

test('selectDbRuntime prefers explicit cloudflare runtime', () => {
  assert.equal(selectDbRuntime({ CF_PAGES: '1' }), 'cloudflare');
  assert.equal(selectDbRuntime({}), 'node');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/db/runtime.test.ts
```

Expected: FAIL because `src/db/runtime.ts` does not exist.

- [ ] **Step 3: Move the current implementation into `client.node.ts`**

Copy the existing contents of `src/db/client.ts` into `src/db/client.node.ts` and export:

```ts
export { getDb, db };
```

- [ ] **Step 4: Add runtime selector and Cloudflare adapter seam**

Create `src/db/runtime.ts`:

```ts
export function selectDbRuntime(env: Record<string, string | undefined>) {
  return env.CF_PAGES || env.CLOUDFLARE_ACCOUNT_ID || env.WORKERS_RS ? 'cloudflare' : 'node';
}
```

Create `src/db/client.cloudflare.ts` with a small seam that accepts an externally created Hyperdrive-backed connection:

```ts
import * as schema from './schema.js';

let cloudflareDb: unknown = null;

export function setCloudflareDb(instance: unknown) {
  cloudflareDb = instance;
}

export function getCloudflareDb() {
  if (!cloudflareDb) throw new Error('Cloudflare DB has not been initialised');
  return cloudflareDb;
}

export { schema };
```

Update `src/db/client.ts` to re-export the Node implementation for existing code and the Cloudflare seam for new Worker code:

```ts
export { db, getDb } from './client.node.js';
export { setCloudflareDb, getCloudflareDb } from './client.cloudflare.js';
export { selectDbRuntime } from './runtime.js';
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test src/db/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run typecheck on touched files**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS with no new DB runtime typing errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/client.ts src/db/client.node.ts src/db/client.cloudflare.ts src/db/runtime.ts src/db/runtime.test.ts
git commit -m "refactor: split db runtime adapters for node and cloudflare"
```

## Task 3: Build the Cloudflare Worker request shell and tenant resolution

**Files:**
- Create: `apps/api/src/cloudflare/index.ts`
- Create: `apps/api/src/cloudflare/router.ts`
- Create: `apps/api/src/cloudflare/router.test.ts`
- Create: `apps/api/src/cloudflare/tenant.ts`
- Create: `apps/api/src/cloudflare/tenant.test.ts`

- [ ] **Step 1: Write failing tenant-resolution test**

Create `apps/api/src/cloudflare/tenant.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantRequest } from './tenant.ts';

test('resolveTenantRequest maps hostnames to siteSlug', () => {
  const result = resolveTenantRequest(new URL('https://frinter.pl/admin'), {
    FRINTER_HOST: 'frinter.pl',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });
  assert.equal(result.siteSlug, 'frinter');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test apps/api/src/cloudflare/tenant.test.ts
```

Expected: FAIL because `tenant.ts` does not exist.

- [ ] **Step 3: Implement tenant helper**

Create `apps/api/src/cloudflare/tenant.ts`:

```ts
interface TenantEnv {
  FRINTER_HOST: string;
  FOCUS_HOST: string;
  PRZEM_HOST: string;
}

export function resolveTenantRequest(url: URL, env: TenantEnv) {
  const host = url.hostname.toLowerCase();
  if (host === env.FRINTER_HOST) return { siteSlug: 'frinter' as const, host };
  if (host === env.FOCUS_HOST) return { siteSlug: 'focusequalsfreedom' as const, host };
  if (host === env.PRZEM_HOST) return { siteSlug: 'przemyslawfilipiak' as const, host };
  return { siteSlug: null, host };
}
```

- [ ] **Step 4: Add Worker shell and health route**

Create `apps/api/src/cloudflare/router.ts` with a minimal Web Request router supporting:

- `GET /health`
- tenant resolution from host
- a `404` JSON response

Create `apps/api/src/cloudflare/index.ts`:

```ts
import { readApiEnv } from './env.js';
import { routeRequest } from './router.js';

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    return routeRequest(request, readApiEnv(env as any), ctx);
  },
};
```

- [ ] **Step 5: Add router test**

Create `apps/api/src/cloudflare/router.test.ts` that asserts:

- `/health` returns 200 with `service: "api"`
- unknown routes return 404 JSON
- tenant resolution injects the expected `siteSlug`

- [ ] **Step 6: Run the tests**

Run:

```bash
node --test apps/api/src/cloudflare/tenant.test.ts apps/api/src/cloudflare/router.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cloudflare/index.ts apps/api/src/cloudflare/router.ts apps/api/src/cloudflare/router.test.ts apps/api/src/cloudflare/tenant.ts apps/api/src/cloudflare/tenant.test.ts
git commit -m "feat: add cloudflare worker shell and tenant resolution"
```

## Task 4: Introduce shared queue, workflow, and storage contracts

**Files:**
- Create: `src/lib/cloudflare/bindings.ts`
- Create: `src/lib/cloudflare/job-payloads.ts`
- Create: `src/lib/cloudflare/job-payloads.test.ts`
- Create: `src/lib/cloudflare/storage.ts`
- Create: `src/lib/cloudflare/storage.test.ts`

- [ ] **Step 1: Write failing payload test**

Create `src/lib/cloudflare/job-payloads.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeoJobPayload } from './job-payloads.ts';

test('makeGeoJobPayload requires siteId and jobId', () => {
  assert.deepEqual(makeGeoJobPayload({ jobId: 7, siteId: 3 }), {
    topic: 'geo',
    jobId: 7,
    siteId: 3,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/lib/cloudflare/job-payloads.test.ts
```

Expected: FAIL because `job-payloads.ts` does not exist.

- [ ] **Step 3: Add binding and payload contracts**

Create `src/lib/cloudflare/bindings.ts` with:

```ts
export interface JobQueueMessage {
  topic: string;
  jobId: number;
  siteId: number | null;
}
```

Create `src/lib/cloudflare/job-payloads.ts` with explicit builders:

```ts
export function makeGeoJobPayload(input: { jobId: number; siteId: number | null }) {
  return { topic: 'geo', jobId: input.jobId, siteId: input.siteId };
}
```

- [ ] **Step 4: Add R2 storage seam**

Create `src/lib/cloudflare/storage.ts` with:

```ts
export function makeAssetKey(parts: {
  siteSlug: string;
  module: string;
  entityId: string | number;
  filename: string;
}) {
  return `${parts.siteSlug}/${parts.module}/${parts.entityId}/${parts.filename}`;
}
```

Add `src/lib/cloudflare/storage.test.ts` covering deterministic key generation.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
node --test src/lib/cloudflare/job-payloads.test.ts src/lib/cloudflare/storage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloudflare/bindings.ts src/lib/cloudflare/job-payloads.ts src/lib/cloudflare/job-payloads.test.ts src/lib/cloudflare/storage.ts src/lib/cloudflare/storage.test.ts
git commit -m "feat: add cloudflare queue and storage contracts"
```

## Task 5: Add HTTP-to-queue job enqueue path and Worker-side job status reads

**Files:**
- Create: `apps/api/src/cloudflare/jobs/enqueue.ts`
- Create: `apps/api/src/cloudflare/jobs/status.ts`
- Modify: `apps/api/src/cloudflare/router.ts`
- Create: `apps/api/src/cloudflare/queues/index.ts`
- Create: `apps/api/src/cloudflare/queues/index.test.ts`

- [ ] **Step 1: Write failing queue-dispatch test**

Create `apps/api/src/cloudflare/queues/index.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchQueueMessage } from './index.ts';

test('dispatchQueueMessage routes geo topic to geo workflow starter', async () => {
  const calls: string[] = [];
  await dispatchQueueMessage({ topic: 'geo', jobId: 7, siteId: 3 }, {
    startGeoRun: async (payload) => {
      calls.push(`${payload.topic}:${payload.jobId}`);
    },
  });
  assert.deepEqual(calls, ['geo:7']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test apps/api/src/cloudflare/queues/index.test.ts
```

Expected: FAIL because queue consumer module does not exist.

- [ ] **Step 3: Implement enqueue and status handlers**

Create `apps/api/src/cloudflare/jobs/enqueue.ts` with logic that:

- accepts a request to start a `geo` job
- writes an `app_jobs` row through the existing DB model
- publishes `makeGeoJobPayload({ jobId, siteId })` to `JOB_QUEUE`
- returns `202 Accepted` with the created job id

Create `apps/api/src/cloudflare/jobs/status.ts` with a read handler that:

- accepts `jobId`
- reads `app_jobs`
- returns current status/result JSON

- [ ] **Step 4: Implement queue dispatch**

Create `apps/api/src/cloudflare/queues/index.ts` with:

```ts
import type { JobQueueMessage } from '../../../../src/lib/cloudflare/bindings.js';

export async function dispatchQueueMessage(
  message: JobQueueMessage,
  deps: { startGeoRun: (payload: JobQueueMessage) => Promise<void> },
) {
  if (message.topic === 'geo') {
    await deps.startGeoRun(message);
    return;
  }
  throw new Error(`Unsupported queue topic: ${message.topic}`);
}
```

- [ ] **Step 5: Wire the router**

Update `apps/api/src/cloudflare/router.ts` to support:

- `POST /jobs/geo`
- `GET /jobs/:id`

for the Worker runtime.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
node --test apps/api/src/cloudflare/queues/index.test.ts apps/api/src/cloudflare/router.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cloudflare/jobs/enqueue.ts apps/api/src/cloudflare/jobs/status.ts apps/api/src/cloudflare/queues/index.ts apps/api/src/cloudflare/queues/index.test.ts apps/api/src/cloudflare/router.ts
git commit -m "feat: add worker job enqueue and queue dispatch path"
```

## Task 6: Implement the first real Cloudflare workflow slice for `geo`

**Files:**
- Create: `apps/api/src/cloudflare/workflows/geo-run.ts`
- Create: `apps/api/src/cloudflare/workflows/geo-run.test.ts`
- Modify: `apps/api/wrangler.jsonc`
- Modify: `apps/api/src/cloudflare/queues/index.ts`

- [ ] **Step 1: Write failing workflow contract test**

Create `apps/api/src/cloudflare/workflows/geo-run.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeoWorkflowSteps } from './geo-run.ts';

test('makeGeoWorkflowSteps exposes reserve, execute, and finalize steps', () => {
  const steps = makeGeoWorkflowSteps({} as never);
  assert.deepEqual(Object.keys(steps), ['reserve', 'execute', 'finalize']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test apps/api/src/cloudflare/workflows/geo-run.test.ts
```

Expected: FAIL because `geo-run.ts` does not exist.

- [ ] **Step 3: Implement workflow step module**

Create `apps/api/src/cloudflare/workflows/geo-run.ts` with three explicit steps:

- `reserve` loads and validates the `app_jobs` row
- `execute` runs the migrated `geo` execution module
- `finalize` updates `app_jobs` with success or error state

Use this shape:

```ts
export function makeGeoWorkflowSteps(deps: {
  loadJob: (jobId: number) => Promise<unknown>;
  runGeo: (jobId: number, siteId: number | null) => Promise<unknown>;
  finishJob: (jobId: number, result: unknown) => Promise<void>;
}) {
  return {
    reserve: async (payload: { jobId: number }) => deps.loadJob(payload.jobId),
    execute: async (payload: { jobId: number; siteId: number | null }) => deps.runGeo(payload.jobId, payload.siteId),
    finalize: async (payload: { jobId: number; result: unknown }) => deps.finishJob(payload.jobId, payload.result),
  };
}
```

- [ ] **Step 4: Register workflow binding**

Update `apps/api/wrangler.jsonc` to define the `geo-run` workflow and bind queue consumption to the workflow starter.

- [ ] **Step 5: Run the focused test**

Run:

```bash
node --test apps/api/src/cloudflare/workflows/geo-run.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the Worker smoke tests**

Run:

```bash
npm run test:api:cf
```

Expected: PASS, including workflow contract tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/cloudflare/workflows/geo-run.ts apps/api/src/cloudflare/workflows/geo-run.test.ts apps/api/wrangler.jsonc apps/api/src/cloudflare/queues/index.ts
git commit -m "feat: add cloudflare geo workflow slice"
```

## Task 7: Switch all three tenant clients to Cloudflare-compatible runtime config

**Files:**
- Modify: `apps/client-przemyslawfilipiak/astro.config.mjs`
- Modify: `apps/client-focusequalsfreedom/astro.config.mjs`
- Modify: `apps/client-frinter/astro.config.mjs`
- Modify: `apps/client-przemyslawfilipiak/src/middleware.ts`
- Modify: `apps/client-focusequalsfreedom/src/middleware.ts`
- Modify: `apps/client-frinter/src/middleware.ts`

- [ ] **Step 1: Write a failing config snapshot test**

Create `apps/api/src/cloudflare/router.test.ts` coverage for tenant hostnames reaching the shared backend from all three site slugs.

Add assertions for:

- `przemyslawfilipiak`
- `focusequalsfreedom`
- `frinter`

Expected behavior: each host resolves the correct `siteSlug`.

- [ ] **Step 2: Run the test to verify the missing host vars cause failure**

Run:

```bash
node --test apps/api/src/cloudflare/router.test.ts
```

Expected: FAIL until the client/runtime host vars are fully wired.

- [ ] **Step 3: Replace Node adapter usage in Astro configs**

Update all three `astro.config.mjs` files to switch from:

```js
import node from '@astrojs/node';
adapter: node({ mode: 'standalone' })
```

to the Cloudflare adapter:

```js
import cloudflare from '@astrojs/cloudflare';
adapter: cloudflare()
```

Keep the existing alias and `SITE_SLUG` definitions intact.

- [ ] **Step 4: Update middleware to forward to the shared Worker backend**

Adjust each client `src/middleware.ts` so that tenant-specific request forwarding and cookie propagation target the shared Worker backend origin instead of a Node-local backend assumption.

- [ ] **Step 5: Run focused builds**

Run:

```bash
npm run build:client1
npm run build:client2
npm run build:client3
```

Expected: PASS with Cloudflare adapter output and no Node-adapter-only runtime errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client-przemyslawfilipiak/astro.config.mjs apps/client-focusequalsfreedom/astro.config.mjs apps/client-frinter/astro.config.mjs apps/client-przemyslawfilipiak/src/middleware.ts apps/client-focusequalsfreedom/src/middleware.ts apps/client-frinter/src/middleware.ts
git commit -m "feat: switch tenant clients to cloudflare runtime config"
```

## Task 8: Update docs, validate the foundation, and prepare follow-on migration plans

**Files:**
- Modify: `docs/architecture/current-architecture-reference.md`
- Modify: `docs/superpowers/plans/2026-03-27-cloudflare-native-foundation.md`

- [ ] **Step 1: Update architecture reference**

Revise `docs/architecture/current-architecture-reference.md` so the runtime topology reflects:

- shared Cloudflare Worker app/backend
- Hyperdrive to PostgreSQL
- Queue -> Workflow async path
- R2 object storage seam

- [ ] **Step 2: Run verification**

Run:

```bash
node --test apps/api/src/cloudflare/*.test.ts apps/api/src/cloudflare/**/*.test.ts src/db/*.test.ts src/lib/cloudflare/*.test.ts
npx tsc --noEmit
npm run build:client1
npm run build:client2
npm run build:client3
npx wrangler deploy --dry-run
```

Expected:

- all focused tests PASS
- typecheck PASS
- all three client builds PASS
- Wrangler dry run PASS

- [ ] **Step 3: Document what remains out of scope**

Add a short “Next plans required” section to this plan file listing:

- Brand Clarity workflows
- Reddit/YouTube workflows
- Social Hub render/publish migration
- remaining API route migration parity

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/current-architecture-reference.md docs/superpowers/plans/2026-03-27-cloudflare-native-foundation.md
git commit -m "docs: update architecture after cloudflare foundation plan"
```

## Execution Notes

- Keep the current Node `apps/api/src/server.ts` path working until the Cloudflare runtime is verified. Do not remove the Node entrypoint during this plan.
- Do not migrate all queue topics in one pass. Use `geo` as the reference vertical slice and keep the rest for dedicated follow-on plans.
- Keep `siteId` and `siteSlug` explicit in every payload boundary.
- Do not redesign the database schema during this plan.
- Do not move the PostgreSQL provider in this plan.
