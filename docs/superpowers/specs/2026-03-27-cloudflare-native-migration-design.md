# Cloudflare Native Migration — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Goal:** Migrate the current multi-tenant FrinterHero runtime to a Cloudflare-native architecture while keeping one shared PostgreSQL database as the system of record.

## Scope

This design covers:

- one shared backend for all tenants
- three tenant surfaces:
  - `przemyslawfilipiak`
  - `focusequalsfreedom`
  - `frinter`
- one shared PostgreSQL database
- full Cloudflare-native runtime for frontend, backend, async orchestration, and object storage

This design does not include:

- changing the domain data model
- splitting the database per tenant
- migrating from PostgreSQL to Cloudflare D1
- the later move from Railway Postgres to Neon

## Current Repository Context

The current architecture is a distributed monorepo with:

- central backend in `apps/api`
- three client runtimes in `apps/client-*`
- queue-driven workers in `workers/*`
- shared backend/domain code in root `src/*`
- one shared PostgreSQL database

The current architecture already enforces the right product boundary:

- one backend
- three tenant-facing clients
- one shared database

The migration should preserve these invariants while changing the runtime platform from Railway-oriented Node services to Cloudflare-native services.

## Target Architecture

The target runtime is:

- one primary Cloudflare Worker application runtime
- one shared PostgreSQL database accessed through Cloudflare Hyperdrive
- Cloudflare Queues for async ingress
- Cloudflare Workflows for durable multi-step orchestration
- Cloudflare R2 for binary/object storage
- Durable Objects only where single-instance coordination is required

High-level topology:

```text
Browser
  -> Cloudflare Worker app/backend
      -> Hyperdrive
          -> PostgreSQL

Browser / API action
  -> Cloudflare Worker app/backend
      -> Queue
          -> Workflow / queue consumer
              -> PostgreSQL
              -> R2
              -> external APIs
```

## Architecture Decisions

### 1. One shared backend

The repository keeps one shared backend runtime for all tenants.

The Cloudflare Worker app/backend owns:

- auth
- tenant resolution
- admin API
- public API
- orchestration entrypoints
- job status reads
- SSR/BFF integration points for tenant apps

This preserves the current invariant that there is only one DB-backed backend.

### 2. Three tenants, one system

The three tenant applications remain distinct at the product and routing level, but not as independent backend deployments.

Tenant identity is resolved from request context such as:

- hostname
- domain mapping
- `siteSlug`

Tenant context must resolve early in request handling and propagate through:

- auth
- DB queries
- queue payloads
- workflow payloads
- object storage paths

All async payloads must carry explicit tenant context.

### 3. PostgreSQL remains the system of record

The system keeps one shared PostgreSQL database for all domain data.

Rules:

- PostgreSQL remains the canonical source of truth
- tenant isolation continues through `siteId` and `siteSlug`
- Durable Objects are not used as the primary data store
- R2 is not used as the primary source of business truth

Cloudflare access to PostgreSQL should go through Hyperdrive to support edge execution while keeping the DB external to Cloudflare.

### 4. Workers for request-time behavior

Cloudflare Workers should own all short-lived request/response logic:

- auth/session validation
- tenant resolution
- CRUD endpoints
- dashboard reads
- admin API routes
- public API routes
- enqueue operations
- SSR/BFF request handling
- webhook endpoints

Anything expected to finish quickly and return directly to the caller belongs in the Worker runtime.

### 5. Workflows for long-running orchestration

Cloudflare Workflows should own all multi-step or retry-heavy execution.

Target modules for workflow-based execution:

- Brand Clarity pipelines
- GEO runs
- Reddit runs
- YouTube runs
- Social Hub generate/render/publish flows
- any process currently represented as a long-running `app_jobs` execution with intermediate states

Use a workflow when a process has one or more of these traits:

- multiple steps
- waits or polling
- retry policy
- external dependency coordination
- fan-out/fan-in behavior

### 6. Queues for decoupling ingress from execution

Cloudflare Queues should be the handoff layer between synchronous requests and asynchronous processing.

Queues should:

- absorb bursts
- decouple user requests from execution
- carry lightweight job identifiers and scope
- trigger queue consumers or workflow starts

Queues should not become the primary place for business logic.

### 7. R2 for artifacts and binary storage

Cloudflare R2 should store:

- rendered images
- generated video assets
- exports
- screenshots
- intermediary files
- large payload snapshots when retention is useful

PostgreSQL should keep:

- metadata
- references
- processing state
- business results

### 8. Durable Objects only for coordination

Durable Objects should be optional and narrow in scope.

Valid use cases:

- one-active-run lock per site/project/topic
- per-run coordination state
- live progress coordination
- stream/session coordination for a single execution unit

Invalid use cases:

- primary tenant datastore
- replacing PostgreSQL tables
- general domain persistence

## Mapping Current Repository Components

### `apps/api`

`apps/api` becomes the primary source for the Cloudflare Worker app/backend.

Its route concerns should map into:

- Worker request handlers
- orchestration entrypoints
- queue producers
- workflow starters
- status/result readers

### `apps/client-przemyslawfilipiak`
### `apps/client-focusequalsfreedom`
### `apps/client-frinter`

These remain the tenant-facing UI surfaces, but no longer represent separate backend runtimes.

They should be treated as:

- tenant-specific rendering surfaces
- tenant-aware route and content shells
- consumers of the shared Worker app/backend

### `workers/*`

The current worker services should not be migrated mechanically as always-on service replicas.

Instead, their logic should be decomposed into:

- queue consumers
- workflow steps
- shared execution modules

Recommended direction:

- `workers/runner` logic informs queue/workflow execution plumbing
- topic-specific worker logic becomes workflow steps or short consumers

### `src/db`, `src/lib`, `src/utils`

These remain the shared core of the system.

They must be adapted for Workers compatibility by removing or isolating Node-specific runtime assumptions.

### `scripts/*`

Scripts should be split into two groups:

- runtime execution logic that should move into workflow or queue-executed shared modules
- operator tooling that should stay outside Workers

Operator tooling includes:

- schema migrations
- seeds
- backfills
- maintenance scripts

## Deployment Model

The target Cloudflare deployment model is:

- one primary Worker app/backend
- queue bindings for async ingress
- workflow definitions for durable orchestration
- R2 buckets for asset/object storage
- Hyperdrive binding to the shared PostgreSQL database
- environment-specific configuration for preview, staging, and production

The operational model should be one coordinated release system for backend and tenant routing, not separate backend services per tenant.

## Migration Strategy

The migration strategy is infrastructure-first.

Sequence:

1. Build the full Cloudflare infrastructure stack first.
2. Keep the current shared PostgreSQL database as the system of record.
3. Adapt the application runtime to Cloudflare while preserving the existing domain contracts.
4. Validate the new runtime against the same live data model.
5. Cut over traffic to Cloudflare after functional readiness.
6. Move the database provider later as a separate change from Railway to Neon.

This explicitly avoids mixing:

- runtime migration
- database provider migration

in the same delivery phase.

## Invariants To Preserve

The migration must preserve these invariants:

- one shared backend for all tenants
- one shared PostgreSQL database
- tenant scoping through `siteId` and `siteSlug`
- no direct client ownership of DB-backed backend logic
- no long-running execution in request lifecycle
- no Durable Objects as the primary business datastore

## Anti-Goals

The following are out of scope for this migration design:

- splitting into one backend per tenant
- replacing PostgreSQL with D1
- using Durable Objects as a substitute relational model
- storing primary business data in R2
- preserving the existing Railway service layout one-to-one on Cloudflare

## Risks and Design Constraints

### Runtime compatibility

Shared modules may currently assume Node APIs or process behavior that do not translate directly to Workers.

### Async boundary correctness

Tenant context must be preserved across queue and workflow boundaries. This must be explicit, not inferred.

### Storage discipline

Binary artifacts and large payloads must move out of PostgreSQL where appropriate, but metadata and business truth must remain relational.

### Migration discipline

The migration should not introduce opportunistic domain-model rewrites. Runtime migration and data-model redesign are separate concerns.

## Success Criteria

This design is successful when:

- all three tenant surfaces run through Cloudflare-native runtime paths
- one shared Cloudflare backend serves all tenants
- one shared PostgreSQL database remains the source of truth
- long-running jobs run through Cloudflare-native async primitives
- binary artifacts live in R2
- the system can later switch from Railway Postgres to Neon without major application redesign
