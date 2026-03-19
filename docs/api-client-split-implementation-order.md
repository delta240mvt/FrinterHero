# API + Clients Split - Implementation Order

## 1. Recommended runtime shape

Final target:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-geo-drafts`
- `worker-reddit`
- `worker-youtube`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`
- `migrate`
- `postgres`

Recommended rollout shape for phase 1:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-general`
- `worker-bc-scrape`
- `worker-sh-copy`
- `worker-sh-video`
- `migrate`
- `postgres`

Where:

- `worker-general` handles `geo`, `draft`, `reddit`, `youtube`, `bc-parse`, `bc-generate`, `bc-selector`
- `worker-bc-scrape` handles only long Brand Clarity scraping jobs
- `worker-sh-copy` handles SocialHub copywriter jobs
- `worker-sh-video` handles SocialHub video rendering jobs

Why this is the best first deployment:

- isolates the two most dangerous long-running pipelines: BC scrape and SH video
- isolates SocialHub copy from video render
- avoids deploying 6 workers before queue contracts stabilize
- still gives a clean path to split `worker-general` later

## 2. Final worker split

Target split after stabilization:

1. `worker-geo-drafts`
2. `worker-reddit`
3. `worker-youtube`
4. `worker-bc`
5. `worker-sh-copy`
6. `worker-sh-video`

Current file mapping:

- `worker-geo-drafts`
  - `scripts/geo-monitor.ts`
  - `scripts/draft-bridge.ts`
  - `scripts/draft-generator.ts`
- `worker-reddit`
  - `scripts/reddit-scraper.ts`
- `worker-youtube`
  - `scripts/yt-scraper.ts`
- `worker-bc`
  - `scripts/bc-lp-parser.ts`
  - `scripts/bc-channel-discovery.ts`
  - `scripts/bc-video-discovery.ts`
  - `scripts/bc-scraper.ts`
  - `scripts/bc-pain-clusterer.ts`
  - `scripts/bc-pain-selector.ts`
  - `scripts/bc-lp-generator.ts`
- `worker-sh-copy`
  - `scripts/sh-copywriter.ts`
- `worker-sh-video`
  - `scripts/sh-video-render.ts`

## 3. Service matrix for Railway

### Core services

`postgres`

- responsibility: shared PostgreSQL for API and workers
- public HTTP: no

`migrate`

- responsibility: run DB migrations before rollout
- public HTTP: no
- trigger: release step or one-off deployment job

`api`

- responsibility: auth, CRUD, orchestration, job status, admin/public JSON API
- public HTTP: yes
- depends on: `postgres`

### Client services

`client-przemyslawfilipiak`

- responsibility: client1 public + admin UI
- public HTTP: yes
- depends on: `api`

`client-focusequalsfreedom`

- responsibility: client2 public + admin UI
- public HTTP: yes
- depends on: `api`

`client-frinter`

- responsibility: client3 public + admin UI
- public HTTP: yes
- depends on: `api`

### Worker services - phase 1

`worker-general`

- responsibility: queue consumer for `geo`, `draft`, `reddit`, `youtube`, `bc-parse`, `bc-generate`, `bc-selector`
- public HTTP: no
- depends on: `postgres`

`worker-bc-scrape`

- responsibility: Brand Clarity scrape jobs only
- public HTTP: no
- depends on: `postgres`

`worker-sh-copy`

- responsibility: SocialHub copywriter jobs only
- public HTTP: no
- depends on: `postgres`

`worker-sh-video`

- responsibility: SocialHub video jobs only
- public HTTP: no
- depends on: `postgres`

## 4. Start commands

Recommended root commands:

```json
{
  "scripts": {
    "start:api": "npm --workspace apps/api run start",
    "start:client1": "npm --workspace apps/client-przemyslawfilipiak run start",
    "start:client2": "npm --workspace apps/client-focusequalsfreedom run start",
    "start:client3": "npm --workspace apps/client-frinter run start",
    "start:worker": "npm --workspace workers/runner run start",
    "start:worker:geo-drafts": "npm --workspace workers/worker-geo-drafts run start",
    "start:worker:reddit": "npm --workspace workers/worker-reddit run start",
    "start:worker:youtube": "npm --workspace workers/worker-youtube run start",
    "start:worker:bc": "npm --workspace workers/worker-bc run start",
    "start:worker:sh-copy": "npm --workspace workers/worker-sh-copy run start",
    "start:worker:sh-video": "npm --workspace workers/worker-sh-video run start",
    "migrate": "npm --workspace apps/api run migrate"
  }
}
```

Recommended Railway commands in phase 1:

- `api` -> `npm run start:api`
- `client-przemyslawfilipiak` -> `npm run start:client1`
- `client-focusequalsfreedom` -> `npm run start:client2`
- `client-frinter` -> `npm run start:client3`
- `worker-general` -> `npm run start:worker`
- `worker-bc-scrape` -> `npm run start:worker`
- `worker-sh-copy` -> `npm run start:worker`
- `worker-sh-video` -> `npm run start:worker`
- `migrate` -> `npm run migrate`

Phase 1 worker routing via env:

- `worker-general` -> `WORKER_TOPICS=geo,draft,reddit,youtube,bc-parse,bc-generate,bc-selector`
- `worker-bc-scrape` -> `WORKER_TOPICS=bc-scrape`
- `worker-sh-copy` -> `WORKER_TOPICS=sh-copy`
- `worker-sh-video` -> `WORKER_TOPICS=sh-video`

Final phase commands can either:

- keep one shared `start:worker` with different `WORKER_TOPICS`, or
- switch to dedicated worker entrypoints once workspaces are split physically

## 5. Env matrix

### Shared backend env

Attach to `api` and most workers:

- `DATABASE_URL`
- `DATABASE_PUBLIC_URL` if retained during transition
- `NODE_ENV`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `APIFY_API_TOKEN`
- `YOUTUBE_API_KEY`
- `DISCORD_WEBHOOK_URL`

### API-only env

- `ADMIN_PASSWORD_HASH`
- future `SESSION_SECRET`
- future `JWT_SECRET`
- future `CORS_ALLOWED_ORIGINS`

### Worker-general env

- `REDDIT_MAX_ITEMS_PER_TARGET`
- `REDDIT_CHUNK_SIZE`
- `REDDIT_ANALYSIS_MODEL`
- `YT_MAX_COMMENTS_PER_TARGET`
- `YT_MAX_VIDEOS_PER_CHANNEL`
- `YT_CHUNK_SIZE`
- `YT_ANALYSIS_MODEL`
- `WORKER_TOPICS`
- `WORKER_CONCURRENCY`

### Worker-bc-scrape env

- `WORKER_TOPICS=bc-scrape`
- `WORKER_CONCURRENCY`
- optionally transitional BC model/budget envs if not fully sourced from DB yet

### Worker-sh-copy env

- `WORKER_TOPICS=sh-copy`
- `WORKER_CONCURRENCY`
- `SH_COPYWRITER_MODEL`
- `SH_COPYWRITER_THINKING_BUDGET`

### Worker-sh-video env

- `WORKER_TOPICS=sh-video`
- `WORKER_CONCURRENCY`
- `SH_VIDEO_MODEL`
- `SH_TTS_PROVIDER`
- `SH_ELEVENLABS_VOICE_ID`
- `ELEVENLABS_API_KEY`
- `WAVESPEED_API_KEY`

### Client env

- `SITE_SLUG`
- `PUBLIC_API_BASE_URL`
- optional `API_INTERNAL_BASE_URL`

Clients should not receive:

- `DATABASE_URL`
- `ADMIN_PASSWORD_HASH`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `APIFY_API_TOKEN`
- `ELEVENLABS_API_KEY`
- `WAVESPEED_API_KEY`
- `UPLOADPOST_API_KEY`

## 6. Critical env rule

Split configuration into three classes:

1. service env

- stable env per Railway service
- secrets, DB URLs, global integration keys

2. job payload

- things like `BC_PROJECT_ID`, `SH_BRIEF_ID`, `SCRAPE_RUN_ID`, `GAP_ID`
- these must leave deployment env and move into queue payload

3. tenant config

- brand voice
- BC settings
- SH settings
- viral engine config

These should progressively move into DB/API settings and be read per `site_id`.

## 7. Deployment order

First environment bootstrap:

1. deploy `postgres`
2. run `migrate`
3. deploy `api`
4. deploy worker services
5. deploy client services

Normal release order:

1. ship code
2. run `migrate`
3. roll `api`
4. roll workers
5. roll clients

Critical rule:

- no runtime service may run schema migration on boot

## 8. Health model

`api` must expose:

- `GET /health`
- `GET /ready`
- `GET /live`

`client-*` should expose:

- `GET /health` or equivalent readiness endpoint

`worker-*`:

- preferred: heartbeat stored in DB or job runtime table
- fallback: minimal `/health` only if platform routing requires it

## 9. First 15 execution tasks

1. [x] Create monorepo folder structure for `apps`, `workers`, `packages`.
2. [x] Move migrations out of runtime `start`.
3. [x] Create `sites` table and seed 3 site records.
4. [x] Create `apps/api` bootstrap with DB access and health endpoints.
5. [x] Create `packages/site-config` contract.
6. [x] Create `packages/api-contract` with auth and content DTOs.
7. [x] Design central auth flow for multi-domain clients.
8. [x] Create client BFF auth adapter.
9. [x] Create first client shell for `client-focusequalsfreedom`.
10. [x] Create first client shell for `client-frinter`.
11. [x] Port public article read endpoints into `apps/api`.
12. [x] Port admin articles/KB/content-gaps endpoints into `apps/api`.
13. [x] Introduce queue/job tables and `worker-general`.
14. [x] Move `draft` and `geo` into queue-driven worker execution.
15. [ ] Deploy `api + client2 + client3 + worker-general` on staging.

Bridge slice completed after M1:

- [x] Route `client2/client3` Social Hub API calls for `settings`, `accounts`, `templates`, `briefs`, `sources`, `analytics` to central `apps/api`.
- [x] Keep non-migrated Social Hub endpoints (`generate-copy`, `render`, `publish`, stream paths) on legacy fallback until worker/API contracts are moved.

## 10. M1 boundary

Do not take all modules into M1.

M1 should include:

- auth
- site config
- public articles
- admin dashboard core
- articles CRUD
- knowledge base CRUD
- content gaps list + basic actions
- draft worker
- geo worker

Leave for later milestones:

- full Reddit/YouTube migration if needed
- Brand Clarity full pipeline
- SocialHub full pipeline

## 11. Best practical recommendation

Best target architecture:

- final target = 6 workers
- first deploy = 4 worker runtimes
- one repo
- many Railway services
- one command per runtime role
- one migration job
- API as single backend entrypoint
- clients as separate public/admin shells
- queue payload instead of per-job env vars

This is the cleanest balance between correctness, operability and rollout speed.
