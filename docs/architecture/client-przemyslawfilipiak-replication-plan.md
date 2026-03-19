# Plan replikacji `client-przemyslawfilipiak` na `client-focusequalsfreedom` i `client-frinter`

Data: `2026-03-19`

## Status wykonania

Stan na `2026-03-20`:

- `apps/client-focusequalsfreedom` i `apps/client-frinter` zostały doprowadzone do pełnego app shape `apps/client-przemyslawfilipiak`
- wszystkie trzy klienty budują się poprawnie lokalnie:
  - `npm run build:client1`
  - `npm run build:client2`
  - `npm run build:client3`
- wdrożono healthcheck route `/health` dla wszystkich trzech klientów
- wdrożono tenant-local slug uniqueness dla artykułów przez `migrations/0010_articles_site_slug_scope.sql`
- tabela `sites` zawiera wymagane rekordy:
  - `1 / przemyslawfilipiak`
  - `2 / focusequalsfreedom`
  - `3 / frinter`
- legacy rekordy biznesowe z `site_id IS NULL` zostały przypięte do `site_id = 1` dla:
  - `articles`
  - `article_generations`
  - `content_gaps`
  - `geo_queries`
  - `geo_runs`
  - `knowledge_entries`
  - `knowledge_sources`
- smoke HTTP na środowisku Railway potwierdził `200` dla:
  - `api`
  - `client-focusequalsfreedom`
  - `client-frinter`

Pozostały otwarty punkt operacyjny:

- `client-przemyslawfilipiak` wymaga jeszcze potwierdzenia na live/custom domain, bo `https://przemyslawfilipiak.com/health` zwróciło `404` podczas ostatniego smoke testu

## 0. Kontekst wykonawczy

Ten dokument ma służyć nie tylko jako plan architektoniczny, ale też jako instrukcja wykonawcza dla autonomicznych agentów pracujących równolegle w repo.

Agent startujący pracę nad tym planem powinien przyjąć jako runtime truth:

- `apps/client-przemyslawfilipiak` jest aktualnym klientem referencyjnym
- `apps/client-focusequalsfreedom` i `apps/client-frinter` mają zostać doprowadzone do pełnej zgodności funkcjonalnej z klientem referencyjnym
- `apps/api` pozostaje centralnym backendem
- `src/*` pozostaje shared domain / db / utils layer
- klient nie powinien odzyskiwać bezpośredniego DB access dla logiki admin/API
- tenant scope ma płynąć z `SITE_SLUG -> sites -> site_id`

Powiązane dokumenty referencyjne:

- `docs/architecture/current-architecture-reference.md`
- `docs/architecture/monolith-to-api-clients-railway-plan.md`
- `docs/deployment/railway-distributed-deployment.md`

Założenia operacyjne:

- użytkownik chce zachować tę samą tożsamość witryny na wszystkich trzech klientach
- wszyscy trzej klienci korzystają z tej samej bazy danych
- izolacja danych między klientami odbywa się przez `SITE_SLUG` i `site_id`
- na starcie ich panel admina i blog mogą być puste, ale nie mogą rzucać `500`
- jeśli w repo istnieją poprawki tylko w `client-przemyslawfilipiak`, to należy je traktować jako kandydatów do replikacji do pozostałych dwóch klientów

Definicja sukcesu dla agenta:

- oba klienci docelowi mają ten sam routing, UI i admin co klient referencyjny
- tenant writes trafiają do poprawnego `site_id`
- puste bazy nie powodują regresji
- nie ma przecieku danych między tenantami

## 1. Cel

Celem jest doprowadzenie:

- `apps/client-focusequalsfreedom` dla `site_id = 2`
- `apps/client-frinter` dla `site_id = 3`

do stanu, w którym oba klienty są funkcjonalnie identyczne z:

- `apps/client-przemyslawfilipiak` dla `site_id = 1`

Zakres identyczności:

- ten sam publiczny frontend
- ten sam panel admina
- te same podstrony
- ten sam blog
- ta sama logika BFF
- ta sama logika integracji z `apps/api`
- ta sama logika jobów i workerów

Jedyna różnica między klientami ma wynikać z tenant context:

- własny `SITE_SLUG`
- własny `site_id`
- własne domeny i env

Nie planujemy odrębnej tożsamości wizualnej ani odrębnych feature flag dla tych dwóch klientów.

## 2. Stan obecny

Na dziś:

- `apps/client-przemyslawfilipiak` jest pełnym Astro appem z kompletnym frontendem i adminem
- `apps/client-focusequalsfreedom` i `apps/client-frinter` są cienkimi shellami BFF
- centralny backend działa w `apps/api`
- worker topology jest wspólna dla wszystkich klientów
- tenant scope jest oparty o `sites`, `SITE_SLUG` i `site_id`

Wniosek:

- replikacja nie powinna polegać na przepisywaniu logiki backendowej
- replikacja powinna polegać na ujednoliceniu obu klientów do tego samego runtime shape co `client-przemyslawfilipiak`

## 3. Zasada docelowa

Docelowo wszystkie trzy klienty powinny być tym samym appem Astro w trzech osobnych workspace'ach:

- `apps/client-przemyslawfilipiak`
- `apps/client-focusequalsfreedom`
- `apps/client-frinter`

Każdy z nich powinien różnić się wyłącznie konfiguracją tenantową:

- `SITE_SLUG`
- domena
- env
- baza danych

Logika stron, admina, routingu i wywołań API ma pozostać taka sama.

## 4. Podejście implementacyjne

Najbezpieczniejsze podejście to replikacja kodu `client-przemyslawfilipiak` jako nowej bazy referencyjnej dla pozostałych klientów, a dopiero później ewentualne wydzielenie wspólnego pakietu.

Powód:

- chcemy uzyskać szybki, przewidywalny efekt 1:1
- obecne dwa klienty są shellami, więc i tak wymagają pełnego wyrównania
- przedwczesne budowanie shared app package zwiększyłoby ryzyko i zakres zmian

Czyli etap 1:

- osiągnąć pełną zgodność funkcjonalną przez skopiowanie app shape

Ewentualny etap 2 później:

- odchudzić duplikację przez ekstrakcję wspólnych layoutów, stron i komponentów

## 5. Zakres prac

### 5.1 Workspace apps

Należy doprowadzić:

- `apps/client-focusequalsfreedom`
- `apps/client-frinter`

do struktury zgodnej z:

- `apps/client-przemyslawfilipiak`

To obejmuje:

- `src/pages`
- `src/components`
- `src/layouts`
- `src/lib`
- `src/styles`
- `public`
- `astro.config.*`
- `package.json`
- local env expectations

### 5.2 BFF i routy API klienta

Oba klony muszą mieć ten sam zestaw route handlers co klient referencyjny, w szczególności:

- admin API proxy
- auth/session proxy
- draft status/log polling
- blog/public content routes
- wszystkie thin BFF endpointy w `src/pages/api/*`

Warunek:

- nie wolno przywrócić bezpośredniego dostępu klienta do DB dla logiki admin/API
- klient ma pozostać cienką warstwą UI + BFF nad `apps/api`

### 5.3 Publiczne strony i blog

Oba klienty muszą odziedziczyć:

- homepage
- blog list
- blog article page
- related articles / `See also`
- wszystkie strony marketingowe i pomocnicze
- healthcheck

Treści mają być puste na początku nie dlatego, że front ma inną logikę, tylko dlatego, że wspólna baza może nie mieć jeszcze danych przypisanych do `site_id = 2` i `site_id = 3`.

### 5.4 Panel admina

Oba klienty muszą odziedziczyć pełny admin:

- dashboard
- Reddit Intelligence
- YouTube Intelligence
- Brand Clarity
- Knowledge Base
- Content Gaps
- Social Hub
- Articles / blog publishing
- auth flow

Panel ma działać identycznie jak dla `client-przemyslawfilipiak`, ale na pustych danych startowych.

### 5.5 Tenant identity

Każdy klient musi wysyłać właściwy kontekst tenantowy:

- `client-przemyslawfilipiak` -> `SITE_SLUG=przemyslawfilipiak`
- `client-focusequalsfreedom` -> `SITE_SLUG=focusequalsfreedom`
- `client-frinter` -> `SITE_SLUG=frinter`

Backend ma dalej rozwiązywać:

- `SITE_SLUG` -> rekord `sites`
- rekord `sites` -> właściwy `site_id`

To oznacza, że kod klienta nie powinien hardkodować `site_id`.

`site_id` ma wynikać z bazy i tenant resolution w `apps/api`.

## 6. Wymagania danych i bazy

Wszyscy trzej klienci mają korzystać z jednej wspólnej bazy danych.

To oznacza:

- wspólny `DATABASE_URL` dla backend stacku
- seeded `sites` table z poprawnym wpisem tenantowym
- izolację danych przez `site_id`
- puste dane biznesowe dla `site_id = 2` i `site_id = 3` są akceptowalne

Minimalny warunek dla wspólnej bazy:

1. schema aktualna względem repo
2. seeded `sites`
3. obecność wpisów:
   - `site_id = 1` / `przemyslawfilipiak`
   - `site_id = 2` / `focusequalsfreedom`
   - `site_id = 3` / `frinter`

Model docelowy nie jest single-tenant. Obecna architektura pozostaje tenant-aware i wymaga poprawnego działania `sites`, `SITE_SLUG` i `site_id` we wspólnej bazie.

## 7. Plan wykonania

### Etap 1. Audyt różnic między klientami

Porównać:

- `apps/client-przemyslawfilipiak`
- `apps/client-focusequalsfreedom`
- `apps/client-frinter`

Cel:

- ustalić, które pliki w `client2` i `client3` są cienkimi placeholderami
- ustalić, czy są tam jakiekolwiek lokalne odstępstwa, które trzeba zachować

Oczekiwany wynik:

- lista plików do pełnego zastąpienia
- lista plików konfiguracyjnych do zachowania per klient

### Etap 2. Replikacja app shape

Skopiować z `client-przemyslawfilipiak` do obu klientów:

- wszystkie strony
- komponenty
- layouty
- public assets
- style
- klientowe routy API
- helpery klientowe

Zachować odrębnie tylko te elementy, które muszą być per klient:

- `package.json` name
- `SITE_SLUG`
- ewentualne drobne build labels

### Etap 3. Ujednolicenie konfiguracji

Sprawdzić i wyrównać:

- `astro.config.*`
- workspace scripts
- `package.json`
- healthcheck routes
- `API_BASE_URL`
- env contract

Cel:

- każdy klient ma budować się i startować tak samo
- jedyna różnica to `SITE_SLUG` i domena

### Etap 4. Weryfikacja tenant flow

Sprawdzić dla `client-focusequalsfreedom` i `client-frinter`:

- logowanie admina
- odczyt dashboardu
- tworzenie joba
- zapis artykułu
- publikację artykułu
- odczyt bloga

Szczególnie zweryfikować, że write path idzie do właściwego tenant context:

- rekordy trafiają do właściwego `site_id`
- slug uniqueness pozostaje tenant-local
- `related articles` i `See also` nie przeciekają między tenantami

### Etap 5. Smoke test na pustych bazach

Przy pustych danych dla `site_id = 2` i `site_id = 3` oba klienty powinny:

- poprawnie się uruchomić
- poprawnie logować do admina
- pokazywać puste listy bez 500
- umożliwiać rozpoczęcie pracy od zera

To jest kluczowy warunek akceptacji.

## 8. Zmiany w Railway

Dla każdego klienta potrzebne będą:

- osobny web service
- API i workery muszą działać w modelu tenant-aware nad tą samą wspólną bazą
- env klienta musi poprawnie przekazywać `SITE_SLUG`

Jeśli rollout pozostaje wspólny dla wszystkich tenantów, backend stack może pozostać wspólny:

- `api`
- `worker-general`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`

Sam web service nie wystarczy, bo zapis musi trafiać do właściwego `site_id` we wspólnej bazie.

## 9. Krytyczne ryzyka

### 9.1 Dryf między trzema klientami

Jeśli po replikacji zaczniemy poprawiać tylko `client-przemyslawfilipiak`, a pozostałych nie, to bardzo szybko wróci asymetria.

Wniosek:

- po zakończeniu migracji trzeba traktować wszystkie trzy klienty jako jeden produkt w trzech deploymentach

### 9.2 Hardcoded branding

Trzeba przejrzeć:

- hero copy
- meta tags
- site config
- canonical URLs
- sitemap
- RSS / OG

Bo obecny klient referencyjny zawiera branding `Przemysław Filipiak`, a użytkownik wymaga tej samej tożsamości witryny tylko na innych klientach. To trzeba utrzymać świadomie, a nie przypadkiem.

### 9.3 Założenia o niepustych danych

Admin i publiczne strony muszą działać poprawnie na pustej bazie:

- bez 500
- bez błędów dat
- bez założeń, że istnieje co najmniej jeden projekt, gap, artykuł albo wpis KB

### 9.4 Tenant leakage

Każde miejsce korzystające z:

- `siteSlug`
- `siteId`
- `articles`
- `knowledge_entries`
- `content_gaps`
- `sh_*`

musi być sprawdzone pod kątem przecieku danych między tenantami.

## 10. Kryteria akceptacji

Prace można uznać za zakończone, jeśli:

1. `client-focusequalsfreedom` i `client-frinter` renderują ten sam frontend co `client-przemyslawfilipiak`.
2. Oba klienty mają ten sam panel admina i ten sam routing.
3. Oba klienty używają tego samego API/BFF flow.
4. Nie ma bezpośredniego DB access w kliencie dla logiki admin/API.
5. Każdy klient zapisuje do wspólnej bazy, ale do właściwego `site_id`.
6. Tenant resolution kończy się zapisem do właściwego `site_id`.
7. Puste dane dla `site_id = 2` i `site_id = 3` nie powodują `500` ani regresji UX.
8. Blog, publikacja artykułów i internal linking działają tenantowo poprawnie.

## 11. Rekomendacja wykonawcza

Rekomendowany porządek realizacji:

1. wykonać pełny diff między trzema klientami
2. skopiować app shape `client-przemyslawfilipiak` do `client-focusequalsfreedom`
3. skopiować app shape `client-przemyslawfilipiak` do `client-frinter`
4. wyrównać konfigurację env i scripts
5. zweryfikować tenant writes dla `site_id = 2` i `site_id = 3`
6. uruchomić smoke test na pustych bazach
7. dopiero potem rozważać refactor do wspólnego pakietu frontendowego

Najważniejsza zasada:

- najpierw osiągnąć identyczne zachowanie
- dopiero później redukować duplikację kodu

## 12. Granularne taski dla agentów autonomicznych

Poniższy podział zakłada równoległą pracę kilku agentów. Każdy task ma jasny zakres, oczekiwany rezultat i granice odpowiedzialności.

### Agent A. Audyt różnic workspace'ów klientów

Zakres:

- porównać `apps/client-przemyslawfilipiak` z:
  - `apps/client-focusequalsfreedom`
  - `apps/client-frinter`

Do sprawdzenia:

- brakujące katalogi
- brakujące strony
- brakujące komponenty
- brakujące routy API
- różnice w `astro.config.*`
- różnice w `package.json`
- różnice w `public`
- różnice w `src/lib`, `src/layouts`, `src/styles`

Deliverable:

- raport różnic file-by-file
- lista plików do pełnego skopiowania
- lista plików, które muszą pozostać tenant-specific

Definition of done:

- agent potrafi wskazać dokładny write scope potrzebny do replikacji `client2` i `client3`

### Agent B. Replikacja `client-przemyslawfilipiak` do `client-focusequalsfreedom`

Zakres:

- doprowadzić `apps/client-focusequalsfreedom` do tego samego app shape co `apps/client-przemyslawfilipiak`

Ownership:

- tylko `apps/client-focusequalsfreedom`
- powiązane wpisy skryptów/build config, jeśli są niezbędne dla tego klienta

Do wykonania:

- skopiować strony, komponenty, layouty, style i assets
- skopiować klientowe API routes
- zachować poprawny `SITE_SLUG=focusequalsfreedom`
- nie przywrócić local DB logic

Deliverable:

- gotowy workspace klienta budujący się jak klient referencyjny

Definition of done:

- `build:client2` działa
- routing i admin istnieją
- klient używa tenant context `focusequalsfreedom`

### Agent C. Replikacja `client-przemyslawfilipiak` do `client-frinter`

Zakres:

- doprowadzić `apps/client-frinter` do tego samego app shape co `apps/client-przemyslawfilipiak`

Ownership:

- tylko `apps/client-frinter`
- powiązane wpisy skryptów/build config, jeśli są niezbędne dla tego klienta

Do wykonania:

- skopiować strony, komponenty, layouty, style i assets
- skopiować klientowe API routes
- zachować poprawny `SITE_SLUG=frinter`
- nie przywrócić local DB logic

Deliverable:

- gotowy workspace klienta budujący się jak klient referencyjny

Definition of done:

- `build:client3` działa
- routing i admin istnieją
- klient używa tenant context `frinter`

### Agent D. Tenant safety i przepływ zapisu

Zakres:

- sprawdzić, czy wszystkie write paths w zreplikowanych klientach zapisują przez `apps/api` z poprawnym tenant context

Do sprawdzenia:

- auth
- articles
- knowledge base
- content gaps
- Reddit Intelligence
- YouTube Intelligence
- Brand Clarity
- Social Hub
- draft jobs i job status polling

Deliverable:

- lista miejsc, które zależą od `SITE_SLUG`
- lista miejsc, które mogłyby przeciekać między tenantami
- ewentualne poprawki tenant guards

Definition of done:

- brak hardcoded `site_id`
- brak zapisów bez tenant resolution

### Agent E. Empty-state hardening

Zakres:

- upewnić się, że sklonowane klienty poprawnie działają na pustej bazie

Do sprawdzenia:

- dashboard admina
- blog list
- blog article page przy braku wpisów
- knowledge base
- brand clarity
- reddit / youtube intelligence
- content gaps
- social hub

Deliverable:

- lista miejsc, które zakładają niepuste dane
- poprawki usuwające `500`
- spójne empty states

Definition of done:

- na pustej bazie klient nie wywala się na SSR ani w panelu admina

### Agent F. Railway i env contract

Zakres:

- przygotować kontrakt deployowy dla trzech klientów przy oddzielnych bazach

Do sprawdzenia:

- `infra/railway/*.toml`
- build/start commands
- `watchPatterns`
- env vars per service
- `SITE_SLUG`
- `API_BASE_URL`
- healthchecks

Deliverable:

- lista env vars per client rollout
- lista usług wymaganych per klient
- wskazanie, co musi być osobne, a co może pozostać wspólne

Definition of done:

- da się wdrożyć `client-focusequalsfreedom` i `client-frinter` bez ręcznego zgadywania env contractu

## 13. Sugerowana kolejność delegacji

Najbardziej efektywna kolejność pracy agentów:

1. Agent A wykonuje audyt i przygotowuje mapę różnic.
2. Agent B i Agent C pracują równolegle na rozłącznych workspace'ach klientów.
3. Agent D równolegle sprawdza tenant safety w kodzie wspólnym i klientowym.
4. Agent E wchodzi po pierwszym spięciu replik i wzmacnia empty states.
5. Agent F przygotowuje finalny kontrakt Railway i env dla wdrożenia.

## 14. Zasady pracy agentów

Każdy agent powinien przestrzegać następujących zasad:

- nie edytować `apps/client-przemyslawfilipiak`, chyba że task dotyczy shared bugfixu wymagającego propagacji do wszystkich klientów
- nie revertować zmian innych agentów
- traktować `client-przemyslawfilipiak` jako źródło prawdy dla UI i admina
- nie wprowadzać nowych różnic brandingowych między klientami
- nie dodawać direct DB access do klientów
- raportować pliki zmienione oraz luki, których nie dało się domknąć bez decyzji architektonicznej
