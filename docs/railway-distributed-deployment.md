# Railway Distributed Deployment

## Cel

Ten dokument opisuje docelowy deployment po rozbiciu monolitu na:

- `api`
- `client1` (`przemyslawfilipiak`) — obecny runtime legacy
- `client2` (`focusequalsfreedom`) — nowy BFF client
- `client3` (`frinter`) — nowy BFF client
- workery z tego samego repo

## Zasada

Każdy runtime jest osobnym Railway service, ale wszystkie wskazują:

- to samo repo
- ten sam branch
- ten sam katalog root repo

Różni je tylko:

- `startCommand`
- czasem `buildCommand`
- zestaw env vars
- domena publiczna dla serwisów HTTP

## Service Matrix

| Service | Typ | Build | Start | Publiczny URL |
|---|---|---|---|---|
| `api` | HTTP | `npm run build:api` | `npm run start:api` | tak |
| `client-przemyslawfilipiak` | HTTP | `npm run build:client1` | `npm run start:client1` | tak |
| `client-focusequalsfreedom` | HTTP | `npm run build:client2` | `npm run start:client2` | tak |
| `client-frinter` | HTTP | `npm run build:client3` | `npm run start:client3` | tak |
| `worker-general` | worker | `npm run build:workers` | `npm run start:worker` | nie |
| `worker-bc` | worker | `npm run build:workers` | `npm run start:worker:bc` | nie |
| `worker-sh-copy` | worker | `npm run build:workers` | `npm run start:worker:sh-copy` | nie |
| `worker-sh-video` | worker | `npm run build:workers` | `npm run start:worker:sh-video` | nie |

## Healthchecks

HTTP runtime:

- `api` -> `/health`
- `client-focusequalsfreedom` -> `/health`
- `client-frinter` -> `/health`

`client-przemyslawfilipiak` nadal działa jako legacy root i używa obecnego runtime monolitu.

Worker runtime:

- opcjonalnie ustaw `WORKER_HEALTH_PORT=8080`
- wtedy worker wystawia lokalne `GET /health`
- payload zwraca:
  - `workerName`
  - `topics`
  - `currentJobId`
  - `currentTopic`
  - `processedJobs`
  - `lastLoopAt`

## Dynamic Public Metadata

Client runtimes now generate these routes per active `SITE_SLUG`:

- `/robots.txt`
- `/rss.xml`
- `/sitemap.xml`
- `/llms.txt`
- `/llms-full.txt`
- `/site.webmanifest`

This removes the old dependency on one shared set of static `public/*.txt` discovery files and lets `client2` / `client3` expose their own canonical metadata.

## Minimalne Envy Wspólne

Wspólne prawie dla wszystkich:

- `DATABASE_URL`
- `NODE_ENV=production`
- `ADMIN_PASSWORD_HASH`

Prawie wszystkie LLM/integration keys powinny być ustawione na:

- `api`
- workerach, które ich używają

## Env Matrix

### `api`

Wymagane:

- `PORT`
- `HOST=0.0.0.0`
- `DATABASE_URL`
- `NODE_ENV=production`
- `ADMIN_PASSWORD_HASH`

Jeśli API ma też uruchamiać funkcje zależne od integracji:

- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `APIFY_API_TOKEN`
- `YOUTUBE_API_KEY`
- `DISCORD_WEBHOOK_URL`

### `client-przemyslawfilipiak`

Wymagane:

- obecny zestaw env legacy monolitu

### `client-focusequalsfreedom`

Wymagane:

- `PORT`
- `HOST=0.0.0.0`
- `API_BASE_URL=https://twoj-api-domain`

Opcjonalne:

- `NODE_ENV=production`
- `LEGACY_APP_URL=https://twoj-legacy-client1-domain`
  - fallback proxy dla jeszcze nieprzeniesionych `/admin/*` i `/api/*`

### `client-frinter`

Wymagane:

- `PORT`
- `HOST=0.0.0.0`
- `API_BASE_URL=https://twoj-api-domain`

Opcjonalne:

- `NODE_ENV=production`
- `LEGACY_APP_URL=https://twoj-legacy-client1-domain`
  - fallback proxy dla jeszcze nieprzeniesionych `/admin/*` i `/api/*`

### `worker-general`

Wymagane:

- `DATABASE_URL`
- `NODE_ENV=production`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `WORKER_HEALTH_PORT=8080`

Jeśli worker wykonuje GEO:

- `APIFY_API_TOKEN`
- `YOUTUBE_API_KEY`

### `worker-bc`

Wymagane:

- `DATABASE_URL`
- `NODE_ENV=production`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `BC_LLM_PROVIDER`
- `WORKER_HEALTH_PORT=8080`

Opcjonalne zależnie od konfiguracji:

- `BC_EXTENDED_THINKING_ENABLED`
- `BC_THINKING_BUDGET_DEFAULT`
- `BC_LP_ANTHROPIC_MODEL`
- `BC_SCRAPER_ANTHROPIC_MODEL`
- `BC_CLUSTER_ANTHROPIC_MODEL`
- `BC_GENERATOR_ANTHROPIC_MODEL`

### `worker-sh-copy`

Wymagane:

- `DATABASE_URL`
- `NODE_ENV=production`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `WORKER_HEALTH_PORT=8080`

### `worker-sh-video`

Wymagane:

- `DATABASE_URL`
- `NODE_ENV=production`
- `WORKER_HEALTH_PORT=8080`

Dodatkowo wszystkie klucze do generatora video, jeśli pipeline ich wymaga.

## Kolejność Deployu

1. `postgres`
2. `api`
3. `client-przemyslawfilipiak`
4. `client-focusequalsfreedom`
5. `client-frinter`
6. `worker-general`
7. `worker-bc`
8. `worker-sh-copy`
9. `worker-sh-video`

## Rekomendowane Domeny

- `api.example.com` -> `api`
- `przemyslawfilipiak.com` -> `client-przemyslawfilipiak`
- `focusequalsfreedom.com` -> `client-focusequalsfreedom`
- `frinter.app` -> `client-frinter`

## Jak Konfigurować Service w Railway

Dla każdego nowego serwisu:

1. `New Service`
2. `GitHub Repo`
3. wybierz to repo i branch
4. ustaw `Root Directory` na root repo
5. ustaw `Build Command`
6. ustaw `Start Command`
7. ustaw env vars
8. dla HTTP runtime ustaw domenę i healthcheck

## Gotowe Komendy Startowe

- `npm run start:api`
- `npm run start:client1`
- `npm run start:client2`
- `npm run start:client3`
- `npm run start:worker`
- `npm run start:worker:geo-drafts`
- `npm run start:worker:reddit`
- `npm run start:worker:youtube`
- `npm run start:worker:bc`
- `npm run start:worker:sh-copy`
- `npm run start:worker:sh-video`

## Smoke Checks

Po deployu HTTP runtime możesz sprawdzić:

- `npm run smoke:http -- https://twoj-api-domain`
- `npm run smoke:http -- https://twoj-client2-domain`
- `npm run smoke:http -- https://twoj-client3-domain`

Jeśli worker ma ustawione `WORKER_HEALTH_PORT` i Railway wystawia healthcheck wewnętrzny, sprawdzaj `/health`.

## Obecne Ograniczenia

- `client2` i `client3` to na razie cienkie BFF shell-e, nie pełna kopia starego UI
- nieprzeniesione moduły mogą działać przez `LEGACY_APP_URL` fallback proxy
- `worker-general` nie ma jeszcze trwałego streamingu progressu
- `client1` pozostaje legacy runtime

## Następny Etap

Po ustawieniu Railway trzeba zrobić:

1. produkcyjne domeny i `API_BASE_URL`
2. smoke test loginu na `client2` i `client3`
3. smoke test CRUD przez BFF
4. smoke test enqueue jobów i wykonania workerów
