## Why

The current admin tenant model reconstructs tenant context from client-side state, which has already led to cross-tenant data exposure in the admin panel even though the database is correctly scoped by `site_id`. We need one server-side source of truth for the active admin tenant so article, GEO, Reddit, YouTube, Brand Clarity, and Social Hub data cannot leak across tenants depending on host, cookie state, or fallback logic.

## What Changes

- Introduce a server-side admin session model that stores the active tenant in the backend session record rather than in client-side tenant cookies.
- Add an explicit admin tenant-switch action that updates the active tenant in the authenticated session.
- Change admin API routes to resolve tenant scope from the server session instead of trusting request query/body `siteSlug` values or host-derived fallbacks.
- Remove admin tenant-selection behavior that depends on per-domain browser cookies.
- Standardize admin session reads so every tenant-aware admin module uses the same active-tenant resolution path.

## Capabilities

### New Capabilities
- `admin-tenant-session`: Global admin sessions with a server-stored active tenant used as the only source of truth for admin tenant scoping.

### Modified Capabilities
- None.

## Impact

- Affected backend auth/session handling in `apps/api/src/routes/auth.ts` and `apps/api/src/helpers.ts`
- Affected tenant-aware admin routes across articles, content gaps, knowledge base, GEO, Reddit, YouTube, Brand Clarity, and Social Hub
- Affected client BFF/proxy behavior in `src/lib/internal-api.ts` and admin selector UX in `apps/client-*/src/components/layouts/Base.astro`
- Requires a schema change to persist active tenant state in server sessions
- Removes the need for admin tenant cookies as a routing source of truth
