# Next Session Handoff — 2026-03-18

## 1. Cel tego dokumentu

To jest dokument startowy na kolejna sesje pracy.

Ma pozwolic wejsc od razu w odpowiednie miejsce bez ponownego mapowania repo:

- co zostalo zrobione,
- co jest aktualnym stanem architektury,
- co jest otwarte,
- jaka jest kolejnosc prac na jutro,
- na jakich plikach i dokumentach trzeba pracowac najpierw.

## 2. Aktualny stan migracji

Szacunkowo:

- calosc migracji: okolo `55-60%` zrobione
- pozostalo: okolo `40-45%`

Najwiecej zostalo w:

- execution plane `Brand Clarity`
- execution plane `Social Hub`
- odcieciu admin SSR pages od bezposredniego DB access
- docelowym DB-backed `status/stream/events`

## 3. Co juz dziala

### 3.1 Monorepo / runtime split

Istnieja i sa przygotowane:

- `apps/api`
- `apps/client-przemyslawfilipiak`
- `apps/client-focusequalsfreedom`
- `apps/client-frinter`
- `workers/runner`
- `packages/site-config`

Kluczowe runtime role:

- `client1` = obecny legacy baseline, nie ruszac
- `client2` = oddzielny runtime BFF
- `client3` = oddzielny runtime BFF
- centralne `api`
- worker runner z topicami

### 3.2 Multi-tenant foundation

Zrobione:

- `sites`
- `app_jobs`
- seed 3 tenantow
- tenant-aware scope dla core content
- tenant-aware scope dla Reddit
- tenant-aware scope dla YouTube
- tenant-aware scope dla Brand Clarity management slice

Pliki kluczowe:

- [src/db/schema.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\db\schema.ts)
- [migrations/0006_sites_and_jobs.sql](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\migrations\0006_sites_and_jobs.sql)
- [migrations/0007_intelligence_site_scope.sql](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\migrations\0007_intelligence_site_scope.sql)
- [migrations/0008_bc_site_scope.sql](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\migrations\0008_bc_site_scope.sql)

### 3.3 Central API

Centralne `apps/api` ma juz:

- auth
- public site config
- articles
- knowledge base
- content gaps
- dashboard
- geo jobs
- draft jobs
- Reddit data plane
- YouTube data plane
- Brand Clarity management slice
- pierwszy BC execution topic

Najwazniejszy plik:

- [apps/api/src/server.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\apps\api\src\server.ts)

### 3.4 BFF clients

`client2` i `client3`:

- dzialaja jako osobne runtime
- maja wlasne `/admin/login`
- maja wlasne cookie sesji
- proxyuja do centralnego API
- maja fallback do legacy runtime dla nieprzeniesionych modulow

Najwazniejszy plik:

- [scripts/monorepo/client-bff.mjs](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\monorepo\client-bff.mjs)

### 3.5 Worker runner

Obslugiwane topicy:

- `geo`
- `draft`
- `reddit`
- `youtube`
- `bc-scrape`

Najwazniejszy plik:

- [workers/runner/src/index.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\workers\runner\src\index.ts)

## 4. Co zostalo zrobione dzisiaj

### 4.1 Brand Clarity tenantization

Dodane `site_id` do:

- `bc_projects`
- `bc_target_channels`
- `bc_target_videos`
- `bc_comments`
- `bc_extracted_pain_points`
- `bc_settings`
- `bc_iterations`
- `bc_iteration_selections`
- `bc_landing_page_variants`
- `bc_pain_clusters`

Zrobione w:

- [src/db/schema.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\db\schema.ts)
- [migrations/0008_bc_site_scope.sql](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\migrations\0008_bc_site_scope.sql)

### 4.2 BC settings per site

Helper BC settings jest juz tenant-aware:

- [src/lib/bc-settings.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-settings.ts)

### 4.3 BC management API per site

Centralny BC management w `apps/api` jest juz scope’owany przez `siteSlug`.

Najwazniejszy plik:

- [apps/api/src/server.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\apps\api\src\server.ts)

### 4.4 Pierwszy execution topic dla BC

Dodane:

- `POST /v1/jobs/bc-scrape`
- worker topic `bc-scrape`

Pliki:

- [apps/api/src/server.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\apps\api\src\server.ts)
- [workers/runner/src/index.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\workers\runner\src\index.ts)

### 4.5 BC scripts zapisują `siteId`

Zaktualizowane:

- [scripts/bc-channel-discovery.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-channel-discovery.ts)
- [scripts/bc-video-discovery.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-video-discovery.ts)
- [scripts/bc-scraper.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-scraper.ts)
- [scripts/bc-pain-selector.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-pain-selector.ts)
- [scripts/bc-pain-clusterer.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-pain-clusterer.ts)
- [scripts/bc-lp-generator.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-lp-generator.ts)

## 5. Najwazniejsze rzeczy nadal otwarte

### 5.1 Brand Clarity execution plane

Zostaly do przeniesienia na `app_jobs`:

- `bc-parse`
- `bc-selector`
- `bc-cluster`
- `bc-generate`

Legacy singleton / EventEmitter / spawn flow siedzi nadal w:

- [src/lib/bc-lp-parse-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-lp-parse-job.ts)
- [src/lib/bc-scrape-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-scrape-job.ts)
- [src/lib/bc-selector-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-selector-job.ts)
- [src/lib/bc-lp-gen-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-lp-gen-job.ts)

Legacy API entrypointy do migracji:

- [src/pages/api/brand-clarity/projects/parse-stream.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\projects\parse-stream.ts)
- [src/pages/api/brand-clarity/[projectId]/scrape/start.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\scrape\start.ts)
- [src/pages/api/brand-clarity/[projectId]/scrape/status.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\scrape\status.ts)
- [src/pages/api/brand-clarity/[projectId]/scrape/stream.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\scrape\stream.ts)
- [src/pages/api/brand-clarity/[projectId]/iterations/[itId]/select.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\iterations\[itId]\select.ts)
- [src/pages/api/brand-clarity/[projectId]/iterations/[itId]/select-stream.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\iterations\[itId]\select-stream.ts)
- [src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\cluster-pain-points.ts)
- [src/pages/api/brand-clarity/[projectId]/generate-variants.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\generate-variants.ts)
- [src/pages/api/brand-clarity/[projectId]/variants/status.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\variants\status.ts)
- [src/pages/api/brand-clarity/[projectId]/variants/stream.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\variants\stream.ts)

### 5.2 Social Hub execution plane

Najwiekszy otwarty runtime blocker po BC.

Do migracji:

- `generate-copy`
- `render(video)`
- `publish`
- `queue processor`
- `brief stream`

Najwazniejsze pliki:

- [src/lib/sh-copywriter-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\sh-copywriter-job.ts)
- [src/lib/sh-video-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\sh-video-job.ts)
- [src/lib/sh-queue-processor.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\sh-queue-processor.ts)
- [src/pages/api/social-hub/briefs/[id]/generate-copy.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\social-hub\briefs\[id]\generate-copy.ts)
- [src/pages/api/social-hub/briefs/[id]/render.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\social-hub\briefs\[id]\render.ts)
- [src/pages/api/social-hub/briefs/[id]/publish.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\social-hub\briefs\[id]\publish.ts)
- [src/pages/api/social-hub/briefs/[id]/stream.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\social-hub\briefs\[id]\stream.ts)
- [src/pages/api/social-hub/queue.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\social-hub\queue.ts)

### 5.3 Admin SSR pages nadal czytaja DB bezposrednio

Zostalo okolo `23` admin pages.

Najwyzszy priorytet na odciecie:

- `src/pages/admin/reddit/*`
- `src/pages/admin/youtube/*`
- potem Brand Clarity management pages

Najciezsze na koniec:

- `src/pages/admin/brand-clarity/[id]/scrape.astro`
- `src/pages/admin/brand-clarity/[id]/variants.astro`
- `src/pages/admin/brand-clarity/[id]/iterations/[itId].astro`
- `src/pages/admin/social-hub/[briefId].astro`

## 6. Ważne dokumenty, na których pracujemy jutro

Główne dokumenty sterujące:

- [docs/monolith-to-api-clients-railway-plan.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\monolith-to-api-clients-railway-plan.md)
- [docs/api-client-split-implementation-order.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\api-client-split-implementation-order.md)
- [docs/railway-distributed-deployment.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\railway-distributed-deployment.md)

Dokumenty pomocnicze domenowe:

- [docs/social-hub-analysis.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\social-hub-analysis.md)
- [docs/brand-clarity/anthropic-api-integration-plan.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\brand-clarity\anthropic-api-integration-plan.md)
- [docs/brand-clarity/bc-settings-ui-plan.md](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\docs\brand-clarity\bc-settings-ui-plan.md)

## 7. Plan na jutro — kolejnosc prac

### Etap 1

Domknac `Brand Clarity` execution plane na `app_jobs`.

Kolejnosc:

1. `bc-parse`
2. `bc-selector`
3. `bc-cluster`
4. `bc-generate`
5. dopiero potem DB-backed `status/stream`

### Etap 2

Po BC przejsc do `Social Hub` execution plane:

1. `sh-copy`
2. `sh-video`
3. `sh-publish`
4. usuniecie `sh-queue-processor.ts` jako lokalnego source of truth

### Etap 3

Po execution plane przepinac admin SSR pages:

1. Reddit
2. YouTube
3. Brand Clarity management
4. Social Hub detail pages

## 8. Szczegółowy start na jutro

Jesli jutro startujemy bez dodatkowego planowania, pierwsza konkretna sekwencja powinna byc taka:

1. Otworzyc:
   - [apps/api/src/server.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\apps\api\src\server.ts)
   - [workers/runner/src/index.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\workers\runner\src\index.ts)
   - [src/lib/bc-lp-parse-job.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\bc-lp-parse-job.ts)
   - [scripts/bc-lp-parser.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\bc-lp-parser.ts)
2. Dodać `POST /v1/jobs/bc-parse`.
3. Dodać topic `bc-parse` do worker runner.
4. Oprzeć odpowiednik `status` o `GET /v1/jobs/latest?topic=bc-parse`.
5. Oznaczyć w dokumentacji, że `bc-parse` wyszedł z singletona.

Potem analogicznie:

- `bc-selector`
- `bc-cluster`
- `bc-generate`

## 9. Istotne ryzyka na jutro

- Nie rozwalić `client1`.
- Nie usuwać fallbacków `client2/client3`, dopóki live flow nie ma parity.
- Nie robić „hybrydy” gdzie status idzie z DB, a stream nadal z process RAM bez jawnego bridge.
- Przy SSR decoupling nie cofać się do bezpośrednich importów `@/db/client`.

## 10. Znane niezwiązane błędy repo

Przy ostatnim `tsc` nadal istnieją stare błędy niezwiązane z dzisiejszą zmianą:

- [scripts/gap-analysis.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\scripts\gap-analysis.ts)
- [src/lib/sh-image-gen.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\lib\sh-image-gen.ts)
- [src/pages/api/brand-clarity/[projectId]/pain-points/auto-filter.ts](C:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero\src\pages\api\brand-clarity\[projectId]\pain-points\auto-filter.ts)

Nie traktowac ich jutro jako regresji od dzisiejszego BC tenantization.

## 11. Jednozdaniowy punkt startu na jutro

Jutro zaczynamy od migracji `Brand Clarity` z singletonowego `parse/select/cluster/generate` na `app_jobs + workers`, bo `bc-scrape` i tenantization sa juz gotowe i to jest teraz najkrotsza droga do domkniecia execution plane.
