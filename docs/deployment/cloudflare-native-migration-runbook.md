# Cloudflare Native Migration Runbook

## Architecture Overview

The Cloudflare-native stack replaces the Railway Node server with a single shared Cloudflare Worker backend and three Cloudflare Pages frontends.

```
Browser
  ├── przemyslawfilipiak.com  → Cloudflare Pages (apps/client-przemyslawfilipiak)
  ├── frinter.pl              → Cloudflare Pages (apps/client-frinter)
  └── focusequalsfreedom.com  → Cloudflare Pages (apps/client-focusequalsfreedom)
           │
           └──► api.frinter.workers.dev  (shared Worker — apps/api)
                    │
                    ├── Hyperdrive ──────► PostgreSQL (Railway or Neon)
                    ├── JOB_QUEUE ───────► Cloudflare Queue
                    ├── Workflows ───────► Durable Objects (GEO, Reddit, YouTube, BC-*, SH-*)
                    ├── ASSETS_BUCKET ───► R2 (video/audio artifacts)
                    └── NODE_API_URL ────► Node API fallback proxy (Railway)
```

### Key components

| Component | Type | Purpose |
|-----------|------|---------|
| `apps/api` | Cloudflare Worker | Shared backend — routing, queue dispatch, workflow orchestration |
| `apps/client-*` | Cloudflare Pages | Three tenant frontends (Astro SSR) |
| Hyperdrive | Cloudflare binding | Connection pooling for PostgreSQL |
| JOB_QUEUE | Cloudflare Queue | Async job dispatch for all pipeline topics |
| `*_WORKFLOW` | Cloudflare Workflows | Durable execution for GEO, Reddit, YouTube, BC, SH pipelines |
| ASSETS_BUCKET | R2 | Stores rendered video/audio artifacts |

---

## Prerequisites

- Cloudflare account with Workers, Pages, Queues, Workflows, R2, and Hyperdrive enabled
- `wrangler` CLI v3+ installed: `npm install -g wrangler`
- Authenticated: `wrangler login` or `CLOUDFLARE_API_TOKEN` set
- PostgreSQL database accessible (Railway or Neon)
- Node.js v20+ and `npm` for local builds

---

## Secrets and Bindings Inventory

### Worker bindings (configured in `apps/api/wrangler.jsonc`)

| Binding name | Type | Description |
|---|---|---|
| `HYPERDRIVE` | Hyperdrive | PostgreSQL connection via Cloudflare Hyperdrive |
| `JOB_QUEUE` | Queue (producer) | Publishes job messages for async processing |
| `ASSETS_BUCKET` | R2 | Stores generated video/audio artifacts |
| `GEO_RUN_WORKFLOW` | Workflow | GEO content pipeline |
| `REDDIT_RUN_WORKFLOW` | Workflow | Reddit scraping pipeline |
| `YOUTUBE_RUN_WORKFLOW` | Workflow | YouTube scraping pipeline |
| `BC_SCRAPE_WORKFLOW` | Workflow | Brand Clarity scrape phase |
| `BC_PARSE_WORKFLOW` | Workflow | Brand Clarity parse phase |
| `BC_SELECTOR_WORKFLOW` | Workflow | Brand Clarity selector phase |
| `BC_CLUSTER_WORKFLOW` | Workflow | Brand Clarity cluster phase |
| `BC_GENERATE_WORKFLOW` | Workflow | Brand Clarity generate phase |
| `SH_COPY_WORKFLOW` | Workflow | Social Hub copywriting phase |
| `SH_VIDEO_WORKFLOW` | Workflow | Social Hub video render phase |
| `SH_PUBLISH_WORKFLOW` | Workflow | Social Hub publish phase |

### Worker secrets (set via `wrangler secret put`)

| Secret name | Description |
|---|---|
| `NODE_API_URL` | Fallback proxy to existing Node/Railway API |
| `OPENROUTER_API_KEY` | LLM API access via OpenRouter |
| `ANTHROPIC_API_KEY` | Direct Anthropic API access |
| `WAVESPEED_API_KEY` | Video rendering service |
| `ELEVENLABS_API_KEY` | Text-to-speech (ElevenLabs) |
| `ADMIN_PASSWORD_HASH` | Hashed password for admin auth routes |

### Worker environment variables (set in `wrangler.jsonc` or `wrangler secret put`)

| Variable | Description |
|---|---|
| `APP_ENV` | `production` \| `staging` \| `development` |
| `FRINTER_HOST` | Hostname for frinter tenant (`frinter.pl`) |
| `FOCUS_HOST` | Hostname for focus tenant (`focusequalsfreedom.com`) |
| `PRZEM_HOST` | Hostname for personal brand tenant (`przemyslawfilipiak.com`) |

### Cloudflare Pages environment variables (per tenant)

| Variable | Description |
|---|---|
| `API_BASE_URL` | URL of the deployed shared Worker |
| `SITE_SLUG` | Tenant slug: `przemyslawfilipiak` \| `frinter` \| `focusequalsfreedom` |

---

## Deployment Steps

### 1. Set Worker secrets

```bash
cd apps/api

wrangler secret put NODE_API_URL
wrangler secret put OPENROUTER_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put WAVESPEED_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ADMIN_PASSWORD_HASH
```

### 2. Create Hyperdrive configuration

```bash
wrangler hyperdrive create frinter-pg \
  --connection-string="postgresql://USER:PASS@HOST:PORT/DB"
```

Copy the returned Hyperdrive ID into `apps/api/wrangler.jsonc` under the `hyperdrive` binding.

### 3. Create R2 bucket

```bash
wrangler r2 bucket create frinter-artifacts
```

Confirm the bucket name matches the `r2_buckets` binding in `apps/api/wrangler.jsonc`.

### 4. Create the Queue

```bash
wrangler queues create frinter-job-queue
```

Confirm the queue name matches the `queues` producer and consumer bindings in `apps/api/wrangler.jsonc`.

### 5. Deploy the API Worker

```bash
cd apps/api
npm run deploy:api:cf
# or directly:
wrangler deploy
```

Note the deployed Worker URL (e.g. `https://api.frinter.workers.dev`).

### 6. Deploy tenant clients to Cloudflare Pages

For each tenant app (`client-przemyslawfilipiak`, `client-frinter`, `client-focusequalsfreedom`):

```bash
cd apps/client-<tenant>
npx wrangler pages deploy dist \
  --project-name=<tenant-pages-project> \
  --branch=main
```

Or connect the GitHub repo to Cloudflare Pages via the dashboard and set build settings:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `apps/client-<tenant>` |

Set environment variables in the Pages project settings:

```
API_BASE_URL=https://api.frinter.workers.dev
SITE_SLUG=<tenant-slug>
```

---

## Verification

### Health check

```bash
curl https://api.frinter.workers.dev/health
# Expected: 200 OK with JSON body
```

### Structured logs

Worker logs appear in the Cloudflare dashboard under **Workers & Pages → your-worker → Logs**, or via:

```bash
wrangler tail --format=json
```

Each request emits a JSON log line:

```json
{"type":"request","method":"GET","pathname":"/health","status":200,"duration_ms":12}
```

Queue batches emit:

```json
{"type":"queue_batch","messageCount":3,"duration_ms":450}
```

Errors emit to stderr:

```json
{"type":"error","message":"...","stack":"..."}
```

---

## Environment-Specific Hostnames

| Environment | API Worker | Personal brand | Frinter | Focus |
|---|---|---|---|---|
| Production | `api.frinter.workers.dev` | `przemyslawfilipiak.com` | `frinter.pl` | `focusequalsfreedom.com` |
| Staging | `api-staging.frinter.workers.dev` | Pages preview URL | Pages preview URL | Pages preview URL |
| Local dev | `http://127.0.0.1:8787` | `http://localhost:4321` | `http://localhost:4322` | `http://localhost:4323` |

---

## Rollback Procedure

If the Cloudflare Worker deployment causes issues:

1. **Immediate rollback via Wrangler** — roll back to the previous version:

   ```bash
   wrangler deployments list
   wrangler rollback <deployment-id>
   ```

2. **Fallback to Node API** — if `NODE_API_URL` is set, the Worker proxies unknown routes to the Railway Node server. Update the Worker to route all traffic to the fallback while diagnosing:

   ```bash
   # Temporarily set NODE_API_URL to handle all traffic
   wrangler secret put NODE_API_URL
   # Redeploy with a version that forces all requests through the proxy
   ```

3. **DNS fallback** — update Cloudflare DNS to point the API subdomain back to the Railway server while the Worker issue is fixed.

4. **Pages rollback** — in the Cloudflare dashboard, navigate to the Pages project → Deployments → select the previous deployment → click **Rollback**.

---

## Local Development

```bash
# API Worker
cd apps/api
cp ../../infra/cloudflare/env/api.env.example .dev.vars
wrangler dev

# Tenant client (in another terminal)
cd apps/client-przemyslawfilipiak
cp ../../infra/cloudflare/env/client.env.example .env
npm run dev
```
