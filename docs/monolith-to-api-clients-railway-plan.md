# Plan rozbicia monolitu na API + 3 klienty pod Railway

## 1. Cel dokumentu

Ten dokument opisuje docelowy podzial obecnego monolitu FrinterHero na:

- `API` -> jeden centralny serwer podlaczony do PostgreSQL
- `client1` -> `przemyslawfilipiak`, obecny klient, traktowany jako baseline i **na starcie nie zmieniany**
- `client2` -> `focusequalsfreedom`, poczatkowo kopia obecnego klienta
- `client3` -> `frinter`, poczatkowo kopia obecnego klienta

Celem jest architektura gotowa do wdrozenia na `railway.app` jako infrastruktura rozproszona, z jasnym backlogiem dla agentow autonomicznych.

## 2. Twarde zalozenia

1. `client1` jest obecnym produktem referencyjnym i na etapie przygotowania splitu nie wolno go ruszac bez osobnej zgody.
2. `client2` i `client3` maja na starcie powstac jako kopie obecnego klienta, z tym samym panelem logowania i tym samym UX adminowym.
3. Tylko `API` ma miec bezposrednie polaczenie z baza danych.
4. Klienci nie moga wykonywac zapytan Drizzle/SQL bezposrednio.
5. Tlo processingu nie moze opierac sie na `globalThis` singletonach i lokalnym stanie procesu, bo to nie skaluje sie na Railway przy wielu instancjach.
6. Auth musi zostac przeprojektowany pod wiele domen klientow. Obecny cookie-only same-origin model nie wystarczy dla centralnego API.
7. Docelowo system ma wspierac rozwoj wielokliencki i wielobrandowy, wiec dane musza byc scope'owane tenantem/site.

## 3. Stan obecny: analiza monolitu

### 3.1 Architektura runtime dzisiaj

Obecna aplikacja to Astro SSR monolit z trzema rolami uruchomionymi w jednym procesie:

- public site
- admin SSR pages
- backend `/api/*`

Dodatkowo proces Node uruchamia lokalne joby w tle przez `child_process.spawn(...)`.

### 3.2 Fakty z kodu, ktore wymuszaja refactor

- `23` stron adminowych importuje `@/db/client` bezposrednio, czyli SSR page = backend query.
- `71` plikow w `src/pages/api` i `src/lib` importuje `@/db/client`, czyli logika backendowa jest rozproszona po route handlers i helperach.
- `13` plikow opiera job orchestration o `globalThis.__frinter_*`, `EventEmitter` i `spawn(...)`, czyli stan jobow zyje tylko w jednej instancji procesu.
- `52` pliki zawieraja twarde branding/domain coupling typu `Przemysław Filipiak`, `przemyslawfilipiak.com`, `P·F`, `frinter.app`.

### 3.3 Miejsca krytycznego sprzezenia

#### A. SSR pages czytaja DB bezposrednio

Przyklad:

- `src/pages/admin/index.astro`
- `src/pages/admin/social-hub/index.astro`
- `src/pages/admin/brand-clarity/index.astro`

To oznacza, ze obecne UI nie jest API-first. Po wydzieleniu backendu te strony nie beda mogly dzialac bez przebudowy na fetch do API albo na cienka warstwe BFF po stronie klienta.

#### B. Auth jest same-origin i powiazany z Astro middleware

Obecnie:

- `src/pages/api/auth.ts` tworzy rekord w tabeli `sessions`
- cookie `session=...` jest ustawiane przez ten sam origin
- `src/middleware.ts` czyta cookie i sprawdza sesje bezposrednio w DB

To nie skaluje sie w modelu:

- klient na domenie A
- klient na domenie B
- centralne API na domenie C

#### C. Joby w tle sa procesowo-lokalne

Przyklady:

- `src/lib/geo-job.ts`
- `src/lib/reddit-scrape-job.ts`
- `src/lib/yt-scrape-job.ts`
- `src/lib/bc-scrape-job.ts`
- `src/lib/bc-lp-parse-job.ts`
- `src/lib/bc-lp-gen-job.ts`
- `src/lib/sh-copywriter-job.ts`
- `src/lib/sh-video-job.ts`
- `src/lib/sh-queue-processor.ts`

To dziala tylko wtedy, gdy:

- request startujacy job trafi do tej samej instancji
- stream statusu i odczyt snapshotu trafia do tej samej instancji
- proces nie zostanie zrestartowany

W Railway + mikroserwisach to zalozenie jest falszywe.

#### D. Branding i SEO sa twardo zahardkodowane

Przyklady:

- `src/components/layouts/Base.astro`
- `src/pages/sitemap.xml.ts`
- `src/pages/rss.xml.ts`
- `public/llms.txt`
- `public/llms-full.txt`
- `public/robots.txt`
- `public/site.webmanifest`

To blokuje szybkie tworzenie kolejnych klientow, bo branding, canonicale, structured data i publiczne assety sa zszyte z jednym tenantem.

#### E. Start produkcyjny robi `drizzle-kit push`

W `package.json`:

- `start = "drizzle-kit push && HOST=0.0.0.0 node ./dist/server/entry.mjs"`

To jest ryzykowne po rozbiciu na kilka uslug, bo wiele instancji nie powinno robic schemowych operacji przy starcie.

### 3.4 Obecne moduly domenowe

Schema pokazuje nastepujace grupy tabel:

- core content: `articles`, `knowledge_entries`, `knowledge_sources`, `content_gaps`, `article_generations`
- auth/system: `sessions`, `geo_queries`, `geo_runs`
- Reddit Intelligence: `reddit_targets`, `reddit_scrape_runs`, `reddit_posts`, `reddit_extracted_gaps`
- YouTube Intelligence: `yt_targets`, `yt_scrape_runs`, `yt_comments`, `yt_extracted_gaps`
- Brand Clarity: `bc_*`
- SocialHub: `sh_*`

To jest juz logiczny podzial bounded contexts, ale dzisiaj wszystkie zyja w jednym deploymencie.

## 4. Najwazniejsze decyzje architektoniczne

### 4.1 Rekomendowany target repo

Najbezpieczniejszy target to monorepo:

```text
apps/
  api/
  client-przemyslawfilipiak/
  client-focusequalsfreedom/
  client-frinter/
packages/
  api-contract/
  site-config/
  auth-client/
  shared-types/
  shared-utils/
  shared-ui-admin/        # opcjonalnie dopiero po stabilizacji
workers/
  worker-geo/
  worker-reddit/
  worker-youtube/
  worker-bc/
  worker-sh-copy/
  worker-sh-video/
infra/
  railway/
docs/
```

### Dlaczego monorepo

- wspolne typy i kontrakty API
- mozliwosc kopiowania klientow bez rozjechania zaleznosci
- prostsze CI/CD i wspolne taski
- dobra baza pod dalsze mikroserwisy

### 4.2 API jako jedyne zrodlo prawdy dla DB

`apps/api` przejmuje:

- polaczenie z PostgreSQL
- Drizzle schema i migracje
- auth
- CRUD dla wszystkich modulow
- startowanie jobow
- odczyt statusow jobow
- webhooks i integracje zewnetrzne
- healthcheck i observability

Klienci nie maja importow do `db/client`.

### 4.3 Klienci jako cienkie SSR/BFF frontendy

Ze wzgledu na wiele domen i wspolny login, rekomendowany model to:

- public pages i admin UI zostaja w klientach
- klient ma cienka warstwe server-side/BFF dla sesji lokalnej domeny
- klient komunikuje sie z centralnym API server-to-server

To jest lepsze niz czysty browser -> central API, bo:

- nie trzeba trzymac dlugowiecznych tokenow w localStorage
- latwiej rozwiazac cookies na roznych domenach
- prostszy CSRF, refresh i redirect po zalogowaniu

### 4.4 Wieloklienckosc od warstwy danych

Potrzebny jest nowy koncept:

- `sites`
- albo `tenants`

Rekomendacja: tabela `sites`, np.:

- `id`
- `slug`
- `display_name`
- `primary_domain`
- `brand_config`
- `seo_config`
- `feature_flags`
- `status`

Kazda tabela domenowa musi miec `site_id`, chyba ze jest globalna z definicji.

### 4.5 Tlo processingu: kolejka + workery, nie singletony

Rekomendacja:

- `pg-boss` jako pierwszy etap kolejki, bo siedzi w PostgreSQL i upraszcza Railway bootstrap
- opcjonalnie Redis/BullMQ dopiero, gdy throughput i fan-out beda tego wymagaly

Kazdy job ma:

- rekord joba w DB
- status
- payload
- site scope
- logi lub wskaznik do log storage
- retry policy

## 5. Docelowa architektura logiczna

```text
                +---------------------------+
                | PostgreSQL                |
                | sites + domain tables     |
                +------------+--------------+
                             |
                             |
                    +--------v---------+
                    | API              |
                    | auth + CRUD +    |
                    | orchestration    |
                    +---+---+---+---+--+
                        |   |   |   |
                        |   |   |   +------------------+
                        |   |   |                      |
                        |   |   +--------------+       |
                        |   |                  |       |
               +--------v-+ +--------v-----+ +v------+------+
               | worker-  | | worker-bc    | | worker-sh    |
               | geo/redd | | lp/scrape    | | copy/video   |
               +----------+ +--------------+ +-------------+
                        ^
                        |
         +--------------+-------------------------------+
         |              |                               |
 +-------+------+ +-----+----------------+ +------------+---------+
 | client1      | | client2              | | client3              |
 | przemyslaw...| | focusequalsfreedom   | | frinter              |
 | public +     | | public + admin       | | public + admin       |
 | admin/BFF    | | BFF                  | | BFF                  |
 +--------------+ +----------------------+ +----------------------+
```

## 6. Strategia migracji bez naruszania client1

### 6.1 Zasada

`client1` nie jest pierwszym kandydatem do refactoru. Najpierw:

1. budujemy nowe `API`
2. kopiujemy obecny frontend do `client2` i `client3`
3. testujemy split na nowych klientach
4. dopiero na koncu podejmujemy decyzje, czy i kiedy przepinac `client1`

### 6.2 Dlaczego

To minimalizuje ryzyko zepsucia obecnego produktu i daje pole do:

- stabilizacji kontraktu API
- stabilizacji auth cross-domain
- stabilizacji kolejek i workerow

## 7. Projekt struktury aplikacji

### 7.1 `apps/api`

Odpowiedzialnosci:

- REST API lub REST-first JSON API
- walidacja payloadow
- repozytoria DB
- scheduler/job dispatch
- generowanie signed URLs / storage metadata
- centralny audit log

Moduly:

- `auth`
- `sites`
- `articles`
- `knowledge-base`
- `content-gaps`
- `geo`
- `reddit`
- `youtube`
- `brand-clarity`
- `social-hub`
- `jobs`
- `health`

### 7.2 `apps/client-*`

Odpowiedzialnosci:

- public site
- page composition
- branding/theme
- local domain session cookie
- admin rendering
- wywolania do centralnego API
- generowanie `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt` z `site-config`

Nieodpowiedzialnosci:

- brak bezposrednich zapytan do DB
- brak lokalnego child process orchestration
- brak lokalnej logiki backendowej duzego kalibru

### 7.3 `packages/site-config`

Minimalny wspolny kontrakt:

- `siteSlug`
- `siteName`
- `canonicalBaseUrl`
- `person/org metadata`
- `contact data`
- `llms endpoints`
- `social links`
- `default SEO`
- `feature flags`
- `theme tokens`

### 7.4 `packages/api-contract`

Zakres:

- DTO request/response
- enums statusow
- job payload types
- shared validation schemas
- generated client SDK

## 8. Auth: decyzja krytyczna

### 8.1 Problem

Obecny model:

- `/api/auth` ustawia cookie `session`
- `middleware.ts` czyta cookie i robi query do `sessions`

Po rozdzieleniu na osobne domeny nie mozna polegac na jednym same-origin cookie.

### 8.2 Rekomendacja

Model docelowy:

1. user otwiera `/admin/login` na danym kliencie
2. formularz logowania POSTuje do klientowego endpointu BFF
3. BFF wywoluje `API /auth/login`
4. API zwraca session grant / token set
5. klient ustawia **wlasne** HttpOnly cookie dla swojej domeny
6. kazde zapytanie adminowe z klienta idzie server-to-server do API

To daje:

- ten sam panel logowania w 3 klientach
- rozne domeny, ale spojna logike auth
- brak trzymania glownych tokenow w browserze

### 8.3 Tenant scope sesji

Do decyzji:

- jedna globalna sesja operatora dla wszystkich site'ow
- albo sesja + lista dozwolonych `site_slug`

Rekomendacja:

- jedna tozsamosc operatora
- sesja z `allowed_site_slugs`
- kazde zapytanie do API wymaga `site_slug`

## 9. Dane i migracje multi-tenant

### 9.1 Nowa tabela bazowa

`sites`

Przykladowe rekordy:

- `przemyslawfilipiak`
- `focusequalsfreedom`
- `frinter`

### 9.2 Tabele wymagajace `site_id`

Na pewno:

- `articles`
- `knowledge_sources`
- `knowledge_entries`
- `content_gaps`
- `article_generations`
- `geo_queries`
- `geo_runs`
- `reddit_targets`
- `reddit_scrape_runs`
- `reddit_posts`
- `reddit_extracted_gaps`
- `yt_targets`
- `yt_scrape_runs`
- `yt_comments`
- `yt_extracted_gaps`
- wszystkie `bc_*`
- wszystkie `sh_*`

Do rozstrzygniecia:

- `sessions` -> globalne albo site-aware

### 9.3 Brand voice i pliki publiczne

Obecnie SocialHub i draft generation czytaja m.in.:

- `public/llms-full.txt`
- `public/llms.txt`

To musi byc przeniesione do jednej z form:

- `sites.brand_config` / `sites.llm_context`
- object storage per site
- albo wersjonowany content w tabelach DB

Rekomendacja:

- metadata i male teksty w DB
- duze pliki brandingowe w object storage z referencja w DB

## 10. Kolejki, joby i workery

### 10.1 Co trzeba usunac z modelu monolitu

- `globalThis.__frinter_*`
- EventEmitter jako zrodlo prawdy
- status trzymany w RAM procesu
- request, ktory odpala child process i oczekuje, ze stream statusu trafi do tej samej instancji

### 10.2 Docelowy model joba

Kazdy job ma:

- `job_type`
- `site_id`
- `entity_id`
- `payload`
- `status`
- `attempt`
- `started_at`
- `finished_at`
- `error`
- `progress`

### 10.3 Docelowy podzial workerow

Docelowy, rekomendowany podzial to `6` workerow:

1. `worker-geo-drafts`
2. `worker-reddit`
3. `worker-youtube`
4. `worker-bc`
5. `worker-sh-copy`
6. `worker-sh-video`

Mapowanie z obecnego repo:

- `worker-geo-drafts`
  - `scripts/geo-monitor.ts`
  - `scripts/draft-bridge.ts`
  - dependency: `scripts/draft-generator.ts`
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

Powody takiego podzialu:

- `sh-video` musi byc osobno, bo to najciezszy pipeline CPU/network/media
- `sh-copy` ma inny profil pracy niz render video, wiec nie powinien walczyc o te same zasoby
- `reddit` i `youtube` maja inny failure mode i inne limity integracji
- `bc` to jeden spójny pipeline produktowy, wiec na start nie ma sensu rozbijac go na kilka workerow
- `geo` i `drafts` sa tekstowe, relatywnie lekkie i dobrze pasuja do jednego workera

### 10.4 Etapowanie workerow

Docelowy target to `6` workerow, ale rollout powinien byc etapowy:

Etap 1:

- `worker-geo-drafts`
- `worker-intelligence` (`reddit + youtube`)
- `worker-bc`
- `worker-sh` (`copy + video`) lub od razu osobny `worker-sh-video`, jesli render okaże sie kosztowny

Etap 2:

- rozbicie do pelnych `6` workerow

To daje bezpieczny start operacyjny i ogranicza liczbę serwisow, zanim kontrakty queue i job metadata sie ustabilizuja.

## 11. Railway: topologia wdrozenia

### 11.1 Minimalny etap produkcyjny

Uslugi:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `postgres`

Ten etap nadaje sie do pierwszego spin-upu kontraktow i UI, ale nie rozwiazuje jeszcze dobrze background jobs.

### 11.2 Docelowy etap rozproszony

Uslugi:

- `api`
- `worker-geo-drafts`
- `worker-reddit`
- `worker-youtube`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `postgres`

Opcjonalnie:

- `redis` dopiero jesli okaze sie potrzebny
- `object-storage` dla generated media i duzych assetow brandingowych

### 11.3 Rekomendowany deployment etapowy na Railway

Pierwszy sensowny rollout:

- `postgres`
- `migrate`
- `api`
- `worker-geo-drafts`
- `worker-bc`
- `worker-intelligence`
- `worker-sh-video` lub `worker-sh`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`

Po stabilizacji:

- rozbic `worker-intelligence` na `worker-reddit` i `worker-youtube`
- rozbic `worker-sh` na `worker-sh-copy` i `worker-sh-video`, jesli startowo bylo scalone

### 11.3 Release engineering

Migrations nie moga byc odpalane przez kazdy serwis przy starcie.

Trzeba wprowadzic:

- dedykowany `migrate` job
- albo Railway release phase

`api` i workery startuja dopiero po poprawnym wykonaniu migracji.

### 11.4 Start commands - model docelowy

Docelowe komendy startowe powinny byc jawnie rozdzielone na role runtime:

- `npm run start:api`
- `npm run start:client1`
- `npm run start:client2`
- `npm run start:client3`
- `npm run start:worker:geo-drafts`
- `npm run start:worker:reddit`
- `npm run start:worker:youtube`
- `npm run start:worker:bc`
- `npm run start:worker:sh-copy`
- `npm run start:worker:sh-video`
- `npm run migrate`

Najwazniejsza zasada:

- `db:push` i migracje nie moga juz byc zaszyte w `start`

### 11.5 Health model

`api`:

- musi miec `GET /health`
- musi miec `GET /ready`
- musi miec `GET /live`

`client-*`:

- powinny miec prosty endpoint gotowosci lub health

`worker-*`:

- nie musza wystawiac publicznego HTTP
- powinny raportowac heartbeat do DB/job runtime
- jesli platforma wymusi HTTP health, wystawic minimalny `/health`

## 12. Strategia wykonania agentowego

### 12.1 Zasady

- taski musza miec rozlaczne write scope'y
- zadania blokujace kontrakty wykonuja sie przed zadaniami UI
- `client1` nie jest write targetem az do finalnej fazy cutover
- `client2` i `client3` sa pierwszym polem testowym dla architektury API-first

### 12.2 Polecany podzial strumieni pracy

Strumienie:

- Stream A: architektura + kontrakty + monorepo bootstrap
- Stream B: DB + multi-tenant migrations
- Stream C: API core + auth
- Stream D: API modules content/knowledge/gaps
- Stream E: API modules Reddit/YouTube/GEO
- Stream F: API modules Brand Clarity/SocialHub
- Stream G: client shell + BFF + shared site config
- Stream H: client2/client3 clones
- Stream I: workers + queues
- Stream J: Railway + observability + release

## 13. Granularny backlog dla agentow autonomicznych

Kazdy task ma byc wykonywany jako osobny PR/commit lub bardzo mala grupa zmian.

### ARCH

#### ARCH-01

- Cel: utworzyc docelowy szkic monorepo bez migracji kodu domenowego.
- Scope: `apps/`, `packages/`, `workers/`, tooling root.
- Depends on: brak.
- Done: repo buduje puste aplikacje `api`, `client-*`, wspolne tsconfig i workspace dzialaja.

#### ARCH-02

- Cel: spisac i ustalic naming conventions dla `site_slug`, service names, env namespaces.
- Scope: `docs/adr-*`, root config.
- Depends on: ARCH-01.
- Done: jedna decyzja architektoniczna zatwierdza naming i boundaries.

#### ARCH-03

- Cel: wydzielic `packages/shared-types`.
- Scope: tylko typy i enums wspolne dla API i klientow.
- Depends on: ARCH-01.
- Done: brak importow klient->api runtime, tylko shared types.

#### ARCH-04

- Cel: wydzielic `packages/api-contract`.
- Scope: DTO, schemas, status enums, paginacja.
- Depends on: ARCH-03.
- Done: min. auth, articles, knowledge, content-gaps, jobs maja typowane kontrakty.

#### ARCH-05

- Cel: wydzielic `packages/site-config`.
- Scope: branding, domeny, SEO, contact, feature flags.
- Depends on: ARCH-03.
- Done: klient moze wyrenderowac podstawowe metadata na podstawie configu bez hardcodow.

#### ARCH-06

- Cel: przygotowac standard shared error envelope i trace id.
- Scope: API error handling, client adapter.
- Depends on: ARCH-04.
- Done: kazdy endpoint API zwraca spojny format bledu.

### DATA

#### DATA-01

- Cel: dodac tabele `sites`.
- Scope: schema + migrations.
- Depends on: ARCH-02.
- Done: istnieja rekordy seed dla `przemyslawfilipiak`, `focusequalsfreedom`, `frinter`.

#### DATA-02

- Cel: dodac `site_id` do core content tables.
- Scope: `articles`, `knowledge_*`, `content_gaps`, `article_generations`, `geo_*`.
- Depends on: DATA-01.
- Done: migracje backward-compatible, wszystkie stare rekordy przypisane do `przemyslawfilipiak`.

#### DATA-03

- Cel: dodac `site_id` do Reddit i YouTube tables.
- Scope: `reddit_*`, `yt_*`.
- Depends on: DATA-01.
- Done: wszystkie query i constraints wspieraja site scope.

#### DATA-04

- Cel: dodac `site_id` do `bc_*`.
- Scope: wszystkie Brand Clarity tables.
- Depends on: DATA-01.
- Done: Brand Clarity moze istniec rownolegle dla wielu site'ow.

#### DATA-05

- Cel: dodac `site_id` do `sh_*`.
- Scope: wszystkie SocialHub tables.
- Depends on: DATA-01.
- Done: SocialHub jest tenant-aware.

#### DATA-06

- Cel: zaprojektowac nowy storage dla brand voice / llms context.
- Scope: schema dla `site_content_assets` lub analogiczna tabela.
- Depends on: DATA-01.
- Done: `public/llms*.txt` nie sa jedynym zrodlem prawdy.

#### DATA-07

- Cel: przygotowac migracje idempotentne i oddzielic je od `npm start`.
- Scope: build/deploy scripts.
- Depends on: DATA-01.
- Done: migracje uruchamia osobny command/job.

### API-CORE

#### API-01

- Cel: utworzyc `apps/api` z podlaczeniem do PostgreSQL i Drizzle.
- Scope: server bootstrap, config, db layer.
- Depends on: ARCH-01, DATA-01.
- Done: `api` startuje lokalnie i wykonuje healthcheck.

#### API-02

- Cel: wydzielic warstwe repository/service dla core content.
- Scope: articles, knowledge, gaps, generations.
- Depends on: API-01, ARCH-04.
- Done: route handlers nie zawieraja surowej logiki biznesowej poza mapowaniem request/response.

#### API-03

- Cel: wydzielic modul `sites`.
- Scope: CRUD/read-only site config endpoints.
- Depends on: API-01, DATA-01, ARCH-05.
- Done: klient potrafi pobrac publiczny i adminowy site config przez API.

#### API-04

- Cel: dodac `site_slug` / `site_id` resolution middleware.
- Scope: API request context.
- Depends on: API-01, DATA-01.
- Done: kazdy tenant-aware endpoint ma jawny scope strony.

#### API-05

- Cel: zrobic versioning endpointow (`/v1/...`).
- Scope: router i kontrakty.
- Depends on: API-01.
- Done: nowy API surface nie zalezy od starej struktury `src/pages/api`.

#### API-06

- Cel: zbudowac endpointy health/ready/live.
- Scope: `/health`, `/ready`, `/live`, DB ping, queue ping.
- Depends on: API-01.
- Done: Railway ma czytelne health probes.

### AUTH

#### AUTH-01

- Cel: wydzielic API login/session service.
- Scope: `login`, `logout`, `refresh`, `me`.
- Depends on: API-01, ARCH-04.
- Done: API zarzadza sesjami niezaleznie od Astro middleware.

#### AUTH-02

- Cel: zmienic model sesji na bearer/session grant + tenant permissions.
- Scope: sessions, tokens, claims.
- Depends on: AUTH-01, DATA-01.
- Done: sesja ma informacje o site access.

#### AUTH-03

- Cel: przygotowac klientowy BFF auth adapter.
- Scope: `packages/auth-client` + client server endpoints.
- Depends on: AUTH-01, ARCH-04.
- Done: klient umie zalogowac usera i ustawic lokalne cookie domenowe.

#### AUTH-04

- Cel: zastapic Astro `middleware.ts` modelem opartym o BFF session check.
- Scope: klient shell.
- Depends on: AUTH-03.
- Done: admin pages sa chronione bez bezposredniego query do DB.

#### AUTH-05

- Cel: przygotowac CSRF/session invalidation strategy.
- Scope: auth security i cookies.
- Depends on: AUTH-03.
- Done: logout i session expiry dzialaja przewidywalnie na wielu domenach.

### API-CONTENT

#### CNT-01

- Cel: przeniesc Articles API.
- Scope: list/create/update/delete/publish.
- Depends on: API-02.
- Done: odpowiedniki obecnych routes `articles/*` dzialaja w `apps/api`.

#### CNT-02

- Cel: przeniesc Knowledge Base API.
- Scope: list/create/update/delete/import.
- Depends on: API-02.
- Done: import KB nie wymaga dostepu klienta do DB.

#### CNT-03

- Cel: przeniesc Content Gaps API.
- Scope: list/archive/acknowledge/proposals.
- Depends on: API-02.
- Done: wszystkie operacje content gap sa tenant-aware.

#### CNT-04

- Cel: przeniesc Draft Generation orchestration.
- Scope: start/status/stop oraz audit record.
- Depends on: API-02.
- Done: klient komunikuje sie tylko z API, nie ze starym monolitowym route.

### API-INTEL

#### INT-01

- Cel: przeniesc GEO endpoints i modele runow.
- Scope: query/start/status/stream metadata.
- Depends on: API-01, DATA-02.
- Done: API potrafi uruchomic GEO job dla konkretnego `site_id`.

#### INT-02

- Cel: przeniesc Reddit Intelligence API.
- Scope: targets, runs, gaps, filters.
- Depends on: API-01, DATA-03.
- Done: reddit flow jest tenant-aware.

#### INT-03

- Cel: przeniesc YouTube Intelligence API.
- Scope: targets, runs, comments-derived gaps.
- Depends on: API-01, DATA-03.
- Done: youtube flow jest tenant-aware.

### API-BC

#### BC-01

- Cel: przeniesc `bc_settings` do centralnego API.
- Scope: GET/PUT settings, provider config.
- Depends on: API-01, DATA-04.
- Done: klient nie czyta juz `bc_settings` lokalnie.

#### BC-02

- Cel: przeniesc projects/channels/videos CRUD.
- Scope: wszystkie CRUD i selectors.
- Depends on: API-01, DATA-04.
- Done: client pages pobieraja stan tylko z API.

#### BC-03

- Cel: przeniesc orchestration parse/scrape/cluster/generate.
- Scope: start/status/log stream metadata.
- Depends on: BC-01, BC-02, JOB-03.
- Done: job state nie siedzi w RAM procesu klienta.

### API-SH

#### SH-01

- Cel: przeniesc `sh_settings`, templates, accounts, analytics.
- Scope: SocialHub config endpoints.
- Depends on: API-01, DATA-05.
- Done: settings i templates sa tenant-aware.

#### SH-02

- Cel: przeniesc briefs/copy/render/publish endpoints.
- Scope: pelny lifecycle SocialHub brief.
- Depends on: API-01, DATA-05.
- Done: client nie importuje `sh-*` DB helpers.

#### SH-03

- Cel: przeniesc source-loader i KB matcher do service layer API.
- Scope: `sh-source-loader`, `sh-kb-matcher`.
- Depends on: SH-02.
- Done: source enrichment jest backend-only i tenant-aware.

#### SH-04

- Cel: przeniesc queue management do API.
- Scope: add/remove/reprioritize/run/stop/status.
- Depends on: SH-02, JOB-04.
- Done: kolejka dziala przez DB-backed dispatcher, nie przez lokalny singleton.

### CLIENT-PLATFORM

#### CL-01

- Cel: stworzyc nowy client shell z layoutem i routingiem public/admin.
- Scope: `apps/client-*` bootstrap.
- Depends on: ARCH-01, ARCH-05.
- Done: klient renderuje strone glowna i admin login bez DB.

#### CL-02

- Cel: wdrozyc site config consumption.
- Scope: metadata, canonical, JSON-LD, favicon/manifest wiring.
- Depends on: CL-01, API-03.
- Done: branding i domena nie sa hardcoded w layoutach.

#### CL-03

- Cel: przebudowac `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt`.
- Scope: per-client generation.
- Depends on: CL-02, CNT-01.
- Done: kazdy klient generuje wlasne public metadata.

#### CL-04

- Cel: wdrozyc auth BFF w kliencie.
- Scope: login page, logout, protected admin shell.
- Depends on: AUTH-03, CL-01.
- Done: panel logowania jest ten sam funkcjonalnie na wszystkich klientach.

#### CL-05

- Cel: zbudowac API client adapter z traceable error handling.
- Scope: server-side fetch wrappers.
- Depends on: ARCH-06.
- Done: wszystkie admin pages korzystaja z jednego adaptera.

#### CL-06

- Cel: przebudowac admin dashboard pages na API-first.
- Scope: strony adminowe bez importu `@/db/client`.
- Depends on: CL-05, CNT-01, CNT-02, CNT-03.
- Done: zero bezposrednich query DB w klientach.

### CLIENT-SITES

#### SITE-01

- Cel: utworzyc `client-przemyslawfilipiak` jako snapshot obecnego frontendu referencyjnego.
- Scope: kopia bez zmian funkcjonalnych.
- Depends on: ARCH-01.
- Done: istnieje oddzielny app folder dla client1.

#### SITE-02

- Cel: utworzyc `client-focusequalsfreedom` jako kopie client1.
- Scope: bootstrap klienta, bez wlasnych customizacji biznesowych.
- Depends on: SITE-01.
- Done: app sie uruchamia z placeholderowym brandingiem focus-equals-freedom.

#### SITE-03

- Cel: utworzyc `client-frinter` jako kopie client1.
- Scope: bootstrap klienta, bez wlasnych customizacji biznesowych.
- Depends on: SITE-01.
- Done: app sie uruchamia z brandingiem frinter.

#### SITE-04

- Cel: przepiac client2 na centralne API.
- Scope: auth, admin, public data.
- Depends on: CL-06, AUTH-04.
- Done: client2 dziala bez lokalnego DB access.

#### SITE-05

- Cel: przepiac client3 na centralne API.
- Scope: auth, admin, public data.
- Depends on: CL-06, AUTH-04.
- Done: client3 dziala bez lokalnego DB access.

#### SITE-06

- Cel: przygotowac decyzje cutover dla client1.
- Scope: parity checklist i explicit signoff.
- Depends on: SITE-04, SITE-05.
- Done: istnieje raport roznic i plan bezpiecznego przepiecia lub pozostawienia client1 na osobnym etapie.

### JOBS

#### JOB-01

- Cel: zaprojektowac wspolny model `jobs` i `job_events`.
- Scope: schema + service contract.
- Depends on: DATA-01, ARCH-04.
- Done: API i workery operuja na jednym modelu job state.

#### JOB-02

- Cel: wdrozyc kolejke `pg-boss`.
- Scope: bootstrap, topics, retries, dead-letter handling.
- Depends on: JOB-01.
- Done: worker moze pobrac i przetworzyc job niezaleznie od instancji API.

#### JOB-03

- Cel: zmigrowac Brand Clarity joby na queue workers.
- Scope: LP parse, scrape, cluster, generate.
- Depends on: JOB-02, BC-02.
- Status now: rozpoczetne.
- Done so far: centralne `bc-scrape` jest juz enqueue'owane do `app_jobs` i obslugiwane przez worker runner.
- Remaining: `bc-parse`, `bc-selector`, `bc-cluster`, `bc-generate`, oraz zamiana `status/stream` z RAM/EventEmitter na DB-backed contract.

#### JOB-04

- Cel: zmigrowac SocialHub copy/render queue.
- Scope: copywriter, video render, queue processor.
- Depends on: JOB-02, SH-02.
- Status now: nieukonczone.
- Remaining: `generate-copy`, `render(video)`, `publish`, `queue.ts`, `sh-queue-processor.ts`, `sh-copywriter-job.ts`, `sh-video-job.ts`.

#### JOB-05

- Cel: zmigrowac GEO/Reddit/YouTube joby.
- Scope: start/status/log routing.
- Depends on: JOB-02, INT-01, INT-02, INT-03.
- Status now: czesciowo zakonczone.
- Done so far: GEO, draft, Reddit i YouTube maja juz centralne joby.
- Remaining: dopiac persisted event/log contract zamiast czesci legacy-compatible status bridge.

#### JOB-06

- Cel: zaprojektowac log streaming z DB/job events zamiast EventEmitter RAM-only.
- Scope: SSE/polling contracts.
- Depends on: JOB-01.
- Done: klient moze odczytywac postep z dowolnej instancji.

### OPS

#### OPS-01

- Cel: rozpisac Railway service matrix i env matrix.
- Scope: `infra/railway`.
- Depends on: ARCH-01, API-01, SITE-02, SITE-03.
- Done: wiadomo jakie zmienne ma kazdy service.

#### OPS-02

- Cel: przygotowac osobny migrate command/service.
- Scope: release flow.
- Depends on: DATA-07.
- Done: zadna usluga runtime nie robi automatycznego `drizzle-kit push` przy starcie.

#### OPS-03

- Cel: wdrozyc observability basics.
- Scope: request ids, structured logs, job ids, site ids.
- Depends on: API-06, JOB-01.
- Done: logi sa filtrowalne po `site_slug` i `job_id`.

#### OPS-04

- Cel: przygotowac storage strategy dla media i branding assets.
- Scope: object storage / signed URLs.
- Depends on: SH-02, DATA-06.
- Done: generated media nie zalezy od lokalnego filesystemu pojedynczego klienta.

#### OPS-05

- Cel: CI/CD matrix dla API, workers i trzech klientow.
- Scope: GitHub Actions / Railway pipelines.
- Depends on: ARCH-01.
- Done: mozna deployowac uslugi niezaleznie.

#### OPS-06

- Cel: rollback i disaster recovery plan.
- Scope: DB backup, rollback contracts, queue draining.
- Depends on: OPS-02.
- Done: istnieje proceduralny runbook.

### CUTOVER

#### CUT-01

- Cel: uruchomic API + client2 na staging.
- Scope: staging infra.
- Depends on: SITE-04, OPS-01.
- Done: end-to-end flow dziala na jednym nowym kliencie.

#### CUT-02

- Cel: uruchomic API + client3 na staging.
- Scope: staging infra.
- Depends on: SITE-05, OPS-01.
- Done: end-to-end flow dziala na drugim nowym kliencie.

#### CUT-03

- Cel: porownac parity z obecnym client1.
- Scope: admin, content, SEO, jobs.
- Depends on: CUT-01, CUT-02.
- Done: lista brakow i regresji jest zamknieta.

#### CUT-04

- Cel: decyzja czy client1 migruje teraz czy zostaje na osobnym etapie.
- Scope: product + architecture signoff.
- Depends on: CUT-03, SITE-06.
- Done: jest jawna decyzja i data cutover albo freeze.

## 14. Kolejnosc wdrozenia

### Faza 0 - przygotowanie

- ARCH-01..06
- DATA-01
- DATA-07

### Faza 1 - fundament multi-tenant

- DATA-02..06
- API-01..06
- AUTH-01..05

### Faza 2 - migracja backendu domenowego

- CNT-01..04
- INT-01..03
- BC-01..03
- SH-01..04

### Faza 3 - klient platformowy

- CL-01..06
- SITE-01..03

### Faza 4 - rozproszony background processing

- JOB-01..06
- OPS-03..04

### Faza 5 - deploy i cutover

- OPS-01..02
- OPS-05..06
- CUT-01..04

## 15. Co mozna wykonywac rownolegle

Rownolegle po ARCH-01:

- ARCH-03
- ARCH-05
- OPS-05

Rownolegle po DATA-01:

- DATA-02
- DATA-03
- DATA-04
- DATA-05
- DATA-06

Rownolegle po API-01:

- API-03
- API-06
- AUTH-01
- CNT-01
- INT-01

Rownolegle po CL-01:

- CL-02
- CL-04
- SITE-02
- SITE-03

Rownolegle po JOB-02:

- JOB-03
- JOB-04
- JOB-05

## 16. Kryteria akceptacji architektury docelowej

Projekt mozna uznac za zakonczony dopiero gdy:

1. Zaden klient nie importuje `db/client`.
2. Wszystkie dane publiczne i adminowe sa tenant-aware.
3. Auth dziala na trzech roznych domenach klientow.
4. `client2` i `client3` dzialaja w pelni przez centralne API.
5. Background jobs nie zależa od lokalnej pamieci procesu.
6. `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt` sa generowane per klient.
7. Migracje nie sa odpalane przez runtime `start`.
8. Railway umie wdrozyc API, workery i klientow niezaleznie.

## 17. Najwieksze ryzyka

### RYZYKO-01: Cross-domain auth

Jesli zostanie zignorowane, login zacznie byc niestabilny lub niebezpieczny. To jest krytyczny temat architektoniczny, nie detal implementacyjny.

### RYZYKO-02: Pozorne wydzielenie API

Samo przeniesienie route handlers bez odciecia DB importow z klientow nic nie da. Trzeba usunac SSR pages zalezne bezposrednio od DB.

### RYZYKO-03: Joby nadal stanowe per instancja

Jesli tylko przeniesiemy kod do `apps/api`, ale zostawimy `globalThis` i `spawn`, system dalej nie bedzie rozproszony.

### RYZYKO-04: Brak `site_id` od poczatku

Bez tego client2 i client3 beda tylko kopiami UI, ale nie oddzielnymi tenantami systemu.

### RYZYKO-05: Branding pozostanie w plikach

Jesli `Base.astro`, `sitemap`, `rss`, `llms*.txt` pozostana zahardkodowane, koszt utrzymania trzech klientow eksploduje.

## 18. Rekomendacja wykonawcza

Najbezpieczniejsza droga:

1. Nie refaktorowac obecnego klienta in-place.
2. Zbudowac `apps/api` oraz fundament `sites + auth + contracts`.
3. Postawic `client2` i `client3` jako pierwszych konsumentow nowego API.
4. Zmigrowac background jobs do workerow.
5. Dopiero po parity review podejmowac decyzje o przepieciu `client1`.

## 19. Minimalny pierwszy milestone

Milestone M1:

- `apps/api` dziala
- `sites` istnieje
- auth BFF dziala
- `client2` i `client3` startuja
- public metadata sa site-config driven
- Articles/Knowledge/Content Gaps dzialaja przez API

To jest pierwszy punkt, w ktorym architektura przestaje byc monolitem, ale jeszcze nie wymaga pelnej migracji wszystkich workerow.

Status realizacji:

- [x] `apps/api` bootstrap i runtime M1
- [x] tabela `sites` i seed 3 tenantow
- [x] tabela `app_jobs`
- [x] auth BFF dla `client2` i `client3`
- [x] osobne runtime `client2` i `client3`
- [x] public articles przez centralne API
- [x] public shell `client2/client3` (`/`, `/blog`, `/blog/[slug]`) przez centralne API
- [x] per-client `robots.txt`, `sitemap.xml`, `rss.xml`, `llms.txt`, `llms-full.txt`, `site.webmanifest` w BFF
- [x] `packages/site-config/src/index.ts` i publiczny `llmContext` w `GET /v1/sites/:slug/public-config`
- [x] admin Articles/Knowledge Base/Content Gaps przez centralne API
- [x] `worker-general` dla `geo` i `draft`
- [x] template'y Railway + env matrix + migrate runtime
- [x] fallback proxy z `client2/client3` do legacy runtime dla nieprzeniesionych modulow
- [x] pierwszy bridge Social Hub przez centralne API: `settings`, `accounts`, `templates`, `briefs`, `sources`, `analytics`
- [x] pierwszy bridge Reddit data plane przez centralne API: `targets`, `runs`, `gaps`, `approve`, `reject`, `auto-filter`
- [x] pierwszy bridge YouTube data plane przez centralne API: `overview`, `targets`, `runs`, `gaps`, `approve`, `reject`, `auto-filter`
- [x] pierwszy bridge Brand Clarity management slice przez centralne API: `settings`, `projects`, `documentation`, `channels`, `confirm-all`, `videos`, `add-manual`
- [x] pierwszy bridge execution plane dla Reddit i YouTube przez `app_jobs` + worker runner (`start/status/stream`)
- [x] `site_id` foundation dla Reddit i YouTube tables oraz API scope per `siteSlug`
- [x] `site_id` foundation dla Brand Clarity tables oraz centralny BC management scope per `siteSlug`
- [x] pierwszy centralny Brand Clarity worker topic: `bc-scrape`
- [ ] pelne odciecie SSR admin pages od bezposredniego DB access
- [ ] pelna migracja Social Hub / Brand Clarity / Reddit / YouTube do centralnego API

## 20. Suggested next action

Aktualny handoff na kolejna sesje jest zapisany w:

- `docs/next-session-handoff-2026-03-18.md`
