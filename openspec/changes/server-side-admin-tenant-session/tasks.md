## 1. Session Data Model

- [ ] 1.1 Add nullable `activeSiteId` to the `sessions` schema with a foreign key to `sites.id`
- [ ] 1.2 Prepare and verify the database migration/backfill path for existing sessions
- [ ] 1.3 Update session-facing types/helpers so active tenant state is available in backend auth flows

## 2. Auth and Active-Tenant APIs

- [ ] 2.1 Extend `POST /v1/auth/login` to create a global admin session compatible with server-side active tenant selection
- [ ] 2.2 Extend `GET /v1/auth/me` to return active tenant state for the authenticated session
- [ ] 2.3 Add a server-side endpoint to set the active tenant for the current authenticated admin session
- [ ] 2.4 Add a shared helper that requires auth and resolves the active tenant from the server session

## 3. Tenant-Aware Admin Route Migration

- [ ] 3.1 Migrate article admin routes to resolve tenant scope from the session active tenant
- [ ] 3.2 Migrate content gaps, knowledge base, and GEO admin routes to resolve tenant scope from the session active tenant
- [ ] 3.3 Migrate Reddit and YouTube admin routes, including status/stream/polling endpoints, to resolve tenant scope from the session active tenant
- [ ] 3.4 Migrate Brand Clarity and Social Hub admin routes to resolve tenant scope from the session active tenant

## 4. Client Admin Flow

- [ ] 4.1 Replace client-side tenant-cookie switching with a selector flow that calls the server-side active-tenant endpoint
- [ ] 4.2 Remove admin proxy logic that derives tenant scope from host-local tenant cookies
- [ ] 4.3 Ensure admin pages handle the “no active tenant selected” state explicitly and safely

## 5. Regression Coverage and Cleanup

- [ ] 5.1 Add backend tests for login, active-tenant switching, and session-based tenant resolution
- [ ] 5.2 Add regression tests covering cross-host admin access with one session and multiple tenant selections
- [ ] 5.3 Remove obsolete admin tenant-cookie logic and any admin fallback to `SITE_SLUG`
- [ ] 5.4 Verify public routes still resolve content only from deployment `SITE_SLUG`
