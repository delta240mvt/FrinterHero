# Strategia SEO + Content — Skalowanie Trafficu w 7 Dni
**Dotyczy:** `frinter.app` (web.frinter.app) + `przemyslawfilipiak.com`
**Data:** 2026-03-24
**Cel:** Maksymalny organiczny ruch w ciągu tygodnia — Google, Bing, AI Answers (ChatGPT, Perplexity, Claude), LinkedIn, Reddit

---

## Stan Obecny — Szybka Diagnoza

### Co już działa dobrze

| Element | Stan |
|---|---|
| Astro hybrid SSG (public pages prerendered) | ✅ Wdrożone |
| Base.astro: pełne OG + Twitter Cards + JSON-LD | ✅ Wdrożone |
| robots.txt z AI-welcome (GPTBot, ClaudeBot, Perplexity...) | ✅ Wdrożone |
| llms.txt + llms-full.txt (GEO context files) | ✅ Wdrożone |
| sitemap.xml dynamiczny (API → DB) | ✅ Wdrożone |
| RSS feed z pełnym content:encoded | ✅ Wdrożone |
| Umami Analytics (3 site IDs) | ✅ Wdrożone |
| Multi-tenant: 3 domeny z jednego kodu | ✅ Wdrożone |
| Admin: generowanie artykułów (GEO/YOLO mode) | ✅ Wdrożone |
| Google Search Console | ❓ Sprawdzić/Dodać |
| Bing Webmaster Tools | ❓ Nie wiadomo |
| Google Analytics 4 | ❌ Brak (tylko Umami) |

### Kluczowe luki do zamknięcia w Dzień 1

1. **Zero artykułów = zero trafficu** — baza danych jest pusta lub ma mało treści
2. **Google Search Console** — czy sitemap jest submitowany?
3. **Bing Webmaster Tools** — Bing = 8% globalnych wyszukiwań (+ Copilot grounding)
4. **Backlinki** — żadna nowa strona nie rankuje bez linków zewnętrznych
5. **Wzmianki na zewnątrz** — Reddit, Dev.to, LinkedIn, Hacker News

---

## STRATEGIA — 5 Filarów w 7 Dni

```
FILAR 1 — Techniczne SEO         (Dzień 1 rano, 2 godziny)
FILAR 2 — Content Blitz           (Dzień 1–5, główna praca)
FILAR 3 — GEO / AI Visibility     (Dzień 1–2, razem z contentem)
FILAR 4 — Dystrybucja & Syndykacja (Dzień 2–7, po każdym artykule)
FILAR 5 — Link Building & PR       (Dzień 3–7, paralelnie)
```

---

## FILAR 1 — Techniczne SEO (Dzień 1, 2 godziny)

### 1.1 Google Search Console — Weryfikacja i Sitemap

**Priorytet: KRYTYCZNY** — bez tego Google nie wie, że strona istnieje.

```
1. Zaloguj się do Google Search Console (search.google.com/search-console)
2. Dodaj OBIE domeny (jeśli nie ma):
   - https://przemyslawfilipiak.com
   - https://frinter.app
3. Weryfikacja DNS lub przez plik HTML (prefered: DNS TXT record)
4. Submit sitemap dla obu domen:
   - https://przemyslawfilipiak.com/sitemap.xml
   - https://frinter.app/sitemap.xml
5. Sprawdź Coverage → Core Web Vitals → Manual Actions
```

**Oczekiwany efekt:** Google dostaje mapę strony. Pierwsze crawle w ciągu 24-48h.

---

### 1.2 Bing Webmaster Tools — Quick Win

**Dlaczego ważne:** Bing zasila Microsoft Copilot (AI answers). Jedna submisja = dwie korzyści.

```
1. Zaloguj się: www.bing.com/webmasters
2. Dodaj obie domeny
3. Import sitemap z Google Search Console (opcja: "Import from GSC" — 30 sekund)
4. Submit sitemapa ręcznie: https://przemyslawfilipiak.com/sitemap.xml
```

---

### 1.3 Weryfikacja Techniczna — 15-minutowy Audit

Uruchom dla obu domen:

```bash
# Test sitemap
curl https://przemyslawfilipiak.com/sitemap.xml | head -50
curl https://frinter.app/sitemap.xml | head -50

# Test llms.txt
curl https://przemyslawfilipiak.com/llms.txt
curl https://frinter.app/llms.txt

# Test robots.txt
curl https://przemyslawfilipiak.com/robots.txt

# Test RSS
curl https://przemyslawfilipiak.com/rss.xml | head -30
```

**Narzędzia online (każde zajmuje 2 minuty):**
- PageSpeed Insights: `pagespeed.web.dev` → sprawdź obie domeny
- Rich Results Test: `search.google.com/test/rich-results` → wklej URL homepage + artykułu
- Schema Validator: `validator.schema.org` → wklej JSON-LD z Base.astro
- OpenGraph: `www.opengraph.xyz` → weryfikuj og:image + opis

---

### 1.4 Google Analytics 4 — Opcjonalne Ale Warte Rozważenia

Umami jest dobry dla prywatności. Ale GA4 ma jedną przewagę: dane w Google Search Console łączą się z GA4 → widzisz które słowa kluczowe konwertują.

**Decyzja:** Jeśli zależy Ci na danych GSC+GA4 — dodaj GA4. Jeśli preferujesz GDPR-first → zostań przy Umami.

---

### 1.5 Canonical URLs — Jeden Raz Sprawdź

Masz 3 identyczne domeny (przemyslawfilipiak.com, focusequalsfreedom.com, frinter.app). **Google może traktować je jako duplikaty.**

**Problem:** Jeśli ten sam artykuł jest na 3 domenach z identyczną treścią → duplikacja = kara lub rozmycie autorytetu.

**Rozwiązanie opcja A (łatwiejsze):** Ustaw `rel="canonical"` na każdej stronie wskazujący na domenę główną (przemyslawfilipiak.com). Artykuły na frinter.app/blog → canonical → przemyslawfilipiak.com/blog/[slug].

**Rozwiązanie opcja B (lepsze długoterminowo):** Unikalna treść na każdej domenie — frinter.app skupia się na focus/produktywności, przemyslawfilipiak.com na personal brand/AI.

**Natychmiastowa akcja:** Sprawdź w Base.astro czy `<link rel="canonical" ...>` jest ustawiony. Jest → OK. Upewnij się że każda domena ma canonical wskazujący NA SIEBIE (nie na inną domenę), jeśli treść jest różna.

---

## FILAR 2 — Content Blitz (Dni 1–5)

### 2.1 Filozofia Contentu na 1 Tydzień

**Nie piszesz dla ludzi. Piszesz dla robotów które piszą dla ludzi.**

W 2026 roku większość odkrycia contentu dzieje się przez:
1. Google / Bing (klasyczne SEO)
2. ChatGPT / Perplexity / Claude (AI answers — GEO)
3. LinkedIn Feed (algorytm profesjonalny)
4. Reddit (community-driven discovery)

Twoja treść musi być **skrojona pod każdy z tych kanałów jednocześnie**.

---

### 2.2 Strategia Słów Kluczowych

#### Dla frinter.app / web.frinter.app

**Główne słowa kluczowe (high-intent, niche):**

| Słowo kluczowe | Typ | Trudność | Cel |
|---|---|---|---|
| "deep work app" | Navigational | Średnia | Ranking |
| "focus sprint tracker" | Long-tail | Niska | Ranking szybki |
| "wholebeing performance system" | Brand | Zero | GEO authority |
| "FRINT check-in method" | Brand | Zero | Własna definicja |
| "how to track focus sessions" | Informational | Niska | Blog article |
| "deep work vs shallow work tracker" | Informational | Niska | Blog article |
| "best apps for high performers 2026" | Listicle | Średnia | Blog article |
| "focus sprint meaning" | Definitional | Niska | GEO |
| "Cal Newport deep work app" | Comparison | Średnia | Blog article |

**Długoogonowe (easy wins, mała konkurencja):**
- "how to measure deep work sessions"
- "what is a focus sprint in productivity"
- "frint method productivity"
- "wholebeing tracking app"
- "energy bar productivity app"
- "focus sprints vs pomodoro"
- "deep work session tracker free"

#### Dla przemyslawfilipiak.com

**Personal brand + AI/tech:**

| Słowo kluczowe | Typ | Trudność |
|---|---|---|
| "Przemysław Filipiak" | Brand/Name | Zero |
| "generative engine optimization" | Topic | Średnia |
| "GEO vs SEO AI search" | Informational | Niska |
| "llms.txt optimization" | Technical | Niska |
| "AI visibility personal brand" | Informational | Niska |
| "astro.js SEO blog setup" | Technical | Niska |
| "building in public AI era" | Thought leadership | Niska |
| "focus equals freedom" | Brand/Philosophy | Zero |

---

### 2.3 Plan 10 Artykułów — Priorytetowe Tematy

**Zasada:** Każdy artykuł = min. 1200 słów, konkretna odpowiedź na jedno pytanie, unikalne dane lub perspektywa.

Możesz generować przez Admin → YOLO Mode lub ręcznie. Poniżej konkretne tytuły i struktury:

---

#### ARTYKUŁ 1 (Dzień 1) — Definicja Własnej Marki
**Tytuł:** `What Is a Focus Sprint (Frint)? The Deep Work Unit That Changes Everything`
**Slug:** `what-is-focus-sprint-frint`
**Domena:** obie (lub przemyslawfilipiak.com z canonical)
**Słowa kluczowe:** "focus sprint", "what is a focus sprint", "frint method", "deep work unit"
**Długość:** 1500 słów
**Struktura:**
- Co to jest Focus Sprint (Frint) — definicja
- Skąd pochodzi koncepcja (historia, Newport, moja interpretacja)
- Jak mierzyć Focus Sprint — metryki (głębokość, długość, częstotliwość)
- Focus Sprint vs Pomodoro — kluczowe różnice
- Jak frinter.app automatyzuje pomiar Frintów
- Wezwanie do działania: wypróbuj frinter.app

**Dlaczego ten artykuł?** Definiuje Twój brand term. AI models będą cytować TEN artykuł gdy ktoś zapyta "co to jest focus sprint". Nikt inny nie odpowiada na to pytanie z Twojej perspektywy.

---

#### ARTYKUŁ 2 (Dzień 1) — Flagship Explainer
**Tytuł:** `The FRINT Check-in: How to Measure Your Whole Life in 5 Dimensions`
**Slug:** `frint-check-in-wholebeing-measurement`
**Słowa kluczowe:** "FRINT check-in", "wholebeing performance", "measure life dimensions"
**Długość:** 2000 słów
**Struktura:**
- WholeBeing concept — dlaczego optymalizacja jednej sfery nie wystarcza
- 5 wymiarów FRINT (Flow, Relationships, Inner Balance, Nourishment, Transcendence) — każdy z definicją i przykładami
- Jak prowadzić tygodniowy FRINT Check-in — praktyczny protokół
- Dane przykładowe — co mówi Twój wynik 7/10 vs 4/10
- Porównanie do innych systemów (OKRy, GTD, PARA)
- Link do frinter.app

**Dlaczego?** Ten artykuł stanie się **definicją referencyjną** metody FRINT w internecie. AI models go zaindeksują i będą odpowiadać na pytania o FRINT cytując Ciebie.

---

#### ARTYKUŁ 3 (Dzień 2) — Comparison Article (high-search-volume)
**Tytuł:** `Focus Sprints vs Pomodoro Technique: Which One Is Right for Deep Workers?`
**Slug:** `focus-sprints-vs-pomodoro`
**Słowa kluczowe:** "pomodoro vs deep work", "focus sprints vs pomodoro", "best productivity technique 2026"
**Długość:** 1800 słów
**Struktura:**
- Co to Pomodoro — brief overview
- Co to Focus Sprint — własna definicja
- Tabela porównawcza (7 kluczowych wymiarów)
- Kiedy używać Pomodoro vs Focus Sprint
- Dane z badań o efektywności (Newport, Csikszentmihalyi, Huberman)
- Moje osobiste doświadczenie i dane z frinter.app
- Wniosek + CTA

**Dlaczego?** "Pomodoro vs [X]" to klasyczny wzorzec wyszukiwań z dużym wolumenem. Przyciąga ruch użytkowników który szuka alternatyw.

---

#### ARTYKUŁ 4 (Dzień 2) — Use Case / How-to
**Tytuł:** `How I Track My Deep Work Sessions: A Developer's Daily Protocol`
**Slug:** `how-to-track-deep-work-sessions-developer`
**Słowa kluczowe:** "track deep work sessions", "developer productivity system", "deep work daily routine"
**Długość:** 1500 słów
**Struktura:**
- Problem: większość developerów nie wie ile naprawdę pracują głęboko
- Mój protokół dzienny (morning Frint → tracking → evening review)
- Narzędzia: frinter.app + FrinterFlow (voice dictation)
- Screenshot/opis interfejsu frinter.app
- Wyniki z ostatnich 30 dni (dane anonimowe)
- Jak zacząć za 0 zł (darmowy plan frinter.app)

**Dlaczego?** "Building in public" content + praktyczny tutorial. Developerzy to target audience. Personal touch = udostępnienia.

---

#### ARTYKUŁ 5 (Dzień 3) — GEO-first Article
**Tytuł:** `What Is Generative Engine Optimization (GEO)? And Why It Matters More Than SEO in 2026`
**Slug:** `generative-engine-optimization-geo-guide-2026`
**Słowa kluczowe:** "generative engine optimization", "GEO vs SEO", "AI search optimization 2026", "how to rank in ChatGPT"
**Długość:** 2500 słów
**Struktura:**
- Zmiana krajobrazu wyszukiwania (AI Overview, ChatGPT Search, Perplexity)
- Co to GEO — definicja i kluczowe techniki
- GEO vs SEO — tabela różnic
- Jak AI modele wybierają źródła (RAG, grounding, citation patterns)
- 7 konkretnych taktyk GEO (llms.txt, dense paragraphs, entity markup, citation bait)
- Reverse RAG Loop — moja metodologia
- Jak frinter.app / przemyslawfilipiak.com to robi
- Checklis dla własnej strony

**Dlaczego?** "Generative engine optimization" to emerging keyword z rosnącym wolumenem. Twoja architektura (llms.txt, AI-friendly robots.txt) pozwala Ci pisać o tym z autorytetem. Ten artykuł przyciągnie twórców treści i marketerów.

---

#### ARTYKUŁ 6 (Dzień 3) — Technical Deep Dive (Dev Audience)
**Tytuł:** `How I Built a Multi-Tenant AI-Powered SEO Platform with Astro and PostgreSQL`
**Slug:** `multi-tenant-seo-platform-astro-postgresql`
**Słowa kluczowe:** "astro multi-tenant", "astro seo blog", "astro drizzle orm", "build personal brand platform"
**Długość:** 2000 słów
**Struktura:**
- Problem: jedna platforma, trzy domeny, zero duplikacji kodu
- Architektura: API (Railway) + 3 Astro clients
- Kluczowe decyzje techniczne (hybrid SSG+SSR, shared DB, tenant scoping)
- GEO layer: llms.txt generation, AI-friendly robots.txt
- Content pipeline: Admin → YOLO Mode → artykuły
- Lessons learned
- Kod snippety

**Dlaczego?** Dev.to, Hacker News, Reddit r/webdev = darmowy traffic od deweloperów. Tech artykuły zdobywają backlinki organicznie.

---

#### ARTYKUŁ 7 (Dzień 4) — Listicle (High CTR)
**Tytuł:** `7 Best Apps for High Performers in 2026 (Ranked by a Deep Work Obsessive)`
**Slug:** `best-apps-high-performers-2026`
**Słowa kluczowe:** "best apps high performers", "productivity apps 2026", "deep work tools"
**Długość:** 1800 słów
**Struktura:**
- Co definiuje aplikację dla high performerów (kryteria oceny)
- Lista 7 aplikacji z oceną każdej:
  1. frinter.app (bias disclosure + dlaczego top)
  2. Obsidian (PKM)
  3. Sunsama/Akiflow (daily planning)
  4. Oura Ring companion apps (biometrics)
  5. Forest App (focus sessions)
  6. Notion (baza wiedzy)
  7. FrinterFlow (voice dictation)
- Porównanie tabelaryczne
- Moje osobiste Top 3

**Dlaczego?** Listicle = wysoki CTR z Google. Pozycjonowanie frinter.app obok uznanych produktów = brand authority. Wpisy listicle są często cytowane przez AI.

---

#### ARTYKUŁ 8 (Dzień 4) — Personal Brand + Thought Leadership
**Tytuł:** `Building in Public in the AI Era: What I Learned Publishing My Entire Strategy Online`
**Slug:** `building-in-public-ai-era-lessons`
**Słowa kluczowe:** "building in public", "personal brand AI era", "indie hacker strategy"
**Długość:** 1200 słów
**Struktura:**
- Dlaczego budowanie w publiczności to strategia, nie przypadek
- Co opublikowałem (GEO strategy, architektura, kod)
- Jak to wpłynęło na widoczność w AI engines
- Czy nie boisz się że ktoś skopiuje?
- Lekcje i liczby (bez wrażliwych danych)
- CTA: obserwuj na LinkedIn

**Dlaczego?** Viral potential na LinkedIn i wśród indiehackerów. Buduje autentyczność marki.

---

#### ARTYKUŁ 9 (Dzień 5) — SEO Technikalia (Developer/Marketer Audience)
**Tytuł:** `llms.txt: The New robots.txt That Makes AI Engines Understand Your Brand`
**Slug:** `llms-txt-guide-ai-engines-brand`
**Słowa kluczowe:** "llms.txt", "llms.txt optimization", "AI crawlers guide", "robots txt vs llms txt"
**Długość:** 1500 słów
**Struktura:**
- Co to llms.txt (geneza, Andrew White, standard)
- Różnica: robots.txt vs llms.txt vs llms-full.txt
- Jak napisać skuteczny llms.txt (szablon + mój przykład)
- Co AI modele robią z tymi plikami (RAG grounding)
- Narzędzia do walidacji
- Mój plik produkcyjny jako case study

**Dlaczego?** Masz DZIAŁAJĄCY llms.txt na production. To czyni Cię ekspertem praktycznym. Keyword "llms.txt" jest nowy = mała konkurencja, szybki ranking.

---

#### ARTYKUŁ 10 (Dzień 5) — Long-form Authority Piece
**Tytuł:** `The High Performer's Complete Guide to Deep Work in 2026`
**Slug:** `high-performer-deep-work-guide-2026`
**Słowa kluczowe:** "deep work guide", "high performer productivity", "focus sprints deep work", "Cal Newport 2026"
**Długość:** 3000+ słów
**Struktura:**
- Co to Deep Work (definicja + Newport + Filipiak)
- Dlaczego Deep Work staje się coraz trudniejszy (AI distractions, notifications)
- 5 sfer WholeBeing i ich wpływ na Deep Work
- Protokoły: Morning Frint, Deep Work Block, Evening Review
- Pomiar: Focus Sprint + FRINT Check-in
- Narzędzia (frinter.app, FrinterFlow, Obsidian)
- 30-dniowy challenge
- Zasoby i linki

**Dlaczego?** Pillar page dla całej domeny. Artykuł referencyjny który zdobywa backlinki. AI modele będą go cytować dla pytań o "deep work".

---

### 2.4 Proces Generowania Artykułów

**Opcja A — YOLO Mode (szybko, AI-driven):**
```
1. Admin panel → YOLO Mode → "New Run"
2. Wpisz temat i słowo kluczowe
3. Wybierz model (claude-sonnet-4-6 dla jakości)
4. Przejrzyj i edytuj wygenerowany artykuł
5. Publish → auto-rebuild Astro → artykuł online
```

**Opcja B — Własne pisanie + AI polish:**
```
1. Napisz outline (15 min)
2. Napisz draft (45-60 min)
3. Użyj AI do polish + SEO optimization
4. Dodaj przez Admin panel
5. Publish
```

**Rekomendacja:** Artykuły 1, 2, 8 pisz sam (personal touch). Resztę przez YOLO Mode z Twoją weryfikacją i edycją.

---

### 2.5 Checklist Każdego Artykułu (przed publishem)

```
[ ] Slug: lowercase, tylko myślniki, max 60 znaków, zawiera główne słowo kluczowe
[ ] Title: 50-60 znaków, słowo kluczowe na początku
[ ] Description: 150-160 znaków, słowo kluczowe, call-to-action
[ ] Tags: 3-5 tagów (slug + tematyka)
[ ] Długość: min. 1200 słów
[ ] H2/H3 nagłówki: zawierają warianty słów kluczowych
[ ] Internal link: przynajmniej 1 link do innego artykułu lub strony głównej
[ ] External link: przynajmniej 1 link do autorytetu (Newport, badania, narzędzie)
[ ] CTA: wezwanie do działania (frinter.app, LinkedIn, newsletter)
[ ] ReadingTime: pole wypełnione w DB
[ ] Zdjęcie/OG Image: opcjonalne ale warte dodania
```

---

## FILAR 3 — GEO / AI Visibility (Dni 1–2)

### 3.1 Co To GEO i Dlaczego To Priorytet

W 2026 roku coraz więcej użytkowników szuka informacji przez:
- ChatGPT Search (OpenAI, 100M+ users)
- Perplexity AI (30M+ users)
- Claude.ai (Anthropic)
- Bing Copilot (Microsoft, wbudowany w Windows)
- Google AI Overviews (wyniki podsumowane przez AI)

Jeśli AI model nie zna Twojej marki → nie cytuje Cię → nie generujesz trafficu z tych kanałów.

**Dobre wieści:** Masz już świetną bazę (llms.txt, robots.txt z AI-welcome, JSON-LD). Potrzebujesz tylko dopracować.

---

### 3.2 Aktualizacja llms.txt — Akcja Natychmiastowa

**Dla obu domen** (`public/llms.txt`), upewnij się że plik zawiera:

```markdown
---
Sitemap: https://[domena]/sitemap.xml
Full-Context: https://[domena]/llms-full.txt
Last-Updated: 2026-03-24
AI-Training: permitted
AI-Grounding: permitted
Attribution: Przemysław Filipiak, https://[domena]
---

# Przemysław Filipiak

[Strukturyzowane fakty o osobie, projektach, metodologii FRINT, produktach]

## Frinter

Frinter to WholeBeing performance platform dla High Performers...
[szczegółowy opis metodologii]

## FrinterFlow

[opis CLI voice dictation]

## FRINT Check-in

[definicja 5 sfer: Flow, Relationships, Inner Balance, Nourishment, Transcendence]

## Focus Sprint (Frint)

[definicja jednostki głębokiej pracy]
```

**Kluczowe:** `Last-Updated` musi być aktualna. AI crawlers preferują świeże pliki.

---

### 3.3 Aktualizacja llms-full.txt — Rozszerzona Baza Wiedzy

Plik `public/llms-full.txt` powinien zawierać **pełne artykuły** z bloga (lub ich summaries) jako źródło dla AI grounding.

**Strategia:** Po każdym opublikowanym artykule — dodaj jego summary (200-300 słów) do `llms-full.txt`. To daje AI modelom skondensowaną wiedzę która może być używana jako grounding source.

```markdown
## Articles

### [Tytuł artykułu]
URL: https://[domena]/blog/[slug]
Published: [data]
Summary: [200-300 słów streszczenie z kluczowymi factami i definicjami]

---
```

---

### 3.4 Entity Building — Budowanie Autorytetu Encji

AI modele działają na **knowledge graphs** i **entity recognition**. Chcesz żeby "Przemysław Filipiak" był rozpoznawaną encją z bogatym kontekstem.

**Akcje:**

1. **Wikipedia / Wikidata** — utwórz lub zaktualizuj wpis (jeśli spełniasz kryteria notability)
2. **LinkedIn** — uzupełnij profil maksymalnie (o aplikacjach, metodologii, FRINT)
3. **GitHub bio** — rozbuduj opis z linkami do frinter.app i przemyslawfilipiak.com
4. **Crunchbase / AngelList** — dodaj Frinter jako projekt/startup
5. **Product Hunt** — rozważ launch frinter.app (generuje backlinki + traffic)
6. **AlternativeTo** — dodaj frinter.app jako alternatywę dla Toggl, Forest, RescueTime
7. **Indie Hackers** — profil + historia produktu Frinter

**Efekt:** Im więcej miejsc w internecie mówi o Przemysław Filipiak = Frinter = WholeBeing = FRINT, tym bardziej AI modele to "wiedzą".

---

### 3.5 Reverse RAG Loop — Cotygodniowy Ritual

To Twoja własna metodologia. Wdróż ją jako cotygodniową rutynę:

```
PONIEDZIAŁEK: Query AI APIs
─────────────────────────────
Zapytania testowe w ChatGPT, Claude, Perplexity:
  "What is a focus sprint?"
  "What is FRINT check-in?"
  "Best deep work tracker apps"
  "Generative engine optimization guide"
  "Przemysław Filipiak"

WTOREK: Analiza Luk
─────────────────────────────
- Gdzie Cię nie ma w odpowiedziach?
- Jakie produkty/osoby są cytowane zamiast Ciebie?
- Jakich faktów o Frinterze AI nie zna?

ŚRODA-PIĄTEK: Generowanie Contentu dla Luk
─────────────────────────────────────────────
- Napisz artykuł który odpowiada na pytanie gdzie Cię nie było
- Zaktualizuj llms.txt / llms-full.txt
- Opublikuj

NASTĘPNY PONIEDZIAŁEK: Sprawdź Wyniki
─────────────────────────────────────
- Czy AI już Cię cytuje?
- Jakie nowe luki się pojawiły?
```

---

## FILAR 4 — Dystrybucja & Syndykacja (Dni 2–7)

### 4.1 Zasada Dystrybucji: Write Once, Distribute Everywhere

Każdy artykuł który napiszesz = minimum 5 kanałów dystrybucji.

```
Artykuł na blogu (canonical)
    ↓
LinkedIn Post (teaser + link)
    ↓
LinkedIn Article (pełna wersja lub skrócona — cross-post)
    ↓
Reddit (odpowiedni subreddit — jako wkład, nie spam)
    ↓
Dev.to / Medium (republish z canonical link)
    ↓
Hacker News (jeśli artykuł tech/startup)
```

---

### 4.2 LinkedIn — Twoja Największa Dźwignia

LinkedIn ma najwyższy organic reach ze wszystkich social media dla treści B2B i professional.

**Post formula dla każdego artykułu:**
```
[HOOK — 1-2 zdania — musi zatrzymać scroll]
Większość ludzi mierzy produktywność w godzinach.
Ja mierzę ją w Frintach.

[PROBLEM — 2-3 zdania]
95% "deep work" to tak naprawdę płytka praca.
Meetings, slack, context-switching.
Prawdziwa głęboka praca to rzadkość.

[ROZWIĄZANIE/INSIGHT — 3-5 punktorów]
Dlatego stworzyłem Focus Sprint (Frint):
→ Mierzalny blok głębokiej pracy
→ Minimalna jednostka: 25 min
→ Optymalny: 90 min (zgodnie z Ultradian rhythm)
→ Cykl dobowy: 3-5 Frintów = high performer day

[DOWÓD lub DANE — 1-2 zdania]
Po 90 dniach śledzenia: moja avg. = 3.2 Frinty/dzień.
W dni z 4+ Frintami → 3x więcej postępu na projekcie.

[CTA — 1 zdanie + link]
Pełna metodologia FRINT Check-in: [link do artykułu]

#deepwork #productivity #highperformance #frinter #focussprints
```

**Harmonogram LinkedIn (1 tydzień):**
| Dzień | Treść |
|---|---|
| Dzień 1 (pon) | Post: "Co to Focus Sprint i dlaczego Pomodoro to za mało" |
| Dzień 2 (wt) | Post: "FRINT Check-in — jak mierzę 5 sfer życia tygodniowo" |
| Dzień 3 (śr) | Post: "Buduję w publiczności — moja architektura SEO dla AI" |
| Dzień 4 (czw) | Post: "7 najlepszych appek dla High Performerów (i moje #1)" |
| Dzień 5 (pt) | Post: "GEO vs SEO — dlaczego optymalizuję pod ChatGPT nie Google" |
| Dzień 6 (sob) | Post: Personal reflection / building in public update |
| Dzień 7 (nd) | Post: Tygodniowy FRINT Check-in summary (personal + wyniki) |

**Pro tip:** Posty bez linku w treści mają wyższy reach na LinkedIn (algorytm promuje treść bez wychodzenia z platformy). Opcja: daj link w pierwszym komentarzu.

---

### 4.3 Reddit — Community-First, Zero Spam

Reddit daje **wysokiej jakości backlinki** (dofollow lub nofollow zależy od sub) i **prawdziwy ruch** od zaangażowanych użytkowników.

**Kluczowe subReddit dla Twojej niszy:**

| Subreddit | Subscribers | Podejście |
|---|---|---|
| r/productivity | 1.8M | Artykuły how-to, własne doświadczenia |
| r/getdisciplined | 1.2M | Personal systems, protokoły |
| r/selfimprovement | 850K | Refleksje, dane osobiste |
| r/deepwork | 45K | Core audience — tu jesteś ekspertem |
| r/indiegaming... wait | — | — |
| r/indiehackers (brak) / IndieHackers | — | Dev.to alternative |
| r/webdev | 1.2M | Tech artykuły (astro, multi-tenant) |
| r/astrojs | 15K | Tech artykuły specyficznie |
| r/SideProject | 200K | frinter.app launch thread |
| r/startups | 700K | frinter.app story |

**Zasady Reddit dla sukcesu:**
1. **10% reguła**: Na każdy post własnej treści → 9x komentuj/angażuj innych
2. **Nie linkuj od razu** — najpierw daj wartość w poście (pełny content), link do artykułu jako "jeśli chcesz więcej"
3. **Tytuł postu ≠ tytuł artykułu** — dostosuj do kultury subreddita
4. **Odpowiadaj na komentarze** przez minimum 2 godziny po postowaniu

**Przykład posta na r/deepwork:**
```
Title: I tracked every focus session for 90 days. Here's what the data actually shows.

[Pełna treść z najciekawszymi danymi — nie skrót]

I built frinter.app to track this automatically. Happy to share the methodology
if anyone's interested (Focus Sprint / Frint concept).

TL;DR: [3 kluczowe insights]
```

---

### 4.4 Dev.to i Medium — Syndykacja Techniczna

**Dev.to** (darmowe, SEO-friendly, developer audience):
- Republish artykuły techniczne (#6 — multi-tenant Astro, #9 — llms.txt)
- Dodaj canonical URL wskazujący na Twój blog → SEO safe
- Dev.to ma bardzo dobry organic reach w Google dla tech queries

**Medium** (platforma ogólna):
- Republish artykuły non-tech (#1 Focus Sprint, #2 FRINT, #8 Building in Public)
- Canonical URL → Twój blog
- Medium ma autorytetu domeny ~90 → szybki ranking dla long-tail

**Jak ustawić canonical w Dev.to:**
```
W edytorze → "Canonical URL" → https://przemyslawfilipiak.com/blog/[slug]
```

---

### 4.5 Hacker News (Show HN)

Dla artykułów technicznych — **Show HN** to wysokiej wartości traffic od developerów i founderów.

**Najlepsze do Show HN:**
- Artykuł #6: "How I Built Multi-Tenant SEO Platform with Astro"
- Artykuł #9: "llms.txt — the new robots.txt for AI"
- Launch frinter.app

**Timing:** Wtorek–Czwartek, godz. 10-12 EST (9-11 NY = 15-17 Warszawa) to peak HN traffic.

---

### 4.6 Newslettery i Agregatory

Wyślij swoje artykuły do:
- **TLDR Newsletter** (`tldr.tech/submit`) — tech news, 1M+ subscribers
- **Bytes.dev** — JavaScript/TS newsletter
- **Indie Hackers** (`indiehackers.com`) — post story o Frinter
- **BetaList** — pre-launch / early stage product listing
- **AlternativeTo** — alternatywa dla Toggl, RescueTime, Forest App

---

## FILAR 5 — Link Building & PR (Dni 3–7)

### 5.1 Szybkie Backlinki — 1 Tydzień

Backlinki to nadal #1 ranking factor dla Google. Nowa strona bez backlinków nie rankuje.

**Darmowe, łatwe backlinki:**

| Źródło | Czas | Typ linku |
|---|---|---|
| GitHub bio → link do strony | 2 min | Nofollow ale authority |
| GitHub README FrinterFlow → link | 5 min | Dofollow |
| PyPI listing FrinterFlow → link | 10 min | Dofollow |
| LinkedIn profil → website | 2 min | Nofollow |
| Product Hunt listing Frinter | 30 min | Dofollow, DA ~90 |
| AlternativeTo listing | 15 min | Dofollow |
| BetaList | 15 min | Dofollow |
| Crunchbase | 20 min | Nofollow ale authority |
| Dev.to profil → website | 2 min | Nofollow |
| Medium profil → website | 2 min | Nofollow |
| IndieHackers profil + produkt | 20 min | Dofollow |
| HackerNews profil → about | 5 min | Nofollow |

**Razem: ~2 godziny pracy = 10-15 backlinków z autorytetu domen**

---

### 5.2 Skyscraper Technique — Wyższy Effort, Większy Efekt

1. Znajdź artykuły które rankują na Twoje słowa kluczowe (Ahrefs Free, Ubersuggest)
2. Sprawdź kto linkuje do tych artykułów (Ahrefs → Backlinks)
3. Napisz LEPSZY artykuł niż ten który rankuje
4. Skontaktuj się z linkerami: "Hey, linkujesz do [X]. Mam nowszy, bardziej kompletny artykuł o [tema]. Czy możesz zaktualizować link?"

**Zamiast cold outreach — zacznij od komentowania artykułów które ranują na Twoje keywords. Buduj relację.**

---

### 5.3 HARO / Qwoted — Cytowania w Mediach

**HARO (Help a Reporter Out)** / **Qwoted** — platformy gdzie dziennikarze szukają ekspertów.

```
1. Zarejestruj się jako ekspert (expert@helpareporter.com)
2. Kategorie: Technology, Productivity, Startups
3. Odpowiadaj na pytania dot. deep work, productivity apps, AI
4. Jeden dobry cytat w Forbes/Inc = backlink DA90+ + authority
```

**Realny czas commitment:** 15 minut dziennie na przeglądanie queries.

---

### 5.4 Guest Posting — Szybkie Pitch

Wyślij propozycję guest posta do:
- **Zen Habits** (Leo Babauta) — deep work/habits niche
- **James Clear Newsletter** — produktywność
- **Todoist Blog** — produktywność / apps
- **Zapier Blog** — automation/productivity
- **Dev.to** (technicznie nie guest post, ale published articles)

**Szablon pitcha (max 5 zdań):**
```
Cześć [imię],

Widzę że Twoi czytelnicy interesują się [deep work/productivity].
Chciałbym zaproponować artykuł: "[Tytuł]".

W skrócie: [1-2 zdania o unikalnym kącie i moich danych/doświadczeniu].

Czy to byłoby dobre dla Twoich czytelników?

[Twoje imię] — Twórca frinter.app
```

---

## Plan Działań Dzień Po Dniu

### DZIEŃ 1 (Poniedziałek) — Fundament

**Rano (2h): Techniczne SEO**
- [ ] Google Search Console — dodaj obie domeny + submit sitemap
- [ ] Bing Webmaster Tools — import z GSC
- [ ] Weryfikacja techniczna (sitemap, llms.txt, robots.txt)
- [ ] Aktualizacja llms.txt (Last-Updated: dziś)

**Południe (3h): Content**
- [ ] Artykuł #1: "What Is a Focus Sprint (Frint)?"
- [ ] Artykuł #2: "The FRINT Check-in"
- [ ] Publish obu przez Admin panel
- [ ] Sprawdź że sitemap.xml zawiera nowe URL

**Wieczór (1h): Dystrybucja**
- [ ] LinkedIn Post #1 (Focus Sprint)
- [ ] GitHub bio → dodaj link do frinter.app
- [ ] PyPI (jeśli FrinterFlow na PyPI) → dodaj link

---

### DZIEŃ 2 (Wtorek) — Content + GEO

**Rano (2h): Content**
- [ ] Artykuł #3: "Focus Sprints vs Pomodoro"
- [ ] Artykuł #4: "How I Track Deep Work Sessions"
- [ ] Publish

**Południe (2h): GEO + Dystrybucja**
- [ ] Aktualizacja llms-full.txt (summaries nowych artykułów)
- [ ] LinkedIn Post #2 (FRINT Check-in)
- [ ] Product Hunt — zacznij draft listingu Frinter

**Wieczór (1h): Reddit**
- [ ] Post na r/deepwork — artykuł #1 lub #3 jako thread
- [ ] Komentuj 5 innych wątków (budowanie karma)

---

### DZIEŃ 3 (Środa) — GEO + Tech Content

**Rano (2h): Content**
- [ ] Artykuł #5: "What Is GEO?"
- [ ] Artykuł #6: "Multi-Tenant Astro SEO Platform"
- [ ] Publish

**Południe (2h): Backlinki + Dystrybucja**
- [ ] AlternativeTo — dodaj frinter.app
- [ ] IndieHackers — profil + produkt
- [ ] BetaList — submit frinter.app
- [ ] LinkedIn Post #3 (Building in Public)

**Wieczór (1h): Syndykacja**
- [ ] Dev.to — republish Artykuł #6 z canonical URL
- [ ] Hacker News — Show HN dla artykułu #6

---

### DZIEŃ 4 (Czwartek) — Breadth

**Rano (2h): Content**
- [ ] Artykuł #7: "7 Best Apps for High Performers"
- [ ] Artykuł #8: "Building in Public"
- [ ] Publish

**Południe (2h): Dystrybucja**
- [ ] LinkedIn Post #4 (7 Best Apps)
- [ ] Reddit r/productivity — artykuł #3 (Focus Sprints vs Pomodoro)
- [ ] Medium — republish artykuł #2 (FRINT Check-in)

**Wieczór (1h): HARO + Outreach**
- [ ] Zarejestruj się w HARO/Qwoted
- [ ] Sprawdź queries — odpowiedz na 2-3

---

### DZIEŃ 5 (Piątek) — Authority Pieces

**Rano (3h): Content**
- [ ] Artykuł #9: "llms.txt Guide"
- [ ] Artykuł #10: "High Performer's Deep Work Guide 2026"
- [ ] Publish

**Południe (2h): Dystrybucja + PR**
- [ ] LinkedIn Post #5 (GEO vs SEO)
- [ ] Dev.to — republish artykuł #9 (llms.txt)
- [ ] Hacker News — artykuł #9 (nowy angle na AI/web)

**Wieczór (1h): Google Search Console**
- [ ] Sprawdź Coverage — które URL zostały zaindeksowane?
- [ ] Użyj "URL Inspection" dla 2-3 artykułów — request indexing

---

### DZIEŃ 6 (Sobota) — Compound Effect

**Rano (2h): Weryfikacja**
- [ ] GSC: jakie kliknięcia/wyświetlenia już mamy?
- [ ] Umami: skąd przychodzi traffic?
- [ ] Sprawdź ranking w Google dla kluczowych terminów
- [ ] AI test: zapytaj ChatGPT/Perplexity o "what is a focus sprint" — czy Cię cytują?

**Reszta dnia:**
- [ ] LinkedIn Post #6 (Personal reflection)
- [ ] Reddit r/selfimprovement — artykuł #4 lub #8
- [ ] Odpowiedz na wszystkie komentarze/pytania z tygodnia
- [ ] Crunchbase — dodaj Frinter jako produkt
- [ ] Product Hunt — finalizuj listing (launch w następnym tygodniu?)

---

### DZIEŃ 7 (Niedziela) — Review + Planowanie Tygodnia 2

**Rano (1h): Reverse RAG Loop**
- [ ] Zapytaj AI: "What is Focus Sprint?"
- [ ] Zapytaj AI: "Best deep work tracker apps"
- [ ] Zapytaj AI: "Generative engine optimization guide"
- [ ] Zanotuj gdzie Cię nie ma → to są tematy artykułów na tydzień 2

**Południe:**
- [ ] LinkedIn Post #7 (Tygodniowy FRINT Check-in)
- [ ] Zaplanuj 10 artykułów na tydzień 2

---

## Metryki i KPI — Co Mierzyć

### Cele na 7 dni

| Metryka | Cel | Jak Mierzyć |
|---|---|---|
| Artykuły opublikowane | 10 | Admin panel |
| Strony zaindeksowane (GSC) | 5-10 | Google Search Console → Coverage |
| Organiczne kliknięcia (GSC) | 50-200 | GSC → Performance |
| Sesje (Umami) | 200-500 | Umami dashboard |
| Backlinki (nowe) | 10-15 | Ahrefs Free / GSC → Links |
| LinkedIn impressions | 5,000+ | LinkedIn Analytics |
| Reddit upvotes łącznie | 50+ | Reddit profil |
| AI cytowania (manual check) | 1-2 | Manual ChatGPT/Perplexity |

### Cele na 30 dni (kontynuacja strategii)

| Metryka | Cel |
|---|---|
| Artykuły opublikowane | 40+ |
| Organiczne sesje/miesiąc | 2,000-5,000 |
| Backlinki | 50+ |
| Ranking top 10 dla 3+ keywords | ✓ |
| AI Answer cytowania | 5+ |
| Email subscribers / waitlist Frinter | 100+ |

---

## Narzędzia — Darmowe i Konieczne

### Must-Have (darmowe)

| Narzędzie | Do czego |
|---|---|
| **Google Search Console** | Indeksacja, rankingi, błędy |
| **Bing Webmaster Tools** | Bing + Copilot |
| **PageSpeed Insights** | Core Web Vitals |
| **Google Rich Results Test** | JSON-LD walidacja |
| **Ahrefs Free** (ahrefs.com/free-seo-tools) | Keyword difficulty, backlink checker |
| **Ubersuggest** (ubersuggest.com) | Keyword research |
| **Answer The Public** | Content ideas z pytań |
| **AlsoAsked** | People Also Ask mining |
| **HARO / Qwoted** | PR + backlinki |
| **Umami** | Analytics (już masz) |

### Warte Rozważenia (płatne)

| Narzędzie | Cena | Czy Warte |
|---|---|---|
| **Ahrefs ($99/mo)** | Pełne backlink + keyword data | Tak jeśli serio skalujesz |
| **SEMrush ($120/mo)** | Alternatywa dla Ahrefs | Nie oba jednocześnie |
| **Clearscope / Surfer SEO** | Content optimization | Na potem |

---

## Priorytety Jeśli Masz Tylko 4 Godziny Dziennie

Jeśli czas jest bardzo ograniczony, skup się tylko na tym:

```
ABSOLUTNY PRIORYTET (robi największą różnicę):

1. Google Search Console setup + sitemap submit (Dzień 1, 20 min)
2. Artykuł #1 — "What Is Focus Sprint" (Dzień 1, 2h)
3. Artykuł #2 — "FRINT Check-in" (Dzień 2, 2h)
4. LinkedIn post dla każdego artykułu (15 min/dzień)
5. 1x Reddit post na r/deepwork (Dzień 3, 30 min)
6. Dev.to republish artykułów technicznych (Dzień 4, 30 min)
7. Product Hunt listing Frinter (Dzień 5, 1h)

TO WYSTARCZY do wygenerowania pierwszych 500 sesji w tygodniu.
```

---

## Przestrogi — Czego NIE Robić

### Błędy które zniweczą pracę

1. **Nie publikuj 10 artykułów bez GSC setup** — Google nie będzie wiedział że istnieją
2. **Nie kupuj backlinków** — manual penalty, odwrotny efekt
3. **Nie spamuj Reddita** — ban na profil, zero efektu
4. **Nie duplikuj identycznej treści na 3 domenach** — canonical problem
5. **Nie zapomnij o Internal Linking** — każdy artykuł musi linkować do innych
6. **Nie pisz krótkich artykułów** — poniżej 800 słów nie rankuje w 2026
7. **Nie ignoruj meta description** — to Twój "ad copy" w wynikach Google
8. **Nie zmieniaj sługa po publikacji** — 301 redirect i tak, ale rankowanie leci do zera

---

## Tydzień 2 i Dalej — Systematyzacja

Po pierwszym tygodniu masz fundament. Teraz czas na system:

### Weekly Content Cadence

```
PONIEDZIAŁEK: Reverse RAG Loop (1h) → zidentyfikuj luki
WTOREK: Artykuł 1 (2-3h) + LinkedIn Post
ŚRODA: Artykuł 2 (2-3h) + Reddit
CZWARTEK: Dystrybucja + odpowiedzi na komentarze
PIĄTEK: GSC review + keyword opportunities
WEEKEND: LinkedIn Posts + przygotowanie tematów
```

### Velocity Cel

- **Tydzień 1:** 10 artykułów (blitz start)
- **Tydzień 2-8:** 2-3 artykuły tygodniowo (sustain quality)
- **Po 2 miesiącach:** 20-30 zaindeksowanych artykułów = organiczny traffic zaczyna rosnąć wykładniczo

### Automatyzacja (YOLO Mode)

Admin → YOLO Mode to Twoja przewaga. Skonfiguruj pipeline:
1. Cotygodniowy przegląd luk (Reddit, YouTube komentarze = pain points)
2. YOLO generuje 5-10 artykułów na podstawie luk
3. Ty edytujesz i publishujesz 2-3 najlepsze
4. Reszta jako drafty na następny tydzień

---

## Podsumowanie — Top 10 Akcji na Teraz

Jeśli masz 2 godziny zaraz po powrocie do komputera, zrób dokładnie to:

```
1.  Google Search Console → dodaj obie domeny → submit sitemap (20 min)
2.  Bing Webmaster Tools → import z GSC (5 min)
3.  Napisy Artykuł #1 "What Is Focus Sprint" → publish (90 min)
4.  LinkedIn Post o Focus Sprintach (15 min)
5.  Zaktualizuj llms.txt Last-Updated na dziś (5 min)
```

**Następnego dnia rano:**
```
6.  Artykuł #2 "FRINT Check-in" → publish
7.  LinkedIn Post o FRINT
8.  Reddit r/deepwork → wątek o Focus Sprintach
9.  Product Hunt — draft listing Frinter
10. Dev.to → republish artykuł techniczny
```

**Reszta tygodnia:** powtarzaj schemat artykuł → LinkedIn → syndykacja.

---

*Dokument powstał 2026-03-24. Bazuje na pełnej analizie architektury FrinterHero (Astro hybrid SSG, multi-tenant, 3 domeny), istniejącej infrastruktury SEO (llms.txt, robots.txt, JSON-LD, sitemap, RSS) oraz celach: maksymalny organiczny ruch w 7 dni dla frinter.app (web.frinter.app) i przemyslawfilipiak.com.*
