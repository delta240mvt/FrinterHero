# Admin Tenant Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `session.activeSiteId` the single source of truth for admin tenant context, eliminating cross-tenant data leaks via browser cookie manipulation.

**Architecture:** Add `activeSiteId` to the `sessions` DB table. All admin API routes switch from reading `siteSlug` from request params to reading `activeSiteId` from the server session. The Astro proxy layer stops injecting `siteSlug` entirely. A new `POST /v1/auth/set-tenant` endpoint lets the admin switch tenants, updating the session in the DB.

**Tech Stack:** TypeScript, Drizzle ORM (schema push), Node.js HTTP server, Astro SSR, PostgreSQL. Tests use Node's built-in `node:test` runner via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-03-23-admin-tenant-session-design.md`

---

## File Map

**Modified — Backend**
- `src/db/schema.ts` — add `activeSiteId` column to `sessions` table
- `apps/api/src/helpers.ts` — add `getSiteById`, `requireActiveSite`; update `resolveShSite`, `resolveBcProjectContext`, `resolveShBriefContext` signatures
- `apps/api/src/helpers.test.ts` — tests for new helpers
- `apps/api/src/routes/auth.ts` — add `POST /v1/auth/set-tenant`, extend `GET /v1/auth/me`
- `apps/api/src/routes/articles.ts` — replace `resolveAuthedSite` → `requireActiveSite`
- `apps/api/src/routes/content-gaps.ts` — same
- `apps/api/src/routes/knowledge.ts` — same
- `apps/api/src/routes/geo.ts` — same
- `apps/api/src/routes/reddit.ts` — same (skip stream/status endpoints)
- `apps/api/src/routes/youtube.ts` — same (skip stream/status endpoints)
- `apps/api/src/routes/jobs.ts` — replace `resolveAuthedSite` → `requireActiveSite` for `/v1/jobs/draft`, `/v1/jobs/geo`, `/v1/jobs/reddit`, `/v1/jobs/yt`, `/v1/jobs/bc`, `/v1/jobs/latest`, `/v1/jobs/active`, `DELETE /v1/jobs/active`; leave `GET /v1/jobs/:id` (resolves from job record)
- `apps/api/src/routes/brand-clarity.ts` — update to use `resolveBcProjectContext` with new signature
- `apps/api/src/routes/social-hub.ts` — update to use `resolveShSite` / `resolveShBriefContext` with new signatures
- `apps/api/src/routes/admin.ts` — replace `resolveAuthedSite` → `requireActiveSite`

**Modified — Frontend**
- `src/lib/internal-api.ts` — remove `resolveAdminActiveSiteSlug`, `resolveScopedSiteSlugForRequest`, `createAdminActiveSiteCookie`, `normalizeScopedSiteSlug`, `ADMIN_ACTIVE_SITE_COOKIE`; remove `includeSiteSlug` and `useAdminActiveSite` params from `proxyInternalApiRequest` and `fetchInternalApiJson`; remove social-hub slug injection from `buildInternalApiUrl`
- `apps/client-przemyslawfilipiak/src/pages/api/**/*.ts` (76 files) — remove `includeSiteSlug: true` and `useAdminActiveSite: true` from all proxy calls
- `apps/client-przemyslawfilipiak/src/pages/api/auth.ts` — remove `includeSiteSlug` if present
- `apps/client-przemyslawfilipiak/src/middleware.ts` — store `activeSiteSlug` from `/v1/auth/me` in `context.locals`; redirect to tenant picker if admin page and `activeSiteId` is null
- `apps/client-przemyslawfilipiak/src/components/layouts/Base.astro` — read `activeSiteSlug` from `Astro.locals`; update selector `selected` and JS script to POST to `/api/admin/switch-tenant`

**Deleted**
- `apps/client-przemyslawfilipiak/src/pages/api/admin/switch-site.ts`

**Created**
- `apps/client-przemyslawfilipiak/src/pages/api/admin/switch-tenant.ts` — POST proxy to `/v1/auth/set-tenant`
- `apps/client-przemyslawfilipiak/src/pages/admin/select-tenant.astro` — tenant picker page (shown when `activeSiteId` is null)

---

## Task 1: Schema — add activeSiteId to sessions

**Files:**
- Modify: `src/db/schema.ts:103-109`

- [ ] **Open `src/db/schema.ts` and add `activeSiteId` to the `sessions` table definition:**

```typescript
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'set null' }),
  activeSiteId: integer('active_site_id').references(() => sites.id, { onDelete: 'set null' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Push the schema change to the database:**

```bash
npm run db:push
```

Expected: Drizzle prompts to confirm adding the `active_site_id` column. Confirm. No data loss — column is nullable.

- [ ] **Verify column exists:**

```bash
npm run db:push
```

Expected: "No changes detected" (schema already in sync).

- [ ] **Commit:**

```bash
git add src/db/schema.ts
git commit -m "feat: add activeSiteId to sessions schema"
```

---

## Task 2: Backend helpers — getSiteById + requireActiveSite

**Files:**
- Modify: `apps/api/src/helpers.ts`
- Modify: `apps/api/src/helpers.test.ts`

- [ ] **Add the failing tests first.** Open `apps/api/src/helpers.test.ts` and add:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

import { sessionCanAccessSite } from './helpers.ts';

test('sessionCanAccessSite allows global admin sessions', () => {
  assert.equal(sessionCanAccessSite({ siteId: null }, { id: 1 }), true);
});

test('sessionCanAccessSite blocks mismatched tenant-bound sessions', () => {
  assert.equal(sessionCanAccessSite({ siteId: 2 }, { id: 1 }), false);
  assert.equal(sessionCanAccessSite({ siteId: 1 }, { id: 1 }), true);
});

// Document the requireActiveSite invariants as comments (full integration tests
// require a live DB and HTTP — not feasible in the unit test file).
// The correctness of requireActiveSite is verified by the smoke test in Task 17.
// The logic: if session.activeSiteId is null → 403; if site not found → 404; otherwise return {session, site}.
```

- [ ] **Run tests to make sure they pass (existing + new pure-logic tests):**

```bash
cd apps/api && npx tsx --test src/helpers.test.ts
```

Expected: all 4 tests pass.

- [ ] **Add `getSiteById` and `requireActiveSite` to `apps/api/src/helpers.ts`.** Find the "Auth & context resolution" section (around line 351) and add after `getSiteBySlug`:

```typescript
export async function getSiteById(id: number) {
  const [site] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return site ?? null;
}

export async function requireActiveSite(req: http.IncomingMessage, res: http.ServerResponse) {
  const session = await requireAuth(req, res);
  if (!session) return null;
  if (!session.activeSiteId) {
    json(res, 403, { error: 'No active tenant selected' });
    return null;
  }
  const site = await getSiteById(session.activeSiteId);
  if (!site) {
    json(res, 404, { error: 'Active tenant not found' });
    return null;
  }
  return { session, site };
}
```

- [ ] **Update the three compound helpers** to remove the `siteSlug` parameter. Find them in `helpers.ts` (around lines 394–465) and replace:

```typescript
// BEFORE:
export async function resolveBcProjectContext(req, res, siteSlug: string, projectIdValue: unknown) {
  const context = await resolveAuthedSite(req, res, siteSlug);
  ...
}

export async function resolveShSite(req, res, siteSlug: string) {
  return resolveAuthedSite(req, res, siteSlug);
}

export async function resolveShBriefContext(req, res, siteSlug: string, briefIdValue: unknown) {
  const context = await resolveShSite(req, res, siteSlug);
  ...
}

// AFTER — remove siteSlug param, call requireActiveSite:
export async function resolveBcProjectContext(req: http.IncomingMessage, res: http.ServerResponse, projectIdValue: unknown) {
  const context = await requireActiveSite(req, res);
  if (!context) return null;
  const projectId = Number(projectIdValue);
  if (!projectId) {
    json(res, 400, { error: 'Invalid projectId' });
    return null;
  }
  const [project] = await db.select().from(bcProjects).where(and(eq(bcProjects.id, projectId), bcProjectScope(context.site.id))).limit(1);
  if (!project) {
    json(res, 404, { error: 'Not found' });
    return null;
  }
  return { ...context, projectId, project };
}

export async function resolveShSite(req: http.IncomingMessage, res: http.ServerResponse) {
  return requireActiveSite(req, res);
}

export async function resolveShBriefContext(req: http.IncomingMessage, res: http.ServerResponse, briefIdValue: unknown) {
  const context = await resolveShSite(req, res);
  if (!context) return null;
  const briefId = Number(briefIdValue);
  if (!briefId) {
    json(res, 400, { error: 'Invalid brief id' });
    return null;
  }
  const [brief] = await db.select().from(shContentBriefs).where(and(eq(shContentBriefs.id, briefId), shBriefScope(context.site.id))).limit(1);
  if (!brief) {
    json(res, 404, { error: 'Brief not found' });
    return null;
  }
  return { ...context, briefId, brief };
}
```

- [ ] **Export `requireActiveSite` and `getSiteById`** from the bottom of `helpers.ts` re-export block (or they're already exported via `export async function` — just verify they appear in the file correctly).

- [ ] **Run TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors related to the new helpers.

- [ ] **Commit:**

```bash
git add apps/api/src/helpers.ts apps/api/src/helpers.test.ts
git commit -m "feat: add requireActiveSite helper and update compound helpers"
```

---

## Task 3: Auth routes — set-tenant endpoint + extend /me

**Files:**
- Modify: `apps/api/src/routes/auth.ts`

- [ ] **Update the import line** in `auth.ts` to include `getSiteBySlug`, `requireAuth`, `getSiteById`, `sessions`, `eq`, `db`:

The current imports already include `getSiteBySlug`, `getSession`, `db`, `eq`, `sessions`. Add `requireAuth` and `getSiteById` if not already imported.

- [ ] **Add `POST /v1/auth/set-tenant`** handler inside the `handle` function, after the login block:

```typescript
if (method === 'POST' && pathname === '/v1/auth/set-tenant') {
  const session = await requireAuth(req, res);
  if (!session) return true;
  const body = await readJsonBody(req);
  const slug = normalizeSiteSlug(body.siteSlug);
  if (!slug) return json(res, 400, { error: 'siteSlug is required' }), true;
  const site = await getSiteBySlug(slug);
  if (!site) return json(res, 404, { error: 'Site not found' }), true;
  // Scoped session check: if session.siteId is set, only allow switching to that site
  if (session.siteId && session.siteId !== site.id) {
    return json(res, 403, { error: 'Forbidden for selected site' }), true;
  }
  await db.update(sessions).set({ activeSiteId: site.id }).where(eq(sessions.token, parseCookies(req.headers.cookie)[SESSION_COOKIE]));
  json(res, 200, { ok: true, activeSiteId: site.id, siteSlug: site.slug });
  return true;
}
```

- [ ] **Update `GET /v1/auth/me`** to include `activeSiteId` and `activeSiteSlug` in the response. The current response is:

```typescript
json(res, 200, { authenticated: true, session: { id: session.id, siteId: session.siteId ?? null, expiresAt: session.expiresAt } });
```

Replace with:

```typescript
let activeSiteSlug: string | null = null;
if (session.activeSiteId) {
  const activeSite = await getSiteById(session.activeSiteId);
  activeSiteSlug = activeSite?.slug ?? null;
}
json(res, 200, {
  authenticated: true,
  session: {
    id: session.id,
    siteId: session.siteId ?? null,
    activeSiteId: session.activeSiteId ?? null,
    activeSiteSlug,
    expiresAt: session.expiresAt,
  },
});
```

Note: `getSiteById` needs to be imported. Add it to the imports from `'../helpers.js'`.

- [ ] **Run TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: add POST /v1/auth/set-tenant and extend GET /v1/auth/me"
```

---

## Task 4: Backend routes — migrate articles.ts

**Files:**
- Modify: `apps/api/src/routes/articles.ts`

- [ ] **Update imports** — add `requireActiveSite` to the import from `'../helpers.js'`. Remove `normalizeSiteSlug` from the import if it's no longer needed after migration (it's still used in public routes, so keep it).

- [ ] **Replace all admin `resolveAuthedSite` calls** with `requireActiveSite`. The admin routes are those under `/v1/admin/articles`. Public routes (`GET /v1/articles`, `GET /v1/articles/:slug`) stay untouched — they use `getSiteBySlug` directly.

For each admin handler, change:
```typescript
// BEFORE
const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
// or
const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')));

// AFTER
const context = await requireActiveSite(req, res);
```

There are 9 occurrences in this file. Apply to all admin routes. Remove any `body.siteSlug` or `url.searchParams.get('siteSlug')` references in admin handlers.

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add apps/api/src/routes/articles.ts
git commit -m "feat: migrate articles admin routes to requireActiveSite"
```

---

## Task 5: Backend routes — migrate content-gaps.ts, knowledge.ts, geo.ts

**Files:**
- Modify: `apps/api/src/routes/content-gaps.ts`
- Modify: `apps/api/src/routes/knowledge.ts`
- Modify: `apps/api/src/routes/geo.ts`

For each file, the pattern is identical:

- [ ] **Add `requireActiveSite` to the import from `'../helpers.js'`** in each file.

- [ ] **Replace every `resolveAuthedSite(req, res, normalizeSiteSlug(...))` call** with `requireActiveSite(req, res)`. Remove the `siteSlug` argument extraction from query params / body.

  - `content-gaps.ts`: 5 occurrences
  - `knowledge.ts`: 7 occurrences
  - `geo.ts`: 3 occurrences

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add apps/api/src/routes/content-gaps.ts apps/api/src/routes/knowledge.ts apps/api/src/routes/geo.ts
git commit -m "feat: migrate content-gaps, knowledge, geo routes to requireActiveSite"
```

---

## Task 6: Backend routes — migrate reddit.ts and youtube.ts

**Files:**
- Modify: `apps/api/src/routes/reddit.ts`
- Modify: `apps/api/src/routes/youtube.ts`

These files have stream/status/polling endpoints that must **NOT** be migrated (they resolve site from `appJobs.siteId`). Check each endpoint:

- **Keep as-is** (resolve from job record or require only `requireAuth`):
  - `GET /v1/reddit/stream` — streams job output; resolves from job
  - `GET /v1/reddit/status` — polls job status; resolves from job
  - `GET /v1/youtube/stream` — same
  - `GET /v1/youtube/status` — same

- **Migrate** (admin list/action endpoints):
  - All other handlers in both files

- [ ] **Add `requireActiveSite` to imports** in both files.

- [ ] **In `reddit.ts`**, replace `resolveAuthedSite` → `requireActiveSite` in all non-stream/non-status handlers (10 occurrences). Stream/status handlers (`/v1/reddit/stream`, `/v1/reddit/status`) already call `requireAuth` only or resolve from job — leave them.

- [ ] **In `youtube.ts`**, same pattern (11 occurrences total; skip stream/status).

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add apps/api/src/routes/reddit.ts apps/api/src/routes/youtube.ts
git commit -m "feat: migrate reddit and youtube routes to requireActiveSite"
```

---

## Task 7: Backend routes — migrate jobs.ts

**Files:**
- Modify: `apps/api/src/routes/jobs.ts`

`jobs.ts` has 13 `resolveAuthedSite` occurrences. The rule:
- **Migrate**: `POST /v1/jobs/draft`, `POST /v1/jobs/geo`, `POST /v1/jobs/reddit`, `POST /v1/jobs/yt`, `POST /v1/jobs/bc`, `GET /v1/jobs/latest`, `GET /v1/jobs/active`, `DELETE /v1/jobs/active`
- **Leave as-is**: `GET /v1/jobs/:id` (resolves site from `job.siteId`, uses `requireAuth` only)

- [ ] **Add `requireActiveSite` to imports** in `jobs.ts`.

- [ ] **Replace `resolveAuthedSite` → `requireActiveSite`** in all handlers listed above. For each, remove the `siteSlug` extraction from `body` or `url.searchParams`.

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add apps/api/src/routes/jobs.ts
git commit -m "feat: migrate jobs routes to requireActiveSite"
```

---

## Task 8: Backend routes — migrate brand-clarity.ts

**Files:**
- Modify: `apps/api/src/routes/brand-clarity.ts`

`brand-clarity.ts` uses `resolveBcProjectContext` which now has a new signature (no `siteSlug`).

- [ ] **Update all `resolveBcProjectContext` call sites** in `brand-clarity.ts`. The signature change is:

```typescript
// BEFORE
const context = await resolveBcProjectContext(req, res, normalizeSiteSlug(body.siteSlug ?? url.searchParams.get('siteSlug')), segments[3]);

// AFTER
const context = await resolveBcProjectContext(req, res, segments[3]);
```

There are ~20 call sites. Remove all `siteSlug` argument extractions from body/params in these handlers.

- [ ] **For the 5 direct `resolveAuthedSite` calls** in `brand-clarity.ts` (routes that don't use `resolveBcProjectContext`), replace with `requireActiveSite(req, res)`.

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add apps/api/src/routes/brand-clarity.ts
git commit -m "feat: migrate brand-clarity routes to requireActiveSite"
```

---

## Task 9: Backend routes — migrate social-hub.ts and admin.ts

**Files:**
- Modify: `apps/api/src/routes/social-hub.ts`
- Modify: `apps/api/src/routes/admin.ts`

`social-hub.ts` uses `resolveShSite` and `resolveShBriefContext`, both now with updated signatures.

- [ ] **Update all `resolveShSite` calls** in `social-hub.ts`:

```typescript
// BEFORE
const context = await resolveShSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));

// AFTER
const context = await resolveShSite(req, res);
```

There are 24 total occurrences across `resolveShSite`, `resolveShBriefContext`, and any remaining `resolveAuthedSite` in social-hub.ts. Remove all `siteSlug` argument extractions.

- [ ] **Update all `resolveShBriefContext` calls**:

```typescript
// BEFORE
const context = await resolveShBriefContext(req, res, normalizeSiteSlug(...), segments[4]);

// AFTER
const context = await resolveShBriefContext(req, res, segments[4]);
```

- [ ] **In `admin.ts`**, replace 2 `resolveAuthedSite` calls with `requireActiveSite(req, res)`. Add `requireActiveSite` to imports.

- [ ] **TypeScript check:**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: **zero errors** across all backend files.

- [ ] **Commit:**

```bash
git add apps/api/src/routes/social-hub.ts apps/api/src/routes/admin.ts
git commit -m "feat: migrate social-hub and admin routes to requireActiveSite"
```

---

## Task 10: Frontend — clean up internal-api.ts

**Files:**
- Modify: `src/lib/internal-api.ts`

This file currently exports the client-side cookie injection infrastructure that must be removed.

- [ ] **Delete the following from `src/lib/internal-api.ts`:**
  - `ADMIN_ACTIVE_SITE_COOKIE` constant (line 4)
  - `normalizeScopedSiteSlug` function (lines 30–33)
  - `resolveAdminActiveSiteSlug` function (lines 46–49)
  - `createAdminActiveSiteCookie` function (lines 51–60)
  - `resolveScopedSiteSlugForRequest` function (lines 62–80)
  - Inside `buildInternalApiUrl`: remove the social-hub slug injection block:
    ```typescript
    // DELETE these lines:
    if (pathname.startsWith('/v1/social-hub') && !url.searchParams.has('siteSlug')) {
      url.searchParams.set('siteSlug', getCurrentSiteSlug());
    }
    ```

- [ ] **Remove `includeSiteSlug`, `useAdminActiveSite`, and the body-injection block from `proxyInternalApiRequest`.**

The current implementation (around lines 147–170) reads the request body, parses JSON, and injects `{ siteSlug: resolvedSiteSlug, ...parsed }` when `shouldIncludeSiteSlug` is true. This entire block must be deleted — not just the parameter names. After the edit, the function reads the body once and passes it through unchanged.

The new implementation:

```typescript
export async function proxyInternalApiRequest({
  request,
  cookies,
  pathname,
  method,
  requireAuth = true,
}: {
  request: Request;
  cookies: AstroCookies;
  pathname: string;
  method?: string;
  requireAuth?: boolean;
}) {
  if (requireAuth && !isAuthenticated(cookies)) return jsonUnauthorized();
  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  const resolvedMethod = method ?? request.method;
  const headers = cloneForwardHeaders(request.headers, request.headers.get('cookie'));
  let body: string | undefined;
  if (resolvedMethod !== 'GET' && resolvedMethod !== 'HEAD') {
    body = await request.text();
  }
  const response = await fetch(targetUrl, {
    method: resolvedMethod,
    headers,
    body,
    redirect: 'manual',
  });
  return new Response(response.body, {
    status: response.status,
    headers: cloneResponseHeaders(response.headers),
  });
}
```

- [ ] **Remove `includeSiteSlug`, `useAdminActiveSite`, and the body-injection block from `fetchInternalApiJson`.**

The current function (around lines 185–240) also injects `{ siteSlug: resolvedSiteSlug, ...(body ?? {}) }` into the request payload when `shouldIncludeSiteSlug` is true. Delete that entire block. After the edit, the function sends `body` unchanged.

The new implementation:

```typescript
export async function fetchInternalApiJson({
  request,
  pathname,
  method = 'GET',
  body,
  query,
}: {
  request: Request;
  pathname: string;
  method?: string;
  body?: Record<string, unknown> | null;
  query?: Record<string, string | number | boolean | null | undefined>;
}) {
  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue;
      targetUrl.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(targetUrl, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? null),
    redirect: 'manual',
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
```

- [ ] **Run TypeScript check for the shared lib.** The proxy files will all fail until Task 11. To check only this file in isolation:

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "internal-api" | head -5
```

Expected: errors will reference call sites (expected), not the file itself.

- [ ] **Commit:**

```bash
git add src/lib/internal-api.ts
git commit -m "feat: remove siteSlug injection infrastructure from internal-api.ts"
```

---

## Task 11: Frontend proxy files — remove includeSiteSlug (bulk)

**Files:**
- Modify: 76 files in `apps/client-przemyslawfilipiak/src/pages/api/**/*.ts`

This is a mechanical removal. Use sed to strip the `includeSiteSlug: true,` and `useAdminActiveSite: true,` flags from all proxy call sites.

- [ ] **Run the bulk removal** (requires GNU sed — Git Bash on Windows has it):

```bash
find "apps/client-przemyslawfilipiak/src/pages/api" -name "*.ts" -exec sed -i \
  -e 's/,\s*includeSiteSlug:\s*true//g' \
  -e 's/includeSiteSlug:\s*true,\s*//g' \
  -e 's/includeSiteSlug:\s*true//g' \
  -e 's/,\s*useAdminActiveSite:\s*true//g' \
  -e 's/useAdminActiveSite:\s*true,\s*//g' \
  -e 's/useAdminActiveSite:\s*true//g' \
  {} \;
```

- [ ] **Verify no `includeSiteSlug` or `useAdminActiveSite` references remain:**

```bash
grep -r "includeSiteSlug\|useAdminActiveSite" apps/client-przemyslawfilipiak/src/pages/api/
```

Expected: no output (zero matches).

- [ ] **Update `apps/client-przemyslawfilipiak/src/pages/api/auth.ts`** — this file has one confirmed `includeSiteSlug: true` occurrence. If the `sed` command above didn't catch it (e.g. different whitespace), remove it manually.

- [ ] **Run TypeScript check for the client app:**

```bash
cd apps/client-przemyslawfilipiak && npx tsc --noEmit
```

Expected: errors only related to `normalizeScopedSiteSlug` usage in `Base.astro` (fixed in Task 13). No errors in `/pages/api/` files.

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/pages/api/
git commit -m "feat: remove includeSiteSlug from all Astro proxy call sites"
```

---

## Task 12: Frontend — replace switch-site.ts with switch-tenant.ts

**Files:**
- Delete: `apps/client-przemyslawfilipiak/src/pages/api/admin/switch-site.ts`
- Create: `apps/client-przemyslawfilipiak/src/pages/api/admin/switch-tenant.ts`

- [ ] **Delete the old file:**

```bash
rm apps/client-przemyslawfilipiak/src/pages/api/admin/switch-site.ts
```

- [ ] **Create the new file** `apps/client-przemyslawfilipiak/src/pages/api/admin/switch-tenant.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getInternalApiBaseUrl, isAuthenticated, jsonUnauthorized, JSON_HEADERS } from '@/lib/internal-api';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  const body = await request.json().catch(() => ({}));
  const siteSlug = typeof body.siteSlug === 'string' ? body.siteSlug.trim() : '';
  if (!siteSlug) {
    return new Response(JSON.stringify({ error: 'siteSlug is required' }), { status: 400, headers: JSON_HEADERS });
  }

  const apiBase = getInternalApiBaseUrl();
  const response = await fetch(`${apiBase}/v1/auth/set-tenant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify({ siteSlug }),
  });

  const data = await response.json().catch(() => null);
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: JSON_HEADERS,
  });
};
```

- [ ] **TypeScript check:**

```bash
cd apps/client-przemyslawfilipiak && npx tsc --noEmit 2>&1 | grep switch
```

Expected: no errors for switch-tenant.ts.

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/pages/api/admin/switch-tenant.ts
git rm apps/client-przemyslawfilipiak/src/pages/api/admin/switch-site.ts
git commit -m "feat: replace switch-site cookie endpoint with switch-tenant server endpoint"
```

---

## Task 13: Frontend — update middleware to pass activeSiteSlug to locals

**Files:**
- Modify: `apps/client-przemyslawfilipiak/src/middleware.ts`

The middleware already calls `GET /v1/auth/me`. Extend it to:
1. Store `activeSiteSlug` in `context.locals`
2. Redirect to `/admin/select-tenant` if admin page and `activeSiteId` is null

- [ ] **Update `middleware.ts`:**

```typescript
import { defineMiddleware } from 'astro:middleware';
import { getInternalApiBaseUrl } from '@/lib/internal-api';

export const onRequest = defineMiddleware(async (context: any, next: any) => {
  const pathname = context.url.pathname;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = context.cookies.get('session')?.value;

    if (!token) {
      return context.redirect('/admin/login');
    }

    try {
      const apiBase = getInternalApiBaseUrl();
      const response = await fetch(`${apiBase}/v1/auth/me`, {
        headers: { cookie: `session=${encodeURIComponent(token)}` },
      });

      if (!response.ok) {
        context.cookies.delete('session', { path: '/' });
        return context.redirect('/admin/login');
      }

      const data = await response.json();
      if (!data.authenticated) {
        context.cookies.delete('session', { path: '/' });
        return context.redirect('/admin/login');
      }

      // Store active tenant in locals for use by pages and layouts
      context.locals.activeSiteSlug = data.session?.activeSiteSlug ?? null;
      context.locals.activeSiteId = data.session?.activeSiteId ?? null;

      // Redirect to tenant picker if no active tenant selected
      // (but not if already on the select-tenant page)
      if (!context.locals.activeSiteId && pathname !== '/admin/select-tenant') {
        return context.redirect('/admin/select-tenant');
      }
    } catch {
      return context.redirect('/admin/login');
    }
  }

  return next();
});
```

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/middleware.ts
git commit -m "feat: pass activeSiteSlug from session to Astro locals in middleware"
```

---

## Task 14: Frontend — create tenant picker page

**Files:**
- Create: `apps/client-przemyslawfilipiak/src/pages/admin/select-tenant.astro`

- [ ] **Create the tenant picker page:**

```astro
---
import Base from '@/components/layouts/Base.astro';
---

<Base title="Select Tenant — Admin">
  <main style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1.5rem;">
    <h1 style="font-size:1.5rem;color:#e2e8f0;">Select active tenant</h1>
    <p style="color:#94a3b8;">Choose which brand you want to manage in this session.</p>
    <div id="tenant-picker" style="display:flex;flex-direction:column;gap:0.75rem;width:100%;max-width:320px;">
      <button data-slug="przemyslawfilipiak" class="tenant-btn">PrzemyslawFilipiak</button>
      <button data-slug="focusequalsfreedom" class="tenant-btn">FocusEqualsFreedom</button>
      <button data-slug="frinter" class="tenant-btn">Frinter</button>
    </div>
    <p id="tenant-error" style="color:#f87171;display:none;"></p>
  </main>
  <style>
    .tenant-btn {
      padding: 0.75rem 1.25rem;
      background: rgba(74,141,131,0.15);
      border: 1px solid rgba(74,141,131,0.4);
      border-radius: 0.5rem;
      color: #e2e8f0;
      font-size: 1rem;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    .tenant-btn:hover { background: rgba(74,141,131,0.3); }
  </style>
  <script is:inline>
    document.getElementById('tenant-picker')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-slug]');
      if (!btn) return;
      const siteSlug = btn.dataset.slug;
      btn.textContent = 'Switching...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/admin/switch-tenant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ siteSlug }),
        });
        if (res.ok) {
          window.location.assign('/admin');
        } else {
          const data = await res.json().catch(() => ({}));
          document.getElementById('tenant-error').textContent = data.error ?? 'Switch failed';
          document.getElementById('tenant-error').style.display = '';
          btn.textContent = siteSlug;
          btn.disabled = false;
        }
      } catch {
        document.getElementById('tenant-error').textContent = 'Network error';
        document.getElementById('tenant-error').style.display = '';
        btn.textContent = siteSlug;
        btn.disabled = false;
      }
    });
  </script>
</Base>
```

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/pages/admin/select-tenant.astro
git commit -m "feat: add admin tenant picker page for sessions without active tenant"
```

---

## Task 15: Frontend — update Base.astro tenant selector

**Files:**
- Modify: `apps/client-przemyslawfilipiak/src/components/layouts/Base.astro`

- [ ] **Update the frontmatter import** — remove `normalizeScopedSiteSlug` import (it's being deleted):

```typescript
// BEFORE
import { absoluteUrl, getSitePresentation } from '@/lib/site-config';
import { normalizeScopedSiteSlug } from '@/lib/internal-api';

// AFTER
import { absoluteUrl, getSitePresentation } from '@/lib/site-config';
```

- [ ] **Replace the `adminActiveSite` computation:**

```typescript
// BEFORE
const adminActiveSite = isAdminPage
  ? normalizeScopedSiteSlug(Astro.cookies.get('frinter_admin_site')?.value, 'przemyslawfilipiak')
  : 'przemyslawfilipiak';

// AFTER
const adminActiveSite = isAdminPage ? (Astro.locals.activeSiteSlug ?? null) : null;
```

- [ ] **Update the `<select>` element** to reflect that `adminActiveSite` may now be `null`:

```html
<select
  id="admin-site-switcher-select"
  class="admin-site-switcher__select"
  data-current-site={adminActiveSite ?? ''}
>
  <option value="przemyslawfilipiak" selected={adminActiveSite === 'przemyslawfilipiak'}>PrzemyslawFilipiak</option>
  <option value="focusequalsfreedom" selected={adminActiveSite === 'focusequalsfreedom'}>FocusEqualsFreedom</option>
  <option value="frinter" selected={adminActiveSite === 'frinter'}>Frinter</option>
</select>
```

- [ ] **Replace the inline `<script>** that called `/api/admin/switch-site` with a POST call to `/api/admin/switch-tenant`:

```html
<script is:inline>
  (() => {
    const root = document.querySelector('[data-admin-site-switcher]');
    const select = document.getElementById('admin-site-switcher-select');
    if (!root || !(select instanceof HTMLSelectElement)) return;
    select.addEventListener('change', async () => {
      const siteSlug = select.value;
      const originalValue = select.dataset.currentSite;
      select.disabled = true;
      try {
        const res = await fetch('/api/admin/switch-tenant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ siteSlug }),
        });
        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.error ?? 'Failed to switch tenant');
          select.value = originalValue || '';
          select.disabled = false;
        }
      } catch {
        alert('Network error switching tenant');
        select.value = originalValue || '';
        select.disabled = false;
      }
    });
  })();
</script>
```

- [ ] **Run full TypeScript check:**

```bash
cd apps/client-przemyslawfilipiak && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/components/layouts/Base.astro
git commit -m "feat: update admin tenant selector to use server-side session"
```

---

## Task 15a: Declare Astro.locals types

**Files:**
- Modify: `apps/client-przemyslawfilipiak/src/env.d.ts`

`Astro.locals.activeSiteSlug` and `activeSiteId` are set in `middleware.ts` and read in `Base.astro`. Without a type declaration TypeScript will error in strict mode.

- [ ] **Open `apps/client-przemyslawfilipiak/src/env.d.ts`** and add or extend the `App.Locals` interface:

```typescript
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    activeSiteSlug: string | null;
    activeSiteId: number | null;
  }
}
```

If the file already contains a `/// <reference types="astro/client" />` line, keep it and only add the `namespace App` block.

- [ ] **TypeScript check:**

```bash
cd apps/client-przemyslawfilipiak && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Commit:**

```bash
git add apps/client-przemyslawfilipiak/src/env.d.ts
git commit -m "chore: declare Astro locals types for activeSiteSlug"
```

---

## Task 16: Build verification

- [ ] **Run full build to catch any remaining issues:**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript or import errors.

- [ ] **If build fails**, read the error output carefully. Most likely causes:
  - A call site in a proxy file still has `includeSiteSlug: true` — re-run the grep check from Task 11
  - A route file still references `normalizeSiteSlug(url.searchParams.get('siteSlug'))` for an admin route — find and remove
  - A TypeScript type error in `Astro.locals` — add a locals type declaration if needed

- [ ] **Declare `Astro.locals` types** if TypeScript complains about `Astro.locals.activeSiteSlug`. Create or update `apps/client-przemyslawfilipiak/src/env.d.ts`:

```typescript
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    activeSiteSlug: string | null;
    activeSiteId: number | null;
  }
}
```

- [ ] **Final commit if env.d.ts was added:**

```bash
git add apps/client-przemyslawfilipiak/src/env.d.ts
git commit -m "chore: declare Astro locals types for activeSiteSlug"
```

---

## Task 17: Smoke test checklist

Manual verification steps after deploy (or against local dev server):

- [ ] **Login** at `/admin/login` → expect redirect to `/admin/select-tenant` (activeSiteId is null for new session)
- [ ] **Select a tenant** on `/admin/select-tenant` → expect redirect to `/admin` showing that tenant's data
- [ ] **Switch tenant** via the dropdown in the bottom-right corner → expect page reload with new tenant's data
- [ ] **Verify cross-tenant isolation**: with tenant A selected, manually call `GET /api/articles` — response data must belong to tenant A only
- [ ] **Verify old cookie is ignored**: set `frinter_admin_site=frinter` cookie manually in browser devtools → reload admin → tenant shown in UI must still come from server session, not the cookie
- [ ] **Logout and log back in** → expect tenant picker again (session is fresh, activeSiteId is null)

---

## Rollback

If anything goes wrong post-deploy:

```bash
git revert HEAD~<N>  # revert the relevant commits
npm run db:push      # activeSiteId column stays (nullable, harmless) — no need to drop it
```

The `activeSiteId` column is nullable and referenced by no other logic — leaving it in the DB after rollback causes no harm.
