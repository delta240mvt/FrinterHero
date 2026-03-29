# FrinterHero — 22–29.03.2026

**194 commity** w tym tygodniu.

---

## 1. 🏠 Szybsza strona Frinter

Strona ładowała się wolno bo CSS był osobnym plikiem — przeglądarka musiała go ściągnąć zanim cokolwiek pokazała. Teraz CSS jest wklejony bezpośrednio w HTML. Animacje (hero, canvas) startują dopiero gdy strona jest już widoczna — nie blokują ładowania. Straciliśmy też 104ms na głupim błędzie: funkcja scroll odpytywała pozycję strony zaraz po załadowaniu, gdzie zawsze jest 0.

---

## 2. 🔒 Bezpieczniejszy admin

Wcześniej to, którego klienta widzi admin, było zapisane w cookie w przeglądarce — użytkownik mógł to zmienić ręcznie i zobaczyć dane innego klienta. Teraz tenant jest zapisany w bazie danych po stronie serwera. Przeglądarka nie ma wglądu do tego ustawienia. Dodatkowo: gdy admin zaloguje się świeży i nie ma wybranego klienta, dostaje stronę wyboru zamiast błędu.

---

## 3. 🤖 YOLO Mode (auto-content pipeline)

Panel admina do masowego tworzenia treści dostał pełny redesign — stats, sidebar z ustawieniami i zakładki. Nowa zakładka "Ready to Publish" pokazuje wygenerowane drafty i pozwala opublikować wiele artykułów jednym kliknięciem. Do każdego pain pointa można dopisać notatkę — trafi ona potem do AI generującego artykuł.

---

## 4. ☁️ Migracja na Cloudflare — gotowe

Cały backend przepisany z Node.js na Cloudflare Workers.

**Dlaczego warto:**
- Cloudflare ma serwery w 300 miastach — odpowiedź z najbliższego, nie z jednego serwera Railway w USA
- Płacimy tylko za rzeczywisty ruch, nie za włączony serwer 24/7
- Joby (scrapowanie, generowanie) działają w Workflows — mają automatyczny retry, nie giną przy crashu
- Wszystkie trzy strony obsługuje jeden Worker zamiast trzech osobnych serwerów

**Hono zamiast Express:**
Hono to mały router (15 KB) oparty na standardowym Web API (`Request/`Response`). Działa identycznie lokalnie i na Cloudflare bez żadnych dodatkowych shimów. Testy route-handlera to zwykłe wywołanie funkcji — bez mockowania Node HTTP.

---

## Architektura: PRZED vs PO

### ❌ PRZED (Railway + Node.js)

```
┌─────────────────────┐
│      Przeglądarka   │
└──────────┬──────────┘
           │ HTTP
┌──────────▼──────────────────────────────┐
│    3 × Astro (Node.js na Railway)        │
│  client-frinter                          │
│  client-focusequalsfreedom               │
│  client-przemyslawfilipiak               │
└──────────┬──────────────────────────────┘
           │ HTTP + siteSlug w cookie (!)
┌──────────▼──────────────────────────────┐
│    apps/api (Node.js na Railway)         │
│    server.ts + src/routes/*.ts           │
│                                          │
│    workers/ (osobne procesy Node)        │
│    ├── runner (always-on, płatny idle)   │
│    └── brak retry = crash = job stracony │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────┐
│    PostgreSQL        │
│    (Railway)         │
└─────────────────────┘
```

---

### ✅ PO (Cloudflare Native)

```
┌─────────────────────┐
│      Przeglądarka   │
└──────────┬──────────┘
           │ HTTPS → najbliższy CF edge (300 miast)
           │
┌──────────▼──────────────────────────────────────────┐
│              CLOUDFLARE EDGE                         │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  3 × Astro  (@astrojs/cloudflare adapter)     │  │
│  │  client-frinter  |  client-fef  |  client-przem│  │
│  └─────────────────────┬─────────────────────────┘  │
│                        │ fetch()                      │
│  ┌─────────────────────▼─────────────────────────┐  │
│  │  Cloudflare Worker — Hono app (apps/api)       │  │
│  │                                                │  │
│  │  /v1/auth      login, session, set-tenant      │  │
│  │  /v1/jobs      enqueue 11 typów jobów          │  │
│  │  /v1/admin     dashboard, yolo, drafts         │  │
│  │  /v1/articles  /v1/geo  /v1/reddit  + więcej   │  │
│  │                                                │  │
│  │  tenant z hostname → env var (nie z cookie)    │  │
│  │  auth: crypto.subtle PBKDF2 (Web-native)       │  │
│  └────────┬──────────────┬──────────┬────────────┘  │
│           │              │          │                 │
│  ┌────────▼───┐  ┌───────▼──────┐  │                 │
│  │ Hyperdrive │  │  CF Queues   │  │                 │
│  │ (PG proxy) │  │  job ingress │  │                 │
│  └────────┬───┘  └───────┬──────┘  │                 │
│           │              │          │                 │
│  ┌────────▼───┐  ┌───────▼──────────────────────┐   │
│  │ PostgreSQL │  │  CF Workflows  (durable jobs) │   │
│  │ (1 shared) │  │                               │   │
│  └────────────┘  │  geo-run      GEO lokalizacje │   │
│                  │  bc-pipeline  Brand Clarity    │   │
│                  │  reddit-run   Reddit scraping  │   │
│                  │  yt-run       YouTube scraping │   │
│                  │  sh-flow      Social Hub       │   │
│                  │                               │   │
│                  │  każdy: retry per step,        │   │
│                  │  crash-safe, queue-triggered   │   │
│                  └───────────────────────────────┘   │
│                                          │            │
│                              ┌───────────▼──────────┐ │
│                              │  R2 Buckets          │ │
│                              │  obrazy, wideo,      │ │
│                              │  screenshoty, export │ │
│                              └──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Co się nie zmieniło
- **PostgreSQL** — jeden DB, dane izolowane przez `site_id`
- **Drizzle ORM** — ten sam schema i query patterns
- **3 osobne UI** — każdy klient ma swój wygląd, wspólny backend
