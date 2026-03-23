# Admin Tenant Session — Design

**Date:** 2026-03-23
**Scope:** Admin panel only. Public build (SITE_SLUG) is untouched. Only `client-przemyslawfilipiak` has admin pages — `client-focusequalsfreedom` and `client-frinter` require no changes.

## Problem

Admin panel resolves the active tenant from a browser cookie (`frinter_admin_site`) written client-side by `/api/admin/switch-site`. The Astro proxy layer reads this cookie via `resolveScopedSiteSlugForRequest` and injects `siteSlug` into every proxied admin request. Since sessions are created with `siteId = null` (unrestricted), any authenticated admin can read any tenant's data by manipulating the cookie. This is a cross-tenant data leak.

## Goal

Make `session.activeSiteId` the single source of truth for which tenant an admin is currently operating on. Admin routes must never resolve tenant from request params, cookies, or host inference.

## Out of Scope

- Public article/content fetching (stays on SITE_SLUG)
- Auth transport mechanism
- Admin UI beyond the tenant selector
- Multi-tab simultaneous tenant support (not needed: one tab, one session)

## Decision: Option A — Server session stores activeSiteId

Chosen over:
- **Option B** (request header + session allowlist): client still controls selection, adds no real security gain, frontend still needs to persist choice somewhere
- **Option C** (site-scoped login): terrible UX, must log out to switch tenant

---

## 1. Schema Change

Add to `sessions` table:

```sql
activeSiteId  integer  NULL  references sites(id)
```

- Nullable — existing sessions have no active tenant; this is valid state
- Distinct from existing `siteId` field (which scopes the session at login time; stays untouched)
- No data migration needed — null is the correct initial state for all existing sessions

---

## 2. Backend: New and Modified Endpoints

### POST /v1/auth/set-tenant (new)

```
Auth: required (any valid non-expired session)
Body: { siteSlug: string }
Response: { ok: true, activeSiteId: number, siteSlug: string }
Error: 404 if slug not found
```

Validates slug → resolves `site.id` → `UPDATE sessions SET activeSiteId = site.id WHERE token = ...` → returns new state.

**Auth scope rule:** Any valid session may call this endpoint with any registered site slug, because sessions are currently created with `siteId = null` (unrestricted). If a session has a non-null `siteId` (scoped session), the requested slug must resolve to a site whose id matches `session.siteId`; otherwise return `403 Forbidden`.

### GET /v1/auth/me (extended)

New response shape (must be deployed atomically with frontend changes):

```json
{
  "authenticated": true,
  "session": {
    "id": 1,
    "siteId": null,
    "activeSiteId": 3,
    "activeSiteSlug": "przemyslawfilipiak",
    "expiresAt": "2026-03-30T00:00:00.000Z"
  }
}
```

`activeSiteId` and `activeSiteSlug` are `null` when no active tenant is selected.

---

## 3. Backend: New Helper

### `requireActiveSite(req, res)`

Replaces `resolveAuthedSite` in all admin routes:

```typescript
async function requireActiveSite(req, res): Promise<{ session, site } | null>
```

Steps:
1. `requireAuth(req, res)` — validates session cookie; returns null + 401 if invalid
2. Check `session.activeSiteId` — if null, return `403 { error: 'No active tenant selected' }`
3. `getSiteById(session.activeSiteId)` — if not found, return `404 { error: 'Active tenant not found' }`
4. Return `{ session, site }`

### Compound helpers — updated signatures

Three compound helpers in `helpers.ts` currently accept a `siteSlug` argument and call `resolveAuthedSite` internally. All three must be updated to call `requireActiveSite` instead and drop the `siteSlug` parameter:

```typescript
// before
resolveShSite(req, res, siteSlug)             // ~16 call sites in social-hub.ts
resolveBcProjectContext(req, res, siteSlug, projectId)  // ~20 call sites in brand-clarity.ts
resolveShBriefContext(req, res, siteSlug, briefId)      // call sites in social-hub.ts

// after
resolveShSite(req, res)
resolveBcProjectContext(req, res, projectId)
resolveShBriefContext(req, res, briefId)
```

All call sites in `brand-clarity.ts` and `social-hub.ts` must be updated accordingly.

---

## 4. Backend: Admin Route Migration

Every admin route that currently does:

```typescript
const context = await resolveAuthedSite(req, res, normalizeSiteSlug(url.searchParams.get('siteSlug')));
// or
const context = await resolveAuthedSite(req, res, normalizeSiteSlug(body.siteSlug));
```

migrates to:

```typescript
const context = await requireActiveSite(req, res);
```

`siteSlug` is removed from admin route query params and request bodies. Affected modules:
- articles, content-gaps, knowledge, GEO, Reddit, YouTube, Brand Clarity, Social Hub
- jobs: `/v1/jobs/latest` and `/v1/jobs/active` (list/query endpoints) — migrate to `requireActiveSite`; single job fetch by id (`/v1/jobs/:id`) resolves from `job.siteId` and is exempt

### Long-running jobs and streams

Jobs (GEO, Reddit, YouTube, Brand Clarity, Social Hub streams) store their `siteId` in the `appJobs` record at the time they are enqueued. **Stream and status polling endpoints do NOT use `requireActiveSite`** — they resolve the site from the job record (`appJobs.siteId`), not from session. This means a running job continues to completion even if the admin switches tenant or their session expires while the job is running.

---

## 5. Frontend: `src/lib/internal-api.ts`

### Remove siteSlug injection infrastructure

The following functions/logic must be removed or replaced:

- `resolveAdminActiveSiteSlug` — reads `frinter_admin_site` cookie; delete entirely
- `resolveScopedSiteSlugForRequest` — auto-injects siteSlug for any `/api/` path; delete entirely
- `createAdminActiveSiteCookie` — creates the client-side cookie; delete entirely
- `ADMIN_ACTIVE_SITE_COOKIE` constant — delete
- `includeSiteSlug` parameter from `proxyInternalApiRequest` — remove from signature and all call sites
- `useAdminActiveSite` parameter from both `proxyInternalApiRequest` and `fetchInternalApiJson` — remove from signatures and all call sites
- The `siteSlug` auto-injection block in `buildInternalApiUrl` for social-hub routes (lines 98-100) — remove
- `normalizeScopedSiteSlug` — its three consumers (`switch-site.ts`, `Base.astro`, `createAdminActiveSiteCookie`) are all removed by this change; delete the function

After these removals, `proxyInternalApiRequest` and `fetchInternalApiJson` simply forward requests without injecting any tenant context. The backend reads tenant from session.

### Update all Astro proxy call sites

Every `pages/api/**/*.ts` file in `client-przemyslawfilipiak` that passes `includeSiteSlug: true` must have that flag removed. This is approximately 90 files. All admin proxy calls become:

```typescript
proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/...' })
```

---

## 6. Frontend: Tenant Selector

### Remove `/api/admin/switch-site`

`apps/client-przemyslawfilipiak/src/pages/api/admin/switch-site.ts` currently sets the `frinter_admin_site` cookie via a redirect. This file must be deleted.

### New switch-site endpoint

Replace with a new Astro API endpoint that proxies to `POST /v1/auth/set-tenant`:

```
POST /api/admin/switch-tenant
Body: { siteSlug: string }
→ proxies to POST /v1/auth/set-tenant
→ on success (200): client hard-reloads the admin page
→ on error (4xx): surface error message in UI, stay on current page (no reload)
```

Hard reload is intentional — all tenant-scoped data (articles, GEO, etc.) must refresh after a tenant switch.

### Base.astro

Remove:
```typescript
const adminActiveSite = normalizeScopedSiteSlug(
  Astro.cookies.get('frinter_admin_site')?.value,
  'przemyslawfilipiak'
);
```

Replace with: active tenant comes from `GET /v1/auth/me` response (SSR call at render time), reading `session.activeSiteSlug`.

---

## 7. "No Active Tenant" State

When `activeSiteId = null` (new session or migrated old session):
- `GET /v1/auth/me` returns `activeSiteId: null, activeSiteSlug: null`
- Frontend renders a tenant picker screen instead of the dashboard
- This is a recoverable state, not an error
- Clear CTA to select a tenant — calls `POST /api/admin/switch-tenant`

---

## 8. Migration Safety

- Schema: `activeSiteId` column is nullable — safe to add without downtime, no data migration
- Existing sessions: `activeSiteId = null` → admin sees tenant picker on next visit
- Deployment order: schema first, then API, then frontend (atomic deploy is preferred)
- `frinter_admin_site` cookie: stops being written after this change; can be cleared on logout for hygiene but is ignored from deploy day onward

---

## 9. Rollback

- Revert via git (`git revert` covers all changes atomically — frontend proxy flags, `internal-api.ts`, `Base.astro`, `switch-site.ts`, backend helpers, route migrations)
- Drop `activeSiteId` column or leave it nullable (no harm either way)
- Ensure `frinter_admin_site` cookie write is restored in the tenant selector component
