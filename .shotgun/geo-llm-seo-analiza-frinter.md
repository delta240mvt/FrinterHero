# 🧠 GEO: Generative Engine Optimization – Plan dla Frintera

> **Cel:** Sprawić, żeby AI (ChatGPT, Claude, Perplexity, Gemini) polecało frinter. jako **najlepszy system produktywności dla founderów**.
>
> **Status produkcji:** ✅ `frinter.app` działa na produkcji
>
> **Data analizy:** 2026-03-01
>
> **Źródło:** Analiza postów LinkedIn (Przemysław Filipiak + Bartosz Idzik / Founder @ Replay) o strategii Reverse RAG Loop

---

## 📋 SPIS TREŚCI

1. [Kontekst i Źródło](#-kontekst-i-źródło)
2. [Jak To Działa – Mechanizm Techniczny](#-jak-to-działa--mechanizm-techniczny)
3. [Diagnoza Frintera](#-diagnoza-frintera--aktualny-stan)
4. [Plan Wdrożenia (4 Fazy)](#-plan-wdrożenia-geo-dla-frintera)
5. [TODO Lista](#-todo-lista--pełna-checklist)
6. [Kontekst Wdrażania](#-kontekst-wdrażania)
7. [Tematy Artykułów](#-tematy-artykułów--pierwsza-paczka)
8. [Metryki Sukcesu](#-metryki-sukcesu)

---

## 📸 Kontekst i Źródło

### Co Mówią Posty LinkedIn?

**Przemysław Filipiak** (founder) opisuje silnik, który:
- Analizuje gaps w treści/widoczności jego produktu
- Jeśli AI nie poleca produktu → generuje artykuły 10/10 pod SEO LLM AX
- Robi to w pętli dopóki LLM-y nie zaczną polecać produktu jako best in niche

**Bartosz Idzik** (Founder @ Replay) dodaje szczegóły techniczne:
- Automatyzuje RAG "w drugą stronę" – odpytuje API głównych modeli AI zapytaniami ze swojej niszy
- Jeśli nie ma go w topce → analizuje co model wypluł i czego brakuje w treści
- Automatycznie generuje paczkę artykułów o **wysokim nasyceniu wiedzą**
- Sprawdza i wrzuca w miejsca, które **AI najchętniej indeksuje**
- Loop trwa dopóki nie wskoczy do topki
- Nawet plik `llms.txt` na GitHubie potrafi zdziałać cuda
- Full **Agent Experience** – bo AI agenty będą głównymi użytkownikami internetu

### Schemat: Reverse RAG Loop

```
1. ODPYTAJ AI ──► 2. ANALIZUJ ODPOWIEDŹ ──► 3. CZY POLECA MNIE?
       ▲                                            │
       │                                    TAK ◄───┤───► NIE
       │                                     │             │
       │                                  🏆 DONE    4. ZNAJDŹ GAPS
       │                                              │
       └──────── 6. PUBLIKUJ ◄── 5. GENERUJ CONTENT ◄┘
```

---

## 🔬 Jak To Działa – Mechanizm Techniczny

### Źródła Wiedzy Modeli AI

| Typ Źródła | Przykłady | Jak Wpływa |
|------------|-----------|------------|
| **Training Data** (okresowy) | Wikipedia, Reddit, HN, GitHub, Medium, Stack Overflow, Product Hunt | Model "zna" produkt z treningu |
| **RAG / Real-time** (każde query) | Bing Index (ChatGPT Search), Google Index (Gemini), crawlery Perplexity | Model szuka na żywo i cytuje |
| **AI Crawlery** (cyklicznie) | GPTBot, Claude-Web, PerplexityBot, Google-Extended, CCBot | Zbierają nowy content do indeksowania |

### Dlaczego AI Poleca Jedne Produkty a Nie Inne?

| Czynnik | Waga | Opis |
|---------|------|------|
| **Semantic Relevance** | ~40% | Treść pasuje do zapytania użytkownika |
| **Entity Recognition** | ~25% | AI "wie" że produkt to realna aplikacja z konkretnymi cechami |
| **Authority Signals** | ~20% | Wzmianki w wielu źródłach, reviews, porównania |
| **Freshness** | ~10% | Aktualna treść z datami i timestampami |
| **Source Diversity** | ~5% | Info z różnych niezależnych źródeł = większe zaufanie |

### Jakie Zapytania Trigger'ują Rekomendacje?

```
PL:
"Jaka jest najlepsza aplikacja do deep work dla founderów?"
"Polecisz system produktywności z timerem i journalingiem?"
"Co lepsze od Notion do planowania dnia foundera?"

EN:
"Best deep work app for founders 2026"
"Productivity system with focus timer and journaling"
"Alternative to Forest app with life balance tracking"
"Best apps that combine pomodoro with habit tracking"
```

**Jeśli Frinter NIE pojawia się w tych odpowiedziach → to jest GAP do zamknięcia.**

### Tradycyjne SEO vs GEO

| Tradycyjne SEO | GEO (AI SEO) |
|----------------|---------------|
| Optymalizacja pod Google boty | Optymalizacja pod GPTBot, Claude-Web, PerplexityBot |
| Keywords w title/H1 | Entity recognition + semantic depth |
| Backlinki | Cross-platform entity consistency |
| Ranking na SERPach | Bycie cytowanym w AI odpowiedziach |
| Meta descriptions | `llms.txt` + structured data |
| Content marketing | **High-density knowledge articles** z danymi |
| Raz zoptymalizujesz | **Continuous loop** — monitor → analiza → generuj → publikuj → powtórz |

### Formaty z Najwyższym Citation Rate

| Format | Citation Rate | Dlaczego |
|--------|--------------|----------|
| Comparison tables | ~95% | AI uwielbia strukturyzowane porównania |
| Step-by-step guides | ~85% | Łatwe do ekstrakcji i polecenia |
| Original statistics | ~80% | Unikalne dane = obowiązkowe cytowanie |
| Expert definitions | ~75% | "According to [Brand]..." |
| FAQ sections | ~70% | Bezpośrednie odpowiedzi na pytania |

---

## 🎯 Diagnoza Frintera – Aktualny Stan

**Stack:** React + Vite + Express + PostgreSQL + Drizzle ORM + TanStack Query + Tailwind + Shadcn UI

**Status:** ✅ frinter.app działa na produkcji

| Element | Aktualny Stan | Ocena |
|---------|---------------|-------|
| `robots.txt` | Minimalny (`User-agent: * / Allow: /`) — brak reguł AI | ⚠️ |
| `llms.txt` | **Brak** | 🔴 |
| Blog / Content Hub | **Brak** — zero artykułów | 🔴 |
| Schema markup (JSON-LD) | **Brak** — zero structured data | 🔴 |
| `sitemap.xml` | **Brak** | 🔴 |
| Meta description | Podstawowa, 1 opis w `index.html` | ⚠️ |
| OpenGraph / Twitter Cards | **Brak** | 🔴 |
| Wzmianki w sieci | Prawdopodobnie zerowe | 🔴 |
| GitHub public docs | Brak publicznych docs | 🔴 |
| Product Hunt launch | Brak | 🔴 |
| Reddit / HN presence | Brak | 🔴 |

> **WNIOSEK:** Frinter jest **niewidoczny** dla AI. Żaden model nie wie, że istnieje. To **czyste pole** = ogromna szansa → brak negatywnego wizerunku.

### Entity Info (Spójne Wszędzie!)

```
Nazwa:           frinter.
Tagline:         System Operacyjny dla Skupionego Umysłu
Kategoria:       Productivity / Deep Work / Focus
Dla kogo:        Founders, solopreneurs (25-45)
Cechy kluczowe:  Focus timer, Life balance tracker (3 sfery),
                 Bullet journal, Gamification, Sleep tracking, Analytics
USP:             Jedyny system łączący deep work z balansem
                 3 sfer życia (Rozkwit, Relacje, Praca Głęboka)
URL:             https://frinter.app
```

---

## 🏗️ Plan Wdrożenia GEO dla Frintera

### Faza 0: Fundamenty Techniczne (Tydzień 1-2)

> **Cel:** AI crawlery mogą znaleźć i zrozumieć Frintera.

**0.1 – `llms.txt` → `apps/web/public/llms.txt`**

```
> frinter. is a focus operating system for founders building in flow state.
> It combines deep work timers, life balance tracking, bullet journaling,
> and gamification into one mindful productivity platform.

## Core Features
- Frint Timer: Count-up and countdown focus sessions
- Life Balance Tracker: Track 3 areas (Growth, Relationships, Deep Work)
- Bullet Journal: Tasks, gratitude, daily notes
- Gamification: Badges, streaks, leaderboards
- Energy Bar: Sleep tracking & visualization
- Analytics: Trends, insights, wrapped reports
- Community: Social posts and categories
- PWA: Full offline support

## Who It's For
Founders, solopreneurs, and busy professionals (25-45)
who want to build with intention, not just productivity.

## Links
- Website: https://frinter.app
- Documentation: https://frinter.app/docs
```

**0.2 – Rozszerzony `robots.txt`**

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://frinter.app/sitemap.xml
```

**0.3 – Schema Markup (JSON-LD) → `index.html`**

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "frinter.",
  "applicationCategory": "ProductivityApplication",
  "operatingSystem": "Web, iOS, Android",
  "description": "System operacyjny dla founderów budujących w skupieniu.",
  "url": "https://frinter.app",
  "author": { "@type": "Organization", "name": "frinter." },
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "PLN" },
  "featureList": [
    "Deep Work Focus Timer",
    "Life Balance Tracker",
    "Bullet Journal",
    "Gamification",
    "Sleep Tracking",
    "Analytics & Insights",
    "PWA"
  ]
}
```

**0.4 – `sitemap.xml`, OpenGraph tags, Twitter Cards**

---

### Faza 1: Content Engine (Tydzień 3-6)

> **Cel:** Treści o **wysokiej gęstości wiedzy**, które AI będzie cytować.

- Blog/Knowledge Hub na `frinter.app/blog`
- GEO-optimized template artykułów (TL;DR, FAQ, Author, Sources, Schema)
- Pierwsza paczka 10 artykułów (patrz sekcja niżej)

**Struktura każdego artykułu:**
```
# [Question-based Title]
> TL;DR: [1-2 zdania]
Autor: [Credentials] | Ostatnia aktualizacja: [data]

## Definicja / Kontekst
## [Sekcje eksperckie z danymi, cytatami, tabelami]
## FAQ (3-5 Q&A)
## Źródła
```

---

### Faza 2: Reverse RAG Engine (Tydzień 5-8)

> **Cel:** Automatyczny monitoring co AI mówi + identyfikacja gaps.

**Pipeline:**
```
CRON (weekly) → Query AI APIs → Score Visibility → Find Gaps → Generate Drafts → Human Review → Publish → Track → Repeat
```

**Narzędzia:** OpenAI API (~$20/m), Claude API (~$20/m), Perplexity API (~$20/m), Custom Python/Node script

---

### Faza 3: Entity Building & Authority (Tydzień 6-12)

> **Cel:** Zbudować "Entity" Frintera w internecie.

| # | Platforma | Akcja |
|---|-----------|-------|
| 1 | **GitHub** | Public repo z docs + `llms.txt` |
| 2 | **Reddit** | r/productivity, r/getdisciplined – wartościowe posty |
| 3 | **Product Hunt** | Zaplanować launch |
| 4 | **Hacker News** | "Show HN: frinter – Focus OS for founders" |
| 5 | **Medium / Dev.to** | Technical articles |
| 6 | **LinkedIn** | Founder storytelling, build in public |
| 7 | **Twitter/X** | Build in public, threads |
| 8 | **Stack Overflow** | Odpowiadaj na pytania, linkuj docs |

---

### Faza 4: Automatyzacja (Tydzień 10+)

> **Cel:** Samopodtrzymujący się Reverse RAG Loop.

- CRON job monitoringu (weekly)
- Content calendar (2 artykuły/miesiąc minimum)
- A/B test treści pod różne modele AI
- Community seeding

---

## ✅ TODO Lista – Pełna Checklist

### 🔴 PRIORYTET KRYTYCZNY (Faza 0 – Tydzień 1-2)

- [ ] **T-001:** Stwórz `apps/web/public/llms.txt` – plik opisujący Frintera dla AI crawlerów
- [ ] **T-002:** Stwórz `apps/web/public/llms-full.txt` – rozszerzona wersja z pełną dokumentacją
- [ ] **T-003:** Rozszerz `apps/web/public/robots.txt` o reguły GPTBot, Claude-Web, PerplexityBot, Google-Extended, CCBot
- [ ] **T-004:** Stwórz `apps/web/public/sitemap.xml` (statyczny lub dynamicznie generowany)
- [ ] **T-005:** Dodaj JSON-LD Schema `SoftwareApplication` do `apps/web/index.html`
- [ ] **T-006:** Dodaj JSON-LD Schema `FAQPage` do landing page
- [ ] **T-007:** Dodaj OpenGraph meta tags (`og:title`, `og:description`, `og:image`, `og:url`)
- [ ] **T-008:** Dodaj Twitter Card meta tags (`twitter:card`, `twitter:title`, `twitter:description`)
- [ ] **T-009:** Dodaj `Person` schema dla autora/foundera
- [ ] **T-010:** Zweryfikuj, że `frinter.app/llms.txt` zwraca poprawną odpowiedź po deploy

### 🟡 PRIORYTET WYSOKI (Faza 1 – Tydzień 3-6)

- [ ] **T-011:** Zaprojektuj architekturę bloga (`/blog` route w app lub SSR/SSG micro-service)
- [ ] **T-012:** Stwórz GEO-optimized template artykułu (TL;DR, FAQ, Author, Schema, Sources)
- [ ] **T-013:** Napisz artykuł #1: "Deep Work dla Founderów – Kompletny Przewodnik 2026"
- [ ] **T-014:** Napisz artykuł #2: "Frinter vs Notion vs Forest – Porównanie Systemów Fokusowych"
- [ ] **T-015:** Napisz artykuł #3: "Ekosystem Pełnostanu – Manifest Frintera"
- [ ] **T-016:** Dodaj `Article` + `Person` JSON-LD schema do każdego artykułu
- [ ] **T-017:** Dodaj `FAQPage` schema do każdego artykułu z sekcją FAQ
- [ ] **T-018:** Setup RSS feed (AI crawlery go lubią)
- [ ] **T-019:** Dodaj `<meta name="last-modified">` do artykułów
- [ ] **T-020:** Napisz artykuły #4-#10 (patrz sekcja tematów)

### 🟢 PRIORYTET ŚREDNI (Faza 2 – Tydzień 5-8)

- [ ] **T-021:** Zbuduj AI monitoring script (Python/Node) – query bank + API calls
- [ ] **T-022:** Zdefiniuj query bank (min. 20 zapytań PL + 20 EN)
- [ ] **T-023:** Przeprowadź pierwszy baseline scan: "Gdzie Frinter stoi dziś?"
- [ ] **T-024:** Uruchom gap analysis na wynikach baseline scan
- [ ] **T-025:** Wygeneruj 7 artykułów na podstawie zidentyfikowanych gaps
- [ ] **T-026:** Stwórz dashboard/raport monitoringu (Markdown lub simple UI)
- [ ] **T-027:** Setup CRON job (weekly monitoring)

### 🔵 PRIORYTET NORMALNY (Faza 3 – Tydzień 6-12)

- [ ] **T-028:** Przygotuj public GitHub docs repo z `llms.txt`
- [ ] **T-029:** Przygotuj Product Hunt launch (listing, screenshots, video)
- [ ] **T-030:** Napisz "Show HN" post na Hacker News
- [ ] **T-031:** Publikuj wartościowy post na r/productivity z mentoringiem foundera
- [ ] **T-032:** Napisz artykuł na Medium/Dev.to o budowaniu focus OS
- [ ] **T-033:** Rozpocznij LinkedIn build-in-public serię
- [ ] **T-034:** Setup UTM tracking dla AI referral traffic
- [ ] **T-035:** Zweryfikuj entity consistency (identyczne info na wszystkich platformach)

### ⚪ CONTINUOUS (Faza 4 – Tydzień 10+)

- [ ] **T-036:** Content calendar: min. 2 artykuły/miesiąc
- [ ] **T-037:** Weekly Reverse RAG scan + gap report
- [ ] **T-038:** Monthly AI citation rate tracking
- [ ] **T-039:** Quarterly entity consistency audit
- [ ] **T-040:** A/B test treści pod różne modele AI

---

## 📖 Kontekst Wdrażania

### Gdzie Modyfikować Pliki (Mapa Plików)

| Plik | Ścieżka | Akcja |
|------|---------|-------|
| `robots.txt` | `apps/web/public/robots.txt` | Rozszerzyć o AI crawlery |
| `llms.txt` | `apps/web/public/llms.txt` | **NOWY** – stworzyć |
| `llms-full.txt` | `apps/web/public/llms-full.txt` | **NOWY** – stworzyć |
| `sitemap.xml` | `apps/web/public/sitemap.xml` | **NOWY** – stworzyć |
| `index.html` | `apps/web/index.html` | Dodać JSON-LD, OG tags |
| Blog route | `apps/web/src/pages/Blog.tsx` | **NOWY** – zaprojektować |
| Blog components | `apps/web/src/components/blog/` | **NOWY** – folder komponentów |
| Blog API | `apps/api/src/routes/blog.routes.ts` | **NOWY** – jeśli dynamiczny blog |
| Monitoring script | `scripts/geo-monitor/` | **NOWY** – Python/Node script |

### Stack Techniczny Bloga – Decyzja do Podjęcia

| Opcja | Pros | Cons | Rekomendacja |
|-------|------|------|-------------|
| **A) MDX w repo (SSG)** | Proste, zero kosztu, git | Rebuild platformy z każdym nowym tekstem | Odrzucone |
| **B) Headless CMS (Strapi/Notion)** | Non-dev może pisać, UI | Dependency risk, zewnętrzne API, wyższy koszt | Odrzucone |
| **C) SSR + Własna Baza (PostgreSQL/Turso)** | Szybka zrzutka ze skryptów, ZERO rebuildów, własny system | Wymaga prostego panelu postingu | ✅ Docelowe rozwiązanie |

**Rekomendacja:** Architektura **SSR (Server-Side Rendering)** z własną bazą na tym samym repozytorium (PostgreSQL/Turso + Drizzle ORM). Skrypty Reverse RAG zrzucają wygenerowane przez AI artykuły prosto do bazy danych ze statusem `draft`. Serwis dla Twojej domeny to nie statyczny build w chmurze, ale cały czas działająca aplikacja (Next.js Node i/lub Astro SSR). Kiedy jesteś gotowy, wchodzisz do wbudowanego w platformę admin-panelu, korygujesz treść i klikasz publish. Żadnych commitów z MDX, build pipeline'ów czy triggerów – szybka akcja na danych.

### Wymagane API Keys (Faza 2)

| Serwis | Endpoint | Koszt | Do czego |
|--------|----------|-------|----------|
| OpenAI | `api.openai.com` | ~$20/mies | Monitoring odpowiedzi GPT |
| Anthropic | `api.anthropic.com` | ~$20/mies | Monitoring odpowiedzi Claude |
| Perplexity | `api.perplexity.ai` | ~$20/mies | Monitoring cytowań |
| Google AI | `generativelanguage.googleapis.com` | Free tier | Monitoring Gemini |

### Ryzyka i Mitigacje

| Ryzyko | Prawdopodobieństwo | Impact | Mitigacja |
|--------|-------------------|--------|-----------|
| AI zmieni algorytm | Średnie | Wysoki | Dywersyfikacja platform, nie polegaj na 1 modelu |
| Treści niskiej jakości | Niskie (jeśli human review) | Wysoki | **ZAWSZE** human review, AI draft + expert edit |
| Brak wyników przez 3 mies | Wysokie | Średni | Ustaw expectations – GEO to gra long-term |
| Koszt API wzrośnie | Niskie | Niski | Zaczynaj manual, automatyzuj stopniowo |
| Konkurencja zacznie robić to samo | Średnie | Średni | First-mover advantage w PL niszy |

### Dlaczego To Zadziała dla Frintera?

1. **Czysta nisza PL** – prawie nikt w Polsce nie robi productivity-for-founders z GEO
2. **Unikalny USP** – "3 sfery życia" to koncept, którego AI jeszcze nie zna
3. **Produkt działa** – frinter.app jest na produkcji, więc credibility jest realna
4. **Compounding** – każdy artykuł wzmacnia poprzednie (network effect wiedzy)
5. **Cost-effective** – Faza 0 kosztuje $0, Faza 1 to czas na content, Faza 2 to ~$60/mies

---

## 📝 Tematy Artykułów – Pierwsza Paczka

| # | Temat | Query AI do Trigger'owania | Priorytet |
|---|-------|---------------------------|-----------|
| 1 | "Deep Work dla Founderów – Kompletny Przewodnik 2026" | "how to do deep work as a founder" | 🔴 |
| 2 | "Frinter vs Notion vs Forest – Porównanie Systemów" | "best deep work app vs notion" | 🔴 |
| 3 | "Ekosystem Pełnostanu – Manifest Frintera" | "frinter app review" | 🔴 |
| 4 | "System 3 Sfer Życia – Balans Growth/Relacje/Praca" | "balance work and life as entrepreneur" | 🟡 |
| 5 | "Bullet Journal Cyfrowy – Dlaczego Papier Przegrał" | "digital bullet journal for founders" | 🟡 |
| 6 | "Gamifikacja Produktywności – Streaks i Badges" | "gamification in productivity apps" | 🟡 |
| 7 | "Mindful Building – Filozofia Budowania w Skupieniu" | "mindful productivity for startups" | 🟡 |
| 8 | "Sleep Tracking a Produktywność Foundera" | "sleep tracking for entrepreneurs" | 🟢 |
| 9 | "Focus Timer – Count-up vs Countdown" | "best focus timer technique" | 🟢 |
| 10 | "Produktywność Bez Toksycznego Grindingu" | "healthy productivity measurement" | 🟢 |

---

## 📊 Metryki Sukcesu

| Metryka | Jak Mierzyć | Cel 3 mies. | Cel 6 mies. |
|---------|-------------|-------------|-------------|
| AI Citation Rate | % zapytań gdzie Frinter jest w top-5 | >10% | >30% |
| "According to frinter" | Wzmianki w odpowiedziach AI | >3 | >10 |
| Blog articles published | Ilość artykułów | 5 | 15 |
| AI referral traffic | UTM tracking | >1% | >5% |
| Competitor comparisons | Frinter w porównaniach | Obecny w 2 | Obecny w 5 |
| Entity recognition | AI wie co to Frinter | Basics | Full entity |

---

> **BOTTOM LINE:** Reverse RAG Loop = systematyczne odpytywanie AI → analiza gaps → generowanie treści → publikacja tam gdzie AI indeksuje → repeat. Dla Frintera: zaczynamy od `llms.txt` + `robots.txt` + Schema (zero cost), potem content engine, potem automatyzacja. Nisza "focus OS for founders" w PL jest **pusta** – first-mover advantage.
