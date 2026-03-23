## Context

The repository currently uses a distributed multi-tenant runtime: public client identity comes from `SITE_SLUG`, while admin requests are proxied from three Astro clients into one central API. The database tenant model is correct because rows are scoped by `site_id`, but the admin panel has leaked cross-tenant data because active tenant state has been reconstructed from client-side state such as host-local cookies, request host assumptions, and fallback `SITE_SLUG` behavior.

This change affects auth, admin routing, all tenant-aware admin modules, and the client BFF layer. It is cross-cutting, involves session data model changes, and directly addresses a security/isolation issue: an authenticated admin must never see articles or other admin data from the wrong tenant.

Stakeholders:
- the operator using one admin account across multiple brand tenants
- API routes that currently trust request-scoped `siteSlug` input
- admin modules for articles, GEO, content gaps, knowledge base, Reddit, YouTube, Brand Clarity, and Social Hub

## Goals / Non-Goals

**Goals:**
- Make server-side admin session state the only source of truth for active tenant context
- Ensure admin reads and writes are scoped from session state, not from request cookies, host inference, or `SITE_SLUG`
- Preserve `SITE_SLUG` behavior for public builds and public runtime content
- Standardize tenant resolution so every admin route follows one helper path
- Eliminate cross-host inconsistencies when the same admin session is used through different client domains

**Non-Goals:**
- Replacing the existing auth transport mechanism in this change
- Changing public article/content fetching behavior
- Redesigning admin UI beyond the minimum selector flow needed to switch active tenant
- Refactoring unrelated module logic beyond tenant resolution

## Decisions

### Decision: Store active tenant in the server session

Admin tenant context will be persisted in the backend session record, preferably as `activeSiteId` on `sessions`.

Why:
- `site_id` is the database scoping key already used by tenant-aware tables
- it avoids repeated slug-to-id resolution on every query path
- it removes host-local tenant state as a source of truth

Alternatives considered:
- Store `activeSiteSlug` in `sessions`
  - simpler to inspect, but requires repeated site lookup before DB access
- Store active tenant in a separate `admin_session_state` table
  - cleaner separation of concerns, but adds extra complexity and joins without solving the isolation problem better
- Keep using client cookie state
  - rejected because it is the current leak vector

### Decision: Split public and admin tenant resolution completely

Public runtime SHALL continue to use `SITE_SLUG`. Admin runtime SHALL use only the authenticated server session’s active tenant.

Why:
- public requests and admin requests solve different problems
- mixing these sources creates fallback paths that leak tenant data

Alternatives considered:
- continue allowing admin fallback to `SITE_SLUG`
  - rejected because it silently changes tenant scope depending on deployment host

### Decision: Require explicit tenant selection for admin scope

Admin routes will resolve tenant from session state. If no active tenant is set, tenant-aware admin routes will fail with an explicit error state rather than falling back to host or cookie-derived tenant context.

Why:
- explicit failure is safer than silent cross-tenant reads
- it surfaces incomplete state immediately

Alternatives considered:
- set a default tenant automatically at login
  - simpler UX, but it reintroduces hidden assumptions and can surprise operators

### Decision: Move tenant switching to a server-side action

The admin tenant selector will call a backend endpoint to update the active tenant in the authenticated session. The backend will validate the selected slug/id and persist it before the next admin read.

Why:
- the server becomes the only authority for active tenant
- it removes the need for domain-local tenant cookies

Alternatives considered:
- keep a client-only selector and forward `siteSlug` on each request
  - rejected because request payloads are not trustworthy as the long-term source of tenant context

### Decision: Standardize admin route resolution helpers

All tenant-aware admin routes will migrate to one helper path equivalent to:

```text
requireAuthSession()
-> requireActiveSiteFromSession()
-> resolve site
-> scope query by site.id
```

Why:
- inconsistent helper usage is how leaks survive in secondary routes such as status, stream, and polling endpoints
- one helper makes audits and regressions easier

Alternatives considered:
- patch only articles and other currently failing routes
  - rejected because it leaves the same architectural leak available elsewhere

## Risks / Trade-offs

- [Existing sessions have no active tenant] → Migrate sessions with `activeSiteId = null` and require explicit tenant selection after deploy
- [Some admin endpoints may still trust request `siteSlug`] → Perform a full helper migration across every tenant-aware module, including stream/status/polling endpoints
- [UI friction from explicit tenant selection] → keep the selector globally visible in admin and make “active tenant missing” a clear recoverable state
- [Long-lived frontend assumptions about tenant cookies] → remove or deprecate tenant-cookie logic only after all admin reads use session-scoped tenant context
- [Session record now carries UI-affecting state] → accept the coupling because isolation correctness is more important than strict separation here

## Migration Plan

1. Add `activeSiteId` to `sessions` and deploy the schema safely with nullable default.
2. Extend auth endpoints so `GET /v1/auth/me` returns active tenant state and add a dedicated endpoint to update it.
3. Introduce shared server helpers for authenticated active-tenant resolution.
4. Migrate tenant-aware admin routes module by module to use session-scoped tenant resolution.
5. Update admin selector flow to call the new server endpoint rather than storing tenant state client-side.
6. Remove fallback admin tenant resolution through client cookies/host logic once all routes use the new helper.
7. Run regression checks across all three client domains using the same admin account.

Rollback strategy:
- revert route resolution to the previous model only if migration blocks access entirely
- do not keep mixed routing modes longer than necessary because dual sources of truth increase leak risk

## Open Questions

- Should login leave `activeSiteId` null or accept an optional initial tenant selection in the login flow?
- Should non-tenant-specific admin pages be accessible before a tenant is selected, or should the entire admin redirect into a tenant picker state?
- Does any Social Hub or Brand Clarity sub-route intentionally support cross-tenant/global reads that need an explicit exception?
