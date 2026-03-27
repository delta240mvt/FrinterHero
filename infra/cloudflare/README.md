# Cloudflare infrastructure

This directory contains environment templates and notes for the Cloudflare-native stack.

## Current runtime state

- `apps/api/wrangler.jsonc` — shared backend Worker entrypoint with all bindings:
  - **Hyperdrive** (`HYPERDRIVE`) — connection pooling for PostgreSQL
  - **Queue** (`JOB_QUEUE`) — producer and consumer for async job dispatch
  - **R2** (`ASSETS_BUCKET`) — storage for video/audio artifacts
  - **Workflows** — durable execution bindings for all pipelines:
    - `GEO_RUN_WORKFLOW`, `REDDIT_RUN_WORKFLOW`, `YOUTUBE_RUN_WORKFLOW`
    - `BC_SCRAPE_WORKFLOW`, `BC_PARSE_WORKFLOW`, `BC_SELECTOR_WORKFLOW`, `BC_CLUSTER_WORKFLOW`, `BC_GENERATE_WORKFLOW`
    - `SH_COPY_WORKFLOW`, `SH_VIDEO_WORKFLOW`, `SH_PUBLISH_WORKFLOW`
  - **Proxy** — `NODE_API_URL` secret for fallback to the Railway Node API
- `apps/api/src/cloudflare/env.ts` — validates required bindings at runtime
- `apps/api/src/cloudflare/index.ts` — Worker entrypoint with structured request/queue/error logging
- `apps/api/src/cloudflare/router.ts` — request routing to API handlers
- `apps/api/src/cloudflare/queues/` — queue batch handler, dispatches to workflow starters
- `apps/api/src/cloudflare/workflows/` — one Workflow class per pipeline topic

## Environment files

| File | Purpose |
|------|---------|
| `env/api.env.example` | Variables and bindings for the Worker (`apps/api`) |
| `env/client.env.example` | Variables for tenant Pages apps (`apps/client-*`) |

Copy the appropriate example to `.dev.vars` (Worker) or `.env` (Pages) for local development.

## Local verification

```bash
npm run test:api:cf      # unit tests for the Worker
npm run check:api:cf     # wrangler types config parse (no auth required)
```

## Full deployment runbook

See [`docs/deployment/cloudflare-native-migration-runbook.md`](../../docs/deployment/cloudflare-native-migration-runbook.md) for step-by-step deployment, secrets setup, verification endpoints, and rollback procedures.
