## ADDED Requirements

### Requirement: Admin tenant scope SHALL be resolved from server session state
The system SHALL resolve the active tenant for tenant-aware admin reads and writes from authenticated server-side session state rather than from client cookies, request host, or `SITE_SLUG`.

#### Scenario: Tenant-aware admin read uses active tenant from session
- **WHEN** an authenticated admin session has an active tenant set and requests a tenant-aware admin route
- **THEN** the backend resolves tenant scope from the session’s active tenant state

#### Scenario: Request payload tenant hints do not override session tenant
- **WHEN** an authenticated admin request includes a `siteSlug` or equivalent tenant hint that differs from the session’s active tenant
- **THEN** the backend uses the session’s active tenant for tenant scoping

### Requirement: Tenant-aware admin routes SHALL fail closed without an active tenant
The system SHALL reject tenant-aware admin reads and writes when an authenticated admin session does not have an active tenant selected.

#### Scenario: Missing active tenant blocks tenant-aware admin access
- **WHEN** an authenticated admin session without an active tenant requests a tenant-aware admin route
- **THEN** the system returns an explicit error indicating that no active tenant is selected

### Requirement: Admins SHALL be able to switch the active tenant explicitly
The system SHALL provide a server-side admin action that updates the active tenant for the authenticated admin session.

#### Scenario: Successful active tenant switch
- **WHEN** an authenticated admin submits a valid tenant selection
- **THEN** the backend persists that tenant as the active tenant for the current session

#### Scenario: Invalid active tenant switch is rejected
- **WHEN** an authenticated admin submits a tenant slug or identifier that does not correspond to a valid site
- **THEN** the backend rejects the change and preserves the existing active tenant state

### Requirement: Active tenant state SHALL be consistent across admin client hosts
The system SHALL use one server-side session tenant context so the same authenticated admin sees the same tenant-scoped data regardless of which client domain is used to access the admin panel.

#### Scenario: Same session on different client domains resolves the same tenant
- **WHEN** the same authenticated admin session accesses tenant-aware admin routes through different client domains
- **THEN** each domain returns data scoped to the same active tenant stored in the server session

### Requirement: Public tenant identity SHALL remain independent from admin tenant state
The system SHALL continue to resolve public content and public builds from `SITE_SLUG`, independent of admin session tenant selection.

#### Scenario: Public content remains tied to deployment site slug
- **WHEN** a public route is rendered for a deployed client
- **THEN** the public content scope is resolved from that client’s `SITE_SLUG` rather than from admin session state
