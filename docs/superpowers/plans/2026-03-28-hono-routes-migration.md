# Hono Routes Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node/Railway API with Hono-based route handlers running entirely in the Cloudflare Worker, then delete all Node server code.

**Architecture:** Single Hono app (`app.ts`) mounts 13 route routers. The Worker `fetch` delegates to `app.fetch()`. Auth uses PBKDF2 via `crypto.subtle`. DB is initialised per-request via an `initDb` middleware using the Hyperdrive binding. Queue and Workflow handlers are unchanged.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, Drizzle ORM, Hyperdrive, node:test, crypto.subtle.

**Spec:** `docs/superpowers/specs/2026-03-28-hono-routes-migration-design.md`

---

## File Structure

### New files (create)

```
apps/api/src/cloudflare/
  app.ts                        ← main Hono app, mounts all routers
  middleware/
    auth.ts                     ← session extraction, requireAuth, verifyPassword
  routes/
    auth.ts                     ← login, set-tenant, me, logout
    jobs.ts                     ← enqueue all 11 topics, status, results
    admin.ts                    ← dashboard stats
    sites.ts                    ← public-config
    articles.ts                 ← full article CRUD + publish
    knowledge.ts                ← KB entry CRUD
    geo.ts                      ← geo run queries
    content-gaps.ts             ← gap management
    reddit.ts                   ← reddit targets/runs/gaps
    youtube.ts                  ← youtube targets/runs/gaps
    brand-clarity.ts            ← BC settings/projects/channels/videos
    social-hub.ts               ← SH settings/accounts/templates/calendar
    yolo.ts                     ← YOLO automation

scripts/
  gen-pbkdf2-hash.ts            ← one-time hash generation utility
```

### Existing files (referenced, already present)

```
apps/api/src/cloudflare/tenant.ts   ← already exists — used by jobs.ts
apps/api/src/cloudflare/env.ts      ← already exists — ApiEnv type lives here
```

### Modified files

```
apps/api/src/cloudflare/index.ts    ← replace routeRequest with app.fetch
apps/api/src/cloudflare/env.ts      ← add ADMIN_PASSWORD_HASH to ApiEnv (Task 3 Step 4; skip in Task 14 Step 3)
apps/api/wrangler.jsonc              ← remove NODE_API_URL
apps/api/package.json                ← add hono dependency, update scripts
```

### Deleted files (Task 14)

```
apps/api/src/cloudflare/router.ts
apps/api/src/cloudflare/routes/proxy.ts
apps/api/src/cloudflare/jobs/enqueue.ts
apps/api/src/cloudflare/jobs/status.ts
apps/api/src/cloudflare/jobs/results.ts
apps/api/src/routes/          (entire directory)
apps/api/src/server.ts
apps/api/src/router.ts
apps/api/src/helpers.ts
```

---

## Shared patterns used across all route tasks

**DB helper** (put in `app.ts` as middleware, available via `c.get('db')`):
```ts
import { initCloudflareDb, getCloudflareDb } from '../../../../src/db/client.ts';
// in app.use('*', ...):
initCloudflareDb(c.env.HYPERDRIVE);
c.set('db', getCloudflareDb());
```

**HonoEnv type** (defined in `app.ts`, imported by all routes):
```ts
import type { ApiEnv } from './env.ts';
import type { DrizzleD1Database } from 'drizzle-orm/d1'; // or appropriate drizzle type
export type HonoEnv = {
  Bindings: ApiEnv;
  Variables: {
    db: ReturnType<typeof getCloudflareDb>;
    session: SessionRecord | null;
  };
};
```

**json helper** (Hono built-in — use `c.json(body, status)`)**

**Auth** — routes that require login: add `requireAuthMiddleware` as second argument to the route definition.

---

## Task 1: Install Hono and scaffold app.ts

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/cloudflare/app.ts`
- Modify: `apps/api/src/cloudflare/index.ts`

- [ ] **Step 1: Install hono**

Run from repo root:
```bash
npm install hono --workspace=@frinter/api
```

Expected: `hono` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Write failing app test**

Create `apps/api/src/cloudflare/app.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /health returns 200', async () => {
  const { createApp } = await import('./app.ts');
  const app = createApp();
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && node --import tsx --test src/cloudflare/app.test.ts
```
Expected: FAIL — `app.ts` does not exist.

- [ ] **Step 4: Create app.ts**

```ts
import { Hono } from 'hono';
import type { ApiEnv } from './env.ts';
import { initCloudflareDb, getCloudflareDb } from '../../../../src/db/client.ts';

export type HonoEnv = {
  Bindings: ApiEnv;
  Variables: {
    db: ReturnType<typeof getCloudflareDb>;
    session: import('../../../../src/db/schema.ts').SessionRecord | null;
  };
};

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use('*', async (c, next) => {
    if (c.env?.HYPERDRIVE) {
      initCloudflareDb(c.env.HYPERDRIVE);
      c.set('db', getCloudflareDb());
    }
    await next();
  });

  app.get('/health', (c) => c.json({ service: 'api', status: 'ok' }));

  return app;
}

export const honoApp = createApp();
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && node --import tsx --test src/cloudflare/app.test.ts
```
Expected: PASS.

- [ ] **Step 6: Update index.ts to use honoApp**

Replace the `routeRequest` call in `worker.fetch` with:
```ts
import { honoApp } from './app.ts';
// ...
async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
  const start = Date.now();
  const { method } = request;
  const pathname = new URL(request.url).pathname;
  try {
    const response = await honoApp.fetch(request, env, ctx);
    console.log(JSON.stringify({ type: 'request', method, pathname, status: response.status, duration_ms: Date.now() - start }));
    return response;
  } catch (error) {
    console.error(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
},
```

Remove `import { routeRequest } from './router.ts'` from `index.ts`.

- [ ] **Step 7: Verify wrangler dry-run**

```bash
cd apps/api && npx wrangler deploy --dry-run --config wrangler.jsonc
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/src/cloudflare/app.ts apps/api/src/cloudflare/app.test.ts apps/api/src/cloudflare/index.ts
git commit -m "feat: scaffold hono app and wire into worker entrypoint"
```

---

## Task 2: Auth middleware (PBKDF2 + session extraction)

**Files:**
- Create: `apps/api/src/cloudflare/middleware/auth.ts`
- Create: `apps/api/src/cloudflare/middleware/auth.test.ts`
- Create: `scripts/gen-pbkdf2-hash.ts`

- [ ] **Step 1: Write failing auth middleware tests**

Create `apps/api/src/cloudflare/middleware/auth.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.ts';

test('hashPassword produces pbkdf2 format', async () => {
  const hash = await hashPassword('secret');
  assert.ok(hash.startsWith('pbkdf2:sha256:'));
  assert.equal(hash.split(':').length, 5);
});

test('verifyPassword returns true for correct password', async () => {
  const hash = await hashPassword('mypassword');
  assert.equal(await verifyPassword('mypassword', hash), true);
});

test('verifyPassword returns false for wrong password', async () => {
  const hash = await hashPassword('correct');
  assert.equal(await verifyPassword('wrong', hash), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/middleware/auth.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement auth.ts**

Create `apps/api/src/cloudflare/middleware/auth.ts`:
```ts
import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { sessions, sites } from '../../../../../src/db/schema.ts';
import type { HonoEnv } from '../app.ts';

export const SESSION_COOKIE = 'session';

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

export function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt }, key, 256);
  return `pbkdf2:sha256:100000:${bytesToHex(salt.buffer)}:${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, , iterStr, saltHex, hashHex] = parts;
  const iterations = Number(iterStr);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: hexToBytes(saltHex) }, key, 256);
  return timingSafeEqual(new Uint8Array(derived), hexToBytes(hashHex));
}

export function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export const sessionMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const db = c.get('db');
  const token = getCookie(c, SESSION_COOKIE);
  if (token && db) {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    c.set('session', session?.expiresAt > new Date() ? session : null);
  } else {
    c.set('session', null);
  }
  await next();
});

export const requireAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const db = c.get('db');
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !db) return c.json({ error: 'Unauthorized' }, 401);
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt <= new Date()) return c.json({ error: 'Unauthorized' }, 401);
  c.set('session', session);
  await next();
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && node --import tsx --test src/cloudflare/middleware/auth.test.ts
```
Expected: PASS.

- [ ] **Step 5: Create gen-pbkdf2-hash.ts**

Create `scripts/gen-pbkdf2-hash.ts`:
```ts
// Run: npx tsx scripts/gen-pbkdf2-hash.ts
// Paste password when prompted, copies hash to stdout.
// Then: wrangler secret put ADMIN_PASSWORD_HASH
import * as readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Password: ', async (password) => {
  rl.close();

  function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return arr;
  }
  function bytesToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const { webcrypto } = await import('node:crypto');
  const subtle = webcrypto.subtle;
  const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
  const salt = getRandomValues(new Uint8Array(16));
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt }, key, 256);
  const hash = `pbkdf2:sha256:100000:${bytesToHex(salt.buffer)}:${bytesToHex(derived)}`;
  console.log('\nHash (copy this to wrangler secret):\n');
  console.log(hash);
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/middleware/auth.ts apps/api/src/cloudflare/middleware/auth.test.ts scripts/gen-pbkdf2-hash.ts
git commit -m "feat: add pbkdf2 auth middleware and hash generation script"
```

---

## Task 3: Auth routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/auth.ts`
- Create: `apps/api/src/cloudflare/routes/auth.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

- [ ] **Step 1: Write failing auth route tests**

Create `apps/api/src/cloudflare/routes/auth.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.ts';

function makeApp() {
  // minimal stub env — no real DB, tests check routing + 400/401 shapes
  return createApp();
}

test('POST /v1/auth/login with missing body returns 400', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/login', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  // No ADMIN_PASSWORD_HASH set → 400 server misconfigured
  assert.equal(res.status, 400);
});

test('GET /v1/auth/me without cookie returns 401', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/me');
  assert.equal(res.status, 401);
});

test('POST /v1/auth/logout always returns 200', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/auth.test.ts
```
Expected: FAIL — routes not yet mounted.

- [ ] **Step 3: Implement auth routes**

Create `apps/api/src/cloudflare/routes/auth.ts`:
```ts
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { sessions, sites } from '../../../../../src/db/schema.ts';
import {
  SESSION_COOKIE, createSessionCookie, clearSessionCookie,
  requireAuthMiddleware, sessionMiddleware, verifyPassword,
} from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const authRouter = new Hono<HonoEnv>();

authRouter.post('/v1/auth/login', async (c) => {
  const body = await c.req.json<{ password?: string; siteSlug?: string }>().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const hash = c.env?.ADMIN_PASSWORD_HASH;
  if (!password || !hash) return c.json({ error: 'Password required or server misconfigured' }, 400);
  if (!(await verifyPassword(password, hash))) return c.json({ error: 'Invalid credentials' }, 401);

  const db = c.get('db');
  // import bytesToHex from middleware/auth.ts rather than redefining it here
  const { bytesToHex } = await import('../middleware/auth.ts');
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, expiresAt, siteId: null });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': createSessionCookie(token),
    },
  });
});

authRouter.post('/v1/auth/set-tenant', requireAuthMiddleware, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json<{ siteSlug?: string }>().catch(() => ({}));
  const slug = typeof body.siteSlug === 'string' ? body.siteSlug.trim().toLowerCase() : '';
  if (!slug) return c.json({ error: 'siteSlug is required' }, 400);
  const db = c.get('db');
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  if (session.siteId && session.siteId !== site.id) return c.json({ error: 'Forbidden for selected site' }, 403);
  const token = getCookie(c, SESSION_COOKIE)!;
  await db.update(sessions).set({ activeSiteId: site.id }).where(eq(sessions.token, token));
  return c.json({ ok: true, activeSiteId: site.id, siteSlug: site.slug });
});

authRouter.get('/v1/auth/me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ authenticated: false }, 401);
  let activeSiteSlug: string | null = null;
  if (session.activeSiteId) {
    const db = c.get('db');
    const [site] = await db.select().from(sites).where(eq(sites.id, session.activeSiteId)).limit(1);
    activeSiteSlug = site?.slug ?? null;
  }
  return c.json({ authenticated: true, session: { id: session.id, siteId: session.siteId ?? null, activeSiteId: session.activeSiteId ?? null, activeSiteSlug, expiresAt: session.expiresAt } });
});

authRouter.post('/v1/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get('db');
    if (db) await db.delete(sessions).where(eq(sessions.token, token));
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie() },
  });
});

// bytesToHex is imported from middleware/auth.ts (exported there)
```

- [ ] **Step 4: Mount router in app.ts**

Add to `app.ts`:
```ts
import { authRouter } from './routes/auth.ts';
// inside createApp(), after middleware:
app.route('/', authRouter);
```

Also add `ADMIN_PASSWORD_HASH` to `ApiEnv` in `env.ts` (string, required).

- [ ] **Step 5: Run tests**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/auth.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/routes/auth.ts apps/api/src/cloudflare/routes/auth.test.ts apps/api/src/cloudflare/app.ts apps/api/src/cloudflare/env.ts
git commit -m "feat: add hono auth routes with pbkdf2 login"
```

---

## Task 4: Jobs routes (Hono rewrite — replaces cloudflare/jobs/)

**Files:**
- Create: `apps/api/src/cloudflare/routes/jobs.ts`
- Create: `apps/api/src/cloudflare/routes/jobs.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

- [ ] **Step 1: Write failing jobs route tests**

Create `apps/api/src/cloudflare/routes/jobs.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('POST /v1/jobs/invalid-topic returns 404', async () => {
  const { jobsRouter } = await import('./jobs.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', jobsRouter);
  const res = await app.request('/v1/jobs/notreal', { method: 'POST' });
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/jobs.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement jobs.ts**

Create `apps/api/src/cloudflare/routes/jobs.ts`:
```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { appJobs, sites } from '../../../../../src/db/schema.ts';
import { buildJobQueueMessage, type JobTopic } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import { resolveTenantRequest } from '../tenant.ts';
import type { HonoEnv } from '../app.ts';

const VALID_TOPICS = new Set<JobTopic>(['geo', 'reddit', 'youtube', 'bc-scrape', 'bc-parse', 'bc-selector', 'bc-cluster', 'bc-generate', 'sh-copy', 'sh-video', 'sh-publish']);

export const jobsRouter = new Hono<HonoEnv>();

jobsRouter.post('/v1/jobs/:topic', requireAuthMiddleware, async (c) => {
  const topic = c.req.param('topic') as JobTopic;
  if (!VALID_TOPICS.has(topic)) return c.json({ error: 'Unknown job topic' }, 404);

  const url = new URL(c.req.url);
  const tenant = resolveTenantRequest(url, c.env);
  const db = c.get('db');
  const [site] = await db.select().from(sites).where(eq(sites.slug, tenant.siteSlug)).limit(1);
  if (!site) return c.json({ error: `Site not found: ${tenant.siteSlug}` }, 404);

  const payload = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const [job] = await db.insert(appJobs).values({ payload, progress: {}, siteId: site.id, topic, type: topic }).returning();

  try {
    await c.env.JOB_QUEUE.send(buildJobQueueMessage({ jobId: String(job.id), payload, siteId: site.id, siteSlug: tenant.siteSlug, topic }));
  } catch {
    await db.delete(appJobs).where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, site.id)));
    return c.json({ error: 'Failed to enqueue job' }, 502);
  }

  return c.json({ jobId: job.id, status: job.status, topic: job.topic }, 202);
});

jobsRouter.get('/v1/jobs/:id', requireAuthMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.get('db');
  const [job] = await db.select().from(appJobs).where(eq(appJobs.id, id)).limit(1);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ id: job.id, topic: job.topic, status: job.status, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt });
});

jobsRouter.get('/v1/jobs/:id/results', requireAuthMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const db = c.get('db');
  const [job] = await db.select().from(appJobs).where(eq(appJobs.id, id)).limit(1);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ id: job.id, topic: job.topic, status: job.status, result: job.result ?? null });
});
```

- [ ] **Step 4: Mount in app.ts**

```ts
import { jobsRouter } from './routes/jobs.ts';
app.route('/', jobsRouter);
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/jobs.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/routes/jobs.ts apps/api/src/cloudflare/routes/jobs.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono jobs routes for all 11 topics"
```

---

## Task 5: Admin and Sites routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/admin.ts`
- Create: `apps/api/src/cloudflare/routes/sites.ts`
- Create: `apps/api/src/cloudflare/routes/admin.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/cloudflare/routes/admin.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/admin/dashboard without auth returns 401', async () => {
  const { adminRouter } = await import('./admin.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', adminRouter);
  const res = await app.request('/v1/admin/dashboard');
  assert.equal(res.status, 401);
});

test('GET /v1/sites/frinter/public-config with no db returns 404 or 500', async () => {
  const { sitesRouter } = await import('./sites.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', sitesRouter);
  const res = await app.request('/v1/sites/frinter/public-config');
  assert.ok([404, 500].includes(res.status));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/admin.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement admin.ts**

Create `apps/api/src/cloudflare/routes/admin.ts`:
```ts
import { Hono } from 'hono';
import { count, eq } from 'drizzle-orm';
import { articles, contentGaps, knowledgeEntries } from '../../../../../src/db/schema.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const adminRouter = new Hono<HonoEnv>();

adminRouter.get('/v1/admin/dashboard', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const [[published], [drafts], [gaps], [kb]] = await Promise.all([
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, siteId)).where(eq(articles.status, 'published')),
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, siteId)).where(eq(articles.status, 'draft')),
    db.select({ n: count() }).from(contentGaps).where(eq(contentGaps.siteId, siteId)).where(eq(contentGaps.status, 'new')),
    db.select({ n: count() }).from(knowledgeEntries).where(eq(knowledgeEntries.siteId, siteId)),
  ]);

  return c.json({ publishedArticles: published.n, draftArticles: drafts.n, newContentGaps: gaps.n, knowledgeEntries: kb.n });
});
```

- [ ] **Step 4: Implement sites.ts**

Create `apps/api/src/cloudflare/routes/sites.ts`:
```ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { sites } from '../../../../../src/db/schema.ts';
import type { HonoEnv } from '../app.ts';

export const sitesRouter = new Hono<HonoEnv>();

sitesRouter.get('/v1/sites/:siteSlug/public-config', async (c) => {
  const slug = c.req.param('siteSlug');
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  return c.json({ slug: site.slug, name: site.name });
});
```

- [ ] **Step 5: Mount in app.ts and run tests**

```ts
import { adminRouter } from './routes/admin.ts';
import { sitesRouter } from './routes/sites.ts';
app.route('/', adminRouter);
app.route('/', sitesRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/admin.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cloudflare/routes/admin.ts apps/api/src/cloudflare/routes/sites.ts apps/api/src/cloudflare/routes/admin.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono admin and sites routes"
```

---

## Task 6: Articles routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/articles.ts`
- Create: `apps/api/src/cloudflare/routes/articles.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/articles.ts`. Replace `req`/`res` pattern with Hono `c.req`/`c.json()`. Replace `db` import with `c.get('db')`. Replace `requireAuth(req, res)` with `requireAuthMiddleware`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/articles.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/articles without siteSlug returns 400 or 404', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/articles');
  assert.ok([400, 404, 500].includes(res.status));
});

test('GET /v1/admin/articles without auth returns 401', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/admin/articles');
  assert.equal(res.status, 401);
});

test('DELETE /v1/admin/articles/1 without auth returns 401', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/admin/articles/1', { method: 'DELETE' });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/articles.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement articles.ts**

Port from `apps/api/src/routes/articles.ts`. Key conversion rules:
- `const body = await readJsonBody(req)` → `const body = await c.req.json().catch(() => ({}))`
- `const q = url.searchParams.get('q')` → `const q = c.req.query('q')`
- `const id = segments[3]` → `const id = c.req.param('id')`
- `json(res, 200, data)` → `return c.json(data)`
- `json(res, 404, { error })` → `return c.json({ error }, 404)`
- `const session = await requireAuth(req, res); if (!session) return true;` → `requireAuthMiddleware` on route
- `db` from `helpers.ts` → `c.get('db')`
- `siteId` from session: `const siteId = session.activeSiteId ?? session.siteId`

Endpoints to implement:
- `GET /v1/articles` — public, requires `siteSlug` query param
- `GET /v1/articles/:slug` — public
- `GET /v1/admin/articles` — auth required
- `GET /v1/admin/articles/:id` — auth required
- `POST /v1/admin/articles` — auth required
- `PUT /v1/admin/articles/:id` — auth required
- `DELETE /v1/admin/articles/:id` — auth required
- `POST /v1/admin/articles/bulk-delete` — auth required
- `POST /v1/admin/articles/:id/publish` — auth required
- `GET /v1/admin/article-generations` — auth required

- [ ] **Step 4: Mount and run tests**

```ts
import { articlesRouter } from './routes/articles.ts';
app.route('/', articlesRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/articles.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/articles.ts apps/api/src/cloudflare/routes/articles.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono articles routes"
```

---

## Task 7: Knowledge routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/knowledge.ts`
- Create: `apps/api/src/cloudflare/routes/knowledge.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/knowledge.ts`. All endpoints require auth.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/knowledge.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/admin/knowledge-base without auth returns 401', async () => {
  const { knowledgeRouter } = await import('./knowledge.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', knowledgeRouter);
  const res = await app.request('/v1/admin/knowledge-base');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/knowledge.test.ts
```

- [ ] **Step 3: Implement knowledge.ts**

Port from `apps/api/src/routes/knowledge.ts`. Note: PostgreSQL full-text search uses `sql` from Drizzle — preserve the `plainto_tsquery` pattern exactly.

Endpoints:
- `GET /v1/admin/knowledge-base` — paginated list with search + type/tag filters
- `GET /v1/admin/knowledge-base/:id`
- `POST /v1/admin/knowledge-base`
- `POST /v1/admin/knowledge-base/import`
- `PUT /v1/admin/knowledge-base/:id`
- `DELETE /v1/admin/knowledge-base/:id`

- [ ] **Step 4: Mount and run tests**

```ts
import { knowledgeRouter } from './routes/knowledge.ts';
app.route('/', knowledgeRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/knowledge.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/knowledge.ts apps/api/src/cloudflare/routes/knowledge.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono knowledge routes"
```

---

## Task 8: GEO and Content Gaps routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/geo.ts`
- Create: `apps/api/src/cloudflare/routes/content-gaps.ts`
- Create: `apps/api/src/cloudflare/routes/geo.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/geo.ts` and `apps/api/src/routes/content-gaps.ts`.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/cloudflare/routes/geo.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/geo/runs without auth returns 401', async () => {
  const { geoRouter } = await import('./geo.ts');
  const app = new Hono();
  app.route('/', geoRouter);
  const res = await app.request('/v1/admin/geo/runs');
  assert.equal(res.status, 401);
});

test('GET /v1/admin/content-gaps without auth returns 401', async () => {
  const { contentGapsRouter } = await import('./content-gaps.ts');
  const app = new Hono();
  app.route('/', contentGapsRouter);
  const res = await app.request('/v1/admin/content-gaps');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/geo.test.ts
```

- [ ] **Step 3: Implement geo.ts and content-gaps.ts**

`geo.ts` endpoints:
- `GET /v1/admin/geo/runs` — paginated list
- `GET /v1/admin/geo/runs/:runId` — run details + queries + created drafts

`content-gaps.ts` endpoints:
- `GET /v1/admin/content-gaps` — paginated list with KB hints
- `GET /v1/admin/content-gaps/:id`
- `POST /v1/admin/content-gaps/:id/acknowledge`
- `POST /v1/admin/content-gaps/:id/archive`

- [ ] **Step 4: Mount and run tests**

```ts
import { geoRouter } from './routes/geo.ts';
import { contentGapsRouter } from './routes/content-gaps.ts';
app.route('/', geoRouter);
app.route('/', contentGapsRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/geo.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/geo.ts apps/api/src/cloudflare/routes/content-gaps.ts apps/api/src/cloudflare/routes/geo.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono geo and content-gaps routes"
```

---

## Task 9: Reddit routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/reddit.ts`
- Create: `apps/api/src/cloudflare/routes/reddit.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/reddit.ts`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/reddit.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/reddit/targets without auth returns 401', async () => {
  const { redditRouter } = await import('./reddit.ts');
  const app = new Hono();
  app.route('/', redditRouter);
  const res = await app.request('/v1/admin/reddit/targets');
  assert.equal(res.status, 401);
});

test('POST /v1/admin/reddit/gaps/auto-filter without auth returns 401', async () => {
  const { redditRouter } = await import('./reddit.ts');
  const app = new Hono();
  app.route('/', redditRouter);
  const res = await app.request('/v1/admin/reddit/gaps/auto-filter', { method: 'POST' });
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/reddit.test.ts
```

- [ ] **Step 3: Implement reddit.ts**

Endpoints (all require auth):
- `GET/POST /v1/admin/reddit/targets`
- `PUT/DELETE /v1/admin/reddit/targets/:id`
- `GET /v1/admin/reddit/runs`
- `GET/DELETE /v1/admin/reddit/runs/:id`
- `GET /v1/admin/reddit/gaps`
- `POST /v1/admin/reddit/gaps/auto-filter`
- `POST /v1/admin/reddit/gaps/:id/approve`
- `POST /v1/admin/reddit/gaps/:id/reject`

- [ ] **Step 4: Mount and run tests**

```ts
import { redditRouter } from './routes/reddit.ts';
app.route('/', redditRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/reddit.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/reddit.ts apps/api/src/cloudflare/routes/reddit.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono reddit routes"
```

---

## Task 10: YouTube routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/youtube.ts`
- Create: `apps/api/src/cloudflare/routes/youtube.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/youtube.ts`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/youtube.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/youtube/overview without auth returns 401', async () => {
  const { youtubeRouter } = await import('./youtube.ts');
  const app = new Hono();
  app.route('/', youtubeRouter);
  const res = await app.request('/v1/admin/youtube/overview');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/youtube.test.ts
```

- [ ] **Step 3: Implement youtube.ts**

Endpoints (all require auth):
- `GET /v1/admin/youtube/overview`
- `GET/POST /v1/admin/youtube/targets`
- `PUT/DELETE /v1/admin/youtube/targets/:id`
- `GET /v1/admin/youtube/runs`
- `GET/DELETE /v1/admin/youtube/runs/:id`
- `GET /v1/admin/youtube/gaps`
- `POST /v1/admin/youtube/gaps/auto-filter`
- `POST /v1/admin/youtube/gaps/:id/approve`
- `POST /v1/admin/youtube/gaps/:id/reject`

- [ ] **Step 4: Mount and run tests**

```ts
import { youtubeRouter } from './routes/youtube.ts';
app.route('/', youtubeRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/youtube.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/youtube.ts apps/api/src/cloudflare/routes/youtube.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono youtube routes"
```

---

## Task 11: Brand Clarity routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/brand-clarity.ts`
- Create: `apps/api/src/cloudflare/routes/brand-clarity.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/brand-clarity.ts`. Note: YouTube API calls use `fetch()` which works natively in Workers.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/brand-clarity.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/bc/settings without auth returns 401', async () => {
  const { brandClarityRouter } = await import('./brand-clarity.ts');
  const app = new Hono();
  app.route('/', brandClarityRouter);
  const res = await app.request('/v1/admin/bc/settings');
  assert.equal(res.status, 401);
});

test('GET /v1/admin/bc/projects without auth returns 401', async () => {
  const { brandClarityRouter } = await import('./brand-clarity.ts');
  const app = new Hono();
  app.route('/', brandClarityRouter);
  const res = await app.request('/v1/admin/bc/projects');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/brand-clarity.test.ts
```

- [ ] **Step 3: Implement brand-clarity.ts**

Endpoints (all require auth):
- `GET/PUT /v1/admin/bc/settings`
- `GET/POST /v1/admin/bc/projects`
- `GET/PUT/DELETE /v1/admin/bc/projects/:id`
- `PUT /v1/admin/bc/projects/:id/documentation`
- `GET/POST /v1/admin/bc/projects/:id/channels`
- `PUT/DELETE /v1/admin/bc/projects/:id/channels/:channelId`
- `POST /v1/admin/bc/projects/:id/channels/confirm-all`
- `GET /v1/admin/bc/projects/:id/videos`
- `PUT /v1/admin/bc/projects/:id/videos/:videoId`
- `POST /v1/admin/bc/projects/:id/videos/add-manual`

For `add-manual`: YouTube API call uses `fetch()` directly — works unchanged in Workers.

- [ ] **Step 4: Mount and run tests**

```ts
import { brandClarityRouter } from './routes/brand-clarity.ts';
app.route('/', brandClarityRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/brand-clarity.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/brand-clarity.ts apps/api/src/cloudflare/routes/brand-clarity.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono brand-clarity routes"
```

---

## Task 12: Social Hub routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/social-hub.ts`
- Create: `apps/api/src/cloudflare/routes/social-hub.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/social-hub.ts`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/social-hub.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/social-hub/settings without auth returns 401', async () => {
  const { socialHubRouter } = await import('./social-hub.ts');
  const app = new Hono();
  app.route('/', socialHubRouter);
  const res = await app.request('/v1/social-hub/settings');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/social-hub.test.ts
```

- [ ] **Step 3: Implement social-hub.ts**

Endpoints (all require auth):
- `GET/PUT /v1/social-hub/settings`
- `GET/POST /v1/social-hub/accounts`
- `PUT/DELETE /v1/social-hub/accounts/:id`
- `GET/POST /v1/social-hub/templates`
- `PUT/DELETE /v1/social-hub/templates/:id`
- `GET/PUT /v1/social-hub/calendar`
- `POST /v1/social-hub/repurpose`

- [ ] **Step 4: Mount and run tests**

```ts
import { socialHubRouter } from './routes/social-hub.ts';
app.route('/', socialHubRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/social-hub.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/social-hub.ts apps/api/src/cloudflare/routes/social-hub.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono social-hub routes"
```

---

## Task 13: YOLO routes

**Files:**
- Create: `apps/api/src/cloudflare/routes/yolo.ts`
- Create: `apps/api/src/cloudflare/routes/yolo.test.ts`
- Modify: `apps/api/src/cloudflare/app.ts`

Port from `apps/api/src/routes/yolo.ts`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/cloudflare/routes/yolo.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/yolo/settings without auth returns 401', async () => {
  const { yoloRouter } = await import('./yolo.ts');
  const app = new Hono();
  app.route('/', yoloRouter);
  const res = await app.request('/v1/admin/yolo/settings');
  assert.equal(res.status, 401);
});

test('GET /v1/admin/yolo/preview without auth returns 401', async () => {
  const { yoloRouter } = await import('./yolo.ts');
  const app = new Hono();
  app.route('/', yoloRouter);
  const res = await app.request('/v1/admin/yolo/preview');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/yolo.test.ts
```

- [ ] **Step 3: Implement yolo.ts**

Endpoints (all require auth):
- `GET/PUT /v1/admin/yolo/settings`
- `GET /v1/admin/yolo/preview`
- `POST /v1/admin/yolo/run/pain-points`
- `POST /v1/admin/yolo/run/gaps`
- `POST /v1/admin/yolo/run/publish`
- `GET /v1/admin/yolo/pain-points`
- `POST /v1/admin/yolo/approve/pain-points`
- `POST /v1/admin/yolo/acknowledge/gaps`
- `GET /v1/admin/yolo/draft-status`
- `GET /v1/admin/yolo/drafts`
- `POST /v1/admin/yolo/publish/selected`

- [ ] **Step 4: Mount and run tests**

```ts
import { yoloRouter } from './routes/yolo.ts';
app.route('/', yoloRouter);
```

```bash
cd apps/api && node --import tsx --test src/cloudflare/routes/yolo.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cloudflare/routes/yolo.ts apps/api/src/cloudflare/routes/yolo.test.ts apps/api/src/cloudflare/app.ts
git commit -m "feat: add hono yolo routes"
```

---

## Task 14: Remove proxy and update wrangler config

**Files:**
- Modify: `apps/api/wrangler.jsonc`
- Modify: `apps/api/src/cloudflare/env.ts`

- [ ] **Step 1: Remove NODE_API_URL from wrangler.jsonc**

Remove the `NODE_API_URL` entry from the `vars` block in `apps/api/wrangler.jsonc`.

- [ ] **Step 2: Remove NODE_API_URL from env.ts**

Remove `NODE_API_URL` from the `ApiEnv` type and from the `readApiEnv` validation function.

- [ ] **Step 3: Verify ADMIN_PASSWORD_HASH in env.ts**

`ADMIN_PASSWORD_HASH` was already added to `ApiEnv` in Task 3 Step 4. Confirm the field is present and the `readApiEnv` validation throws if it is missing. If it was skipped in Task 3, add it now:
```ts
ADMIN_PASSWORD_HASH: string;
```

- [ ] **Step 4: Run full Cloudflare test suite**

```bash
cd apps/api && node --import tsx --test "src/cloudflare/*.test.ts" "src/cloudflare/**/*.test.ts"
```
Expected: all PASS.

- [ ] **Step 5: Wrangler dry-run**

```bash
cd apps/api && npx wrangler deploy --dry-run --config wrangler.jsonc
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/wrangler.jsonc apps/api/src/cloudflare/env.ts
git commit -m "feat: remove node api url, add admin password hash to worker env"
```

---

## Task 15: Delete Node server files

**Files:** delete everything listed below.

- [ ] **Step 1: Delete old Cloudflare files replaced by Hono**

```bash
rm apps/api/src/cloudflare/router.ts
rm apps/api/src/cloudflare/routes/proxy.ts
rm -rf apps/api/src/cloudflare/jobs/
```

- [ ] **Step 2: Delete Node route handlers and server**

```bash
rm -rf apps/api/src/routes/
rm apps/api/src/server.ts
rm apps/api/src/router.ts
rm apps/api/src/helpers.ts
```

- [ ] **Step 3: Update package.json scripts**

In `apps/api/package.json`, remove or update:
- `"dev": "tsx src/server.ts"` → remove or replace with `"dev": "npm run dev:cf"`
- `"start": "tsx src/server.ts"` → remove

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors referencing deleted files.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/api && node --import tsx --test "src/cloudflare/*.test.ts" "src/cloudflare/**/*.test.ts"
```
Expected: all PASS.

- [ ] **Step 6: Grep for Node API references**

```bash
grep -r "proxyToNodeApi\|NODE_API_URL\|IncomingMessage\|ServerResponse" apps/api/src/cloudflare/
```
Expected: no output.

- [ ] **Step 7: Final wrangler dry-run**

```bash
cd apps/api && npx wrangler deploy --dry-run --config wrangler.jsonc
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: delete node server and railway api — cloudflare migration complete"
```

---

## Execution Notes

- Each Hono route file exports a named router (e.g. `export const articlesRouter = new Hono<HonoEnv>()`).
- Session `siteId` resolution in all routes: `const siteId = session.activeSiteId ?? session.siteId`. Always check this is non-null before DB queries that filter by site.
- Do NOT use `process.env` in any Worker route — all config comes from `c.env`.
- DB is initialised by the `app.use('*')` middleware only when `c.env.HYPERDRIVE` is present. In tests without a real env, `c.get('db')` will be undefined — guard or mock as needed.
- bcrypt and Node crypto are gone. All password work uses `crypto.subtle` (global in Workers and in recent Node.js).
- `fetch()` for external HTTP (YouTube API, brand filter) works identically in Workers.
