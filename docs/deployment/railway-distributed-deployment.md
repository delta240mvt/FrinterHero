# Railway Distributed Deployment

This is the current deployment reference for the distributed monorepo.

## 1. Service matrix

| Service | Type | Build | Start | Public URL |
|---|---|---|---|---|
| `api` | HTTP | `npm run build:api` | `npm run start:api` | yes |
| `client-przemyslawfilipiak` | HTTP | `npm run build:client1` | `npm run start:client1` | yes |
| `client-focusequalsfreedom` | HTTP | `npm run build:client2` | `npm run start:client2` | yes |
| `client-frinter` | HTTP | `npm run build:client3` | `npm run start:client3` | yes |
| `worker-general` | worker | `npm run build:workers` | `npm run start:worker` | no |
| `worker-bc` | worker | `npm run build:workers` | `npm run start:worker:bc` | no |
| `worker-sh-copy` | worker | `npm run build:workers` | `npm run start:worker:sh-copy` | no |
| `worker-sh-video` | worker | `npm run build:workers` | `npm run start:worker:sh-video` | no |
| `migrate` | job | none or script-only | `npm run start:migrate` | no |

Optional later:

- `worker-reddit`
- `worker-youtube`
- `worker-geo-drafts`

## 2. Current runtime model

Important distinctions:

- all three clients are real Astro app builds
- each client talks to the same central `apps/api`
- tenant context is resolved through `SITE_SLUG -> sites -> site_id`
- dedicated workers are thin runtime wrappers over `workers/runner/src/index.ts`

## 3. Topic routing

- `worker-general`
  - `geo`
  - `draft`
  - `reddit`
  - `youtube`
  - `sh-publish`
- `worker-bc`
  - `bc-scrape`
  - `bc-parse`
  - `bc-selector`
  - `bc-cluster`
  - `bc-generate`
- `worker-sh-copy`
  - `sh-copy`
- `worker-sh-video`
  - `sh-video`

## 4. Healthchecks

HTTP services:

- `api` -> `/health`
- `client-przemyslawfilipiak` -> `/health`
- `client-focusequalsfreedom` -> `/health`
- `client-frinter` -> `/health`

Workers:

- set `WORKER_HEALTH_PORT=8080`
- Railway can probe `GET /health`

## 5. Env matrix

### Shared

- `DATABASE_URL`
- `NODE_ENV=production`

### API

- `PORT`
- `HOST=0.0.0.0`
- `DATABASE_URL`
- `ADMIN_PASSWORD_HASH`
- integration keys as needed:
  - `OPENROUTER_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `APIFY_API_TOKEN`
  - `YOUTUBE_API_KEY`
  - `DISCORD_WEBHOOK_URL`

### `client-przemyslawfilipiak`

- `PORT`
- `HOST=0.0.0.0`
- `SITE_SLUG=przemyslawfilipiak`
- current app env required by Astro runtime

### `client-focusequalsfreedom`

- `PORT`
- `HOST=0.0.0.0`
- `API_BASE_URL=https://your-api-domain`
- `SITE_SLUG=focusequalsfreedom`

### `client-frinter`

- `PORT`
- `HOST=0.0.0.0`
- `API_BASE_URL=https://your-api-domain`
- `SITE_SLUG=frinter`

### `worker-general`

- `DATABASE_URL`
- `NODE_ENV=production`
- `WORKER_HEALTH_PORT=8080`
- `WORKER_TOPICS=geo,draft,reddit,youtube,sh-publish`
- keys required by the topics you enable

### `worker-bc`

- `DATABASE_URL`
- `NODE_ENV=production`
- `WORKER_HEALTH_PORT=8080`
- `WORKER_TOPICS=bc-scrape,bc-parse,bc-selector,bc-cluster,bc-generate`
- BC model and provider env as needed

### `worker-sh-copy`

- `DATABASE_URL`
- `NODE_ENV=production`
- `WORKER_HEALTH_PORT=8080`
- copywriter model env

### `worker-sh-video`

- `DATABASE_URL`
- `NODE_ENV=production`
- `WORKER_HEALTH_PORT=8080`
- video and TTS provider env

## 6. Deploy order

1. `postgres`
2. `migrate`
3. `api`
4. `client-przemyslawfilipiak`
5. `client-focusequalsfreedom`
6. `client-frinter`
7. `worker-general`
8. `worker-bc`
9. `worker-sh-copy`
10. `worker-sh-video`

## 7. Commands

- `npm run start:api`
- `npm run start:client1`
- `npm run start:client2`
- `npm run start:client3`
- `npm run start:worker`
- `npm run start:worker:bc`
- `npm run start:worker:sh-copy`
- `npm run start:worker:sh-video`
- `npm run start:migrate`

`npm run migrate` now covers:

- schema push
- site seeding
- Social Hub `site_id` backfill for legacy rows

## 8. Constraints

- all three clients must deploy the same Astro app shape in separate workspace services
- `client1` remains the reference runtime, but fixes affecting shared frontend behavior should be propagated to all three clients
- `Social Hub` is site-scoped end-to-end; deploy `SITE_SLUG` consistently across clients and seed scripts
