# Hono Routes Migration Design

**Date:** 2026-03-28
**Status:** Approved

## Goal

Complete the Cloudflare-native migration by replacing the remaining Node/Railway API routes with Hono-based handlers running entirely in the Cloudflare Worker. Remove Railway API dependency entirely.

## Context

Tasks 1–15 of the Cloudflare migration are complete. The Worker currently handles job enqueue/status for 3 topics plus falls back to the Node Railway API for all other routes (auth, admin, articles, brand-clarity, content-gaps, geo queries, knowledge, reddit management, sites, social-hub, youtube management, yolo). This design covers the final migration phase.

## Architecture

**Single Hono app** (`apps/api/src/cloudflare/app.ts`) replaces the manual `router.ts`. All 12 route families are ported as Hono routers mounted on the main app. The Worker entrypoint delegates `fetch` to `app.fetch(request, env, ctx)`. Queue and Workflow handlers remain unchanged.

**DB access pattern:** An `initDb` middleware initialises the Hyperdrive-backed Drizzle instance from `c.env.HYPERDRIVE` at the start of every request via `app.use('*', ...)`.

**Auth pattern:** Cookie-based session (`session` cookie) with PBKDF2-SHA256 password verification via `crypto.subtle`. The session is extracted in an `authMiddleware` and injected into `c.var.session`. Routes that require auth call `requireAuthMiddleware` which short-circuits with 401.

**No proxy:** `routes/proxy.ts` and `NODE_API_URL` are removed. All routes handled in Worker.

## Tech Stack

- **Hono** — HTTP routing framework for Cloudflare Workers
- **Drizzle ORM** — DB queries (unchanged, via Hyperdrive)
- **crypto.subtle** — PBKDF2-SHA256 password hashing (replaces `bcrypt`)
- **Cloudflare Workers** runtime — no Node APIs

## Route Families

| Router file | Endpoints |
|---|---|
| `routes/auth.ts` | POST login, POST set-tenant, GET me, POST logout |
| `routes/jobs.ts` | POST /v1/jobs/:topic (all 11), GET /v1/jobs/:id, GET /v1/jobs/:id/results |
| `routes/admin.ts` | GET /v1/admin/dashboard |
| `routes/sites.ts` | GET /v1/sites/:siteSlug/public-config |
| `routes/articles.ts` | 9 article CRUD + publish endpoints |
| `routes/knowledge.ts` | 6 KB entry CRUD endpoints |
| `routes/geo.ts` | 2 geo run query endpoints |
| `routes/content-gaps.ts` | 4 gap management endpoints |
| `routes/reddit.ts` | 11 reddit target/run/gap endpoints |
| `routes/youtube.ts` | 12 youtube target/run/gap endpoints |
| `routes/brand-clarity.ts` | 14+ BC settings/project/channel/video endpoints |
| `routes/social-hub.ts` | 12+ SH settings/account/template/calendar endpoints |
| `routes/yolo.ts` | 12 YOLO automation endpoints |

## Auth Migration (PBKDF2)

Stored hash format: `pbkdf2:sha256:100000:<hex-salt>:<hex-hash>`

One-time migration: run `scripts/gen-pbkdf2-hash.ts` locally to generate the new hash, set via `wrangler secret put ADMIN_PASSWORD_HASH`. The old bcrypt hash in Railway env is no longer used.

## Cleanup

After all routes are ported, delete:
- `apps/api/src/routes/` (all Node route handlers)
- `apps/api/src/server.ts` (Node HTTP server)
- `apps/api/src/router.ts` (Node router)
- `apps/api/src/helpers.ts` (Node-specific helpers)
- `apps/api/src/cloudflare/router.ts` (replaced by app.ts)
- `apps/api/src/cloudflare/routes/proxy.ts` (Railway proxy)
- `apps/api/src/cloudflare/jobs/` (enqueue/status/results — replaced by routes/jobs.ts)

Remove from `wrangler.jsonc`: `NODE_API_URL` env var.

## Testing

Each route family has a `*.test.ts` file using Hono's `app.request()` helper with a mock `ApiEnv` (stub DB, stub bindings). Tests verify response status and body shape — no real DB or HTTP calls.

## Success Criteria

- `npx wrangler deploy --dry-run` passes
- All `*.test.ts` in `apps/api/src/cloudflare/` pass
- `npx tsc --noEmit` passes
- No references to `NODE_API_URL`, `proxyToNodeApi`, `IncomingMessage`, or `ServerResponse` remain in `apps/api/src/cloudflare/`
