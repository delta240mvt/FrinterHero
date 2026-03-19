# Brand Clarity — Anthropic API Integration

**Ostatnia aktualizacja:** 2026-03-16
**Status:** ✅ W pełni zaimplementowane

Dokumentacja referencyjna wdrożonej integracji bezpośredniego Anthropic API w module Brand Clarity. Obejmuje architekturę, konfigurację przez UI, Extended Thinking i pełną mapę wywołań LLM.

---

## 1. ARCHITEKTURA KOŃCOWA

### Dwa providery LLM — równolegle

```
BC Scripts (bc-lp-parser, bc-scraper, bc-pain-clusterer, bc-lp-generator)
  ↑ env vars injected at spawn time
  │
  └── src/lib/bc-llm-client.ts
        ├── [BC_LLM_PROVIDER=openrouter] → OpenAI SDK → https://openrouter.ai/api/v1
        └── [BC_LLM_PROVIDER=anthropic]  → @anthropic-ai/sdk → api.anthropic.com
              └── Extended Thinking (opcjonalne, tylko Anthropic)
```

### Konfiguracja przez UI — nie przez .env

```
Admin UI /admin/brand-clarity/settings
  ↓ PUT /api/brand-clarity/settings
  ↓ bc_settings (PostgreSQL — 1 wiersz, JSONB config)
  ↑ GET /api/brand-clarity/settings

API spawn routes (projects, generate-variants, cluster, scrape/start)
  → getBcSettings() z DB
  → buildLlmEnv(settings)
  → spawn('npx tsx scripts/...', { env: { ...process.env, ...llmEnv } })
```

**W `.env` zostają tylko klucze API:**
```env
ANTHROPIC_API_KEY=sk-ant-TwójKlucz
OPENROUTER_API_KEY=sk-or-...
```

Cała reszta (provider, modele, ET budgets) — w panelu admina.

---

## 2. PLIKI — MAPA SYSTEMU

### Nowe pliki (dodane w tej integracji)

| Plik | Rola |
|------|------|
| `src/lib/bc-llm-client.ts` | Unified LLM client — OpenRouter lub Anthropic, z ET |
| `src/lib/bc-settings.ts` | Helper: `getBcSettings()`, `saveBcSettings()`, `buildLlmEnv()` |
| `src/pages/api/brand-clarity/settings.ts` | `GET` / `PUT /api/brand-clarity/settings` |
| `src/pages/admin/brand-clarity/settings.astro` | Panel UI z provider toggle, modelami, ET budgets |

### Zmienione pliki

| Plik | Co się zmieniło |
|------|-----------------|
| `scripts/bc-lp-parser.ts` | Import `callBcLlm`, `getBcLpModel`, `getBcThinkingBudget` zamiast OpenAI klienta |
| `scripts/bc-scraper.ts` | j.w. dla `getBcScraperModel` |
| `scripts/bc-pain-clusterer.ts` | j.w. dla `getBcClusterModel` |
| `scripts/bc-lp-generator.ts` | j.w. dla `getBcGeneratorModel` — 2 wywołania (HTML + meta JSON) |
| `src/db/schema.ts` | +`bcSettings` table (JSONB config) |
| `src/lib/bc-scrape-job.ts` | `start(projectId, extraEnv)` — przyjmuje env vars |
| `src/pages/api/brand-clarity/[projectId]/scrape/start.ts` | Czyta settings, przekazuje do `bcScrapeJob.start()` |
| `src/pages/api/brand-clarity/[projectId]/generate-variants.ts` | `runLpGenerator(projectId, extraEnv)` + inject settings |
| `src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts` | `runClusterer(projectId, extraEnv)` + inject settings |
| `src/pages/api/brand-clarity/projects/index.ts` | Inject settings do spawna lp-parsera |
| `src/pages/admin/brand-clarity/index.astro` | +przycisk ⚙ LLM Settings |
| `.env.example` | +`ANTHROPIC_API_KEY` (reszta przeniesiona do UI) |
| `package.json` | +`@anthropic-ai/sdk@^0.78.0` |

---

## 3. SCHEMAT BAZY DANYCH — `bc_settings`

```typescript
// src/db/schema.ts
export const bcSettings = pgTable('bc_settings', {
  id: serial('id').primaryKey(),
  config: jsonb('config').notNull().$type<{
    provider: string;               // 'openrouter' | 'anthropic'
    lpModel: string;
    scraperModel: string;
    clusterModel: string;
    generatorModel: string;
    extendedThinkingEnabled: boolean;
    lpThinkingBudget: number;
    scraperThinkingBudget: number;
    clusterThinkingBudget: number;
    generatorThinkingBudget: number;
  }>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Jeden wiersz** — jeśli tabela jest pusta, `getBcSettings()` zwraca `BC_SETTINGS_DEFAULTS`.

### Domyślne wartości (`BC_SETTINGS_DEFAULTS`)

| Pole | Domyślna wartość |
|------|-----------------|
| `provider` | `'openrouter'` |
| `lpModel` | `'claude-sonnet-4-6'` |
| `scraperModel` | `'claude-haiku-4-5-20251001'` |
| `clusterModel` | `'claude-sonnet-4-6'` |
| `generatorModel` | `'claude-sonnet-4-6'` |
| `extendedThinkingEnabled` | `false` |
| `lpThinkingBudget` | `10000` |
| `scraperThinkingBudget` | `5000` |
| `clusterThinkingBudget` | `16000` |
| `generatorThinkingBudget` | `16000` |

---

## 4. `src/lib/bc-settings.ts` — API helpera

```typescript
// Eksportowane funkcje:

getBcSettings(): Promise<BcSettingsConfig>
// Czyta z DB, fallback na BC_SETTINGS_DEFAULTS

saveBcSettings(config: BcSettingsConfig): Promise<void>
// Upsert — aktualizuje istniejący wiersz lub tworzy nowy

buildLlmEnv(s: BcSettingsConfig): Record<string, string>
// Konwertuje settings na env vars przekazywane do child process:
// BC_LLM_PROVIDER, BC_LP_ANTHROPIC_MODEL, BC_SCRAPER_ANTHROPIC_MODEL,
// BC_CLUSTER_ANTHROPIC_MODEL, BC_GENERATOR_ANTHROPIC_MODEL,
// BC_EXTENDED_THINKING_ENABLED, BC_*_THINKING_BUDGET (×4)
```

### Wzorzec użycia w API route (spawn)

```typescript
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';

// W handlerze POST przed spawnem:
const llmSettings = await getBcSettings();
spawn('npx', ['tsx', 'scripts/bc-lp-generator.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, BC_PROJECT_ID: String(projectId), ...buildLlmEnv(llmSettings) },
  shell: true,
});
```

---

## 5. `src/lib/bc-llm-client.ts` — Unified LLM Client

Czyta konfigurację z env vars (injektowanych przez spawner). Eksportuje:

```typescript
// Główne wywołanie
callBcLlm(options: BcLlmCallOptions): Promise<BcLlmResponse>

// Selektory modelu per krok (czytają z env vars)
getBcLpModel(): string
getBcScraperModel(): string
getBcClusterModel(): string
getBcGeneratorModel(): string

// Budżet ET per krok (undefined gdy ET wyłączone lub provider=openrouter)
getBcThinkingBudget(step: 'lp' | 'scraper' | 'cluster' | 'generator'): number | undefined
```

### Obsługa Extended Thinking

| Model | Tryb thinking |
|-------|--------------|
| `claude-opus-4-6` | `{ type: 'adaptive' }` (bez `budget_tokens` — deprecated) |
| `claude-sonnet-4-6` | `{ type: 'enabled', budget_tokens: N }` |
| `claude-haiku-4-5-20251001` | `{ type: 'enabled', budget_tokens: N }` |

**Automatyczna korekta `max_tokens`:** gdy ET włączone, klient zapewnia `max_tokens >= budget_tokens + 1024`.

**ET NIE działa przez OpenRouter** — parametr `thinking` jest ignorowany. ET dostępne wyłącznie z `BC_LLM_PROVIDER=anthropic`.

---

## 6. MAPA WYWOŁAŃ LLM — pełny przepływ

```
Admin UI: /admin/brand-clarity/settings
  → zapisuje do bc_settings (DB)

Brand Clarity Pipeline:
│
├── Stage 1: LP Parsing
│   POST /api/brand-clarity/projects (tworzy projekt)
│     → getBcSettings() → buildLlmEnv()
│     → spawn bc-lp-parser.ts { env: ...llmEnv }
│         → callBcLlm(getBcLpModel(), getBcThinkingBudget('lp'))
│             ├── [openrouter] → OpenAI SDK → openrouter.ai
│             └── [anthropic]  → Anthropic SDK → api.anthropic.com (opcjonalnie ET)
│         Output: lpStructureJson, lpTemplateHtml, featureMap, keywords → DB
│
├── Stage 4: YT Scraping → Pain Point Extraction
│   POST /api/brand-clarity/[id]/scrape/start
│     → getBcSettings() → buildLlmEnv()
│     → bcScrapeJob.start(projectId, llmEnv)
│         → spawn bc-scraper.ts { env: ...llmEnv }
│             → callBcLlm() per chunk (20 komentarzy)
│             Model: getBcScraperModel() (domyślnie Haiku — koszt)
│         Output: bcComments + bcExtractedPainPoints → DB
│
├── Stage 5: Pain Clustering
│   POST /api/brand-clarity/[id]/cluster-pain-points
│     → getBcSettings() → buildLlmEnv()
│     → runClusterer(projectId, llmEnv)
│         → spawn bc-pain-clusterer.ts { env: ...llmEnv }
│             → callBcLlm(getBcClusterModel(), getBcThinkingBudget('cluster'))
│         Output: bcPainClusters (2-3 klastry) → DB
│
└── Stage 6: LP Variant Generation
    POST /api/brand-clarity/[id]/generate-variants
      → getBcSettings() → buildLlmEnv()
      → runLpGenerator(projectId, llmEnv)
          → spawn bc-lp-generator.ts { env: ...llmEnv }
              Per wariant (×3):
              ├── Call A (HTML, 8192 tokens):
              │     callBcLlm(getBcGeneratorModel(), getBcThinkingBudget('generator'))
              └── Call B (meta JSON, 1000 tokens):
                    callBcLlm(getBcGeneratorModel(), thinkingBudget=undefined)
                    (ET wyłączone dla krótkiej odpowiedzi JSON)
          Output: bcLandingPageVariants (3 rekordy) → DB
```

---

## 7. PANEL ADMINA — `/admin/brand-clarity/settings`

Dostępny przez przycisk **⚙ LLM Settings** na stronie `/admin/brand-clarity`.

### Sekcje UI

**Provider**
- Radio: `OpenRouter` (domyślny) / `Anthropic Direct`
- Przy OpenRouter: sekcje Models i ET wyszarzone (opacity: 0.4)

**Modele** *(aktywne tylko dla Anthropic)*

| Krok | Dostępne modele |
|------|----------------|
| LP Parser + Generator | opus-4-6 / **sonnet-4-6** ★ / haiku-4-5 |
| Scraper (bulk) | **haiku-4-5** ★ / sonnet-4-6 / opus-4-6 |
| Pain Clusterer | opus-4-6 / **sonnet-4-6** ★ / haiku-4-5 |
| LP Generator HTML | opus-4-6 / **sonnet-4-6** ★ / haiku-4-5 |

**Extended Thinking** *(aktywne tylko dla Anthropic)*
- Toggle włącz/wyłącz
- Pola numeryczne z budżetem per krok (widoczne tylko gdy toggle ON)
- Zakres: 1024–64000 tokenów

**Zapis:** `PUT /api/brand-clarity/settings` — walidacja + upsert do DB.

---

## 8. DOSTĘPNE MODELE ANTHROPIC

| Model ID | Context | Max Output | Extended Thinking | Koszt input/output |
|----------|---------|------------|-------------------|--------------------|
| `claude-opus-4-6` | 1M | 128k | Adaptive (auto) | $5 / $25 MTok |
| `claude-sonnet-4-6` | 1M | 64k | Enabled + budget | $3 / $15 MTok |
| `claude-haiku-4-5-20251001` | 200k | 64k | Enabled + budget | $1 / $5 MTok |

**Ważne:**
- Opus 4.6: UI ignoruje budżet ET — model sam decyduje o głębokości myślenia (adaptive)
- Extended Thinking kosztuje **pełne tokeny thinking** (billing), nie tokeny podsumowania (widoczne w odpowiedzi)
- ET dla scraper: bulk wywołań → koszt rośnie liniowo z liczbą chunków — używać oszczędnie

---

## 9. REKOMENDOWANE KONFIGURACJE (przez UI)

### Konfiguracja 1: OpenRouter — produkcja (domyślna)
```
Provider: OpenRouter
```
Identyczne zachowanie jak przed integracją. Wymaga tylko `OPENROUTER_API_KEY` w `.env`.

### Konfiguracja 2: Anthropic Direct — bez ET
```
Provider: Anthropic Direct
LP Model: claude-sonnet-4-6
Scraper Model: claude-haiku-4-5-20251001
Cluster Model: claude-sonnet-4-6
Generator Model: claude-sonnet-4-6
Extended Thinking: OFF
```

### Konfiguracja 3: Anthropic Direct + Extended Thinking (premium quality)
```
Provider: Anthropic Direct
LP Model: claude-sonnet-4-6
Scraper Model: claude-haiku-4-5-20251001  ← Haiku bez ET (oszczędność przy bulk)
Cluster Model: claude-sonnet-4-6
Generator Model: claude-sonnet-4-6
Extended Thinking: ON
  LP Budget: 10 000
  Scraper Budget: 5 000   ← Niski (wiele wywołań)
  Cluster Budget: 16 000  ← Głębokie (1 wywołanie)
  Generator Budget: 16 000 ← Głębokie (3 wywołania)
```

### Konfiguracja 4: Anthropic + Opus 4.6 (maksymalna jakość)
```
Provider: Anthropic Direct
LP Model: claude-opus-4-6
Scraper Model: claude-haiku-4-5-20251001  ← Haiku dla bulk
Cluster Model: claude-opus-4-6
Generator Model: claude-opus-4-6
Extended Thinking: ON  ← Opus ignoruje budżet, używa adaptive
```

---

## 10. STATUS WDROŻENIA

### Faza 1 — Podstawowa integracja Anthropic SDK (2026-03-16)

| Task | Commit | Szczegóły |
|------|--------|-----------|
| Instalacja `@anthropic-ai/sdk@^0.78.0` | `88aa85c` | npm install |
| `src/lib/bc-llm-client.ts` | `88aa85c` | Unified client, OpenRouter + Anthropic, ET support |
| Refaktor 4 skryptów BC | `88aa85c` | `callBcLlm()` zamiast bezpośredniego OpenAI klienta |
| `.env.example` — nowe zmienne | `88aa85c` | `ANTHROPIC_API_KEY` + zmienne konfiguracyjne |

### Faza 2 — Konfiguracja przez UI (2026-03-16)

| Task | Commit | Szczegóły |
|------|--------|-----------|
| `bc_settings` tabela w DB | `d4f75d9` | Migracja: `drizzle-kit push` |
| `src/lib/bc-settings.ts` | `d4f75d9` | `getBcSettings`, `saveBcSettings`, `buildLlmEnv` |
| `GET/PUT /api/brand-clarity/settings` | `d4f75d9` | API route |
| `/admin/brand-clarity/settings` | `d4f75d9` | Panel UI (provider, modele, ET budgets) |
| Inject settings do 4 spawn routes | `d4f75d9` | projects, generate-variants, cluster, scrape/start |
| `bc-scrape-job.start(id, extraEnv)` | `d4f75d9` | Przyjmuje env vars z zewnątrz |
| Przeniesienie konfiguracji z `.env` do UI | `d4f75d9` | Tylko `ANTHROPIC_API_KEY` zostaje w `.env` |

### Do wykonania przez użytkownika

1. Wklej swój `ANTHROPIC_API_KEY` do `.env.local`
2. Otwórz `/admin/brand-clarity/settings` i wybierz provider + modele
3. Zapisz — zmiany działają natychmiast przy kolejnym uruchomieniu pipeline

---

## 11. UWAGI TECHNICZNE

### Dlaczego env vars jako most między API a skryptami

Skrypty BC (`bc-lp-parser.ts` itd.) to osobne child processes — nie mają dostępu do DB ani do Node.js modułów serwera. Konfiguracja musi być przekazana przez `process.env`. `buildLlmEnv()` konwertuje settings z DB na env vars, które są injektowane w momencie spawnu.

### Backward compatibility

Domyślna konfiguracja w UI to `provider: openrouter` — identyczne zachowanie jak przed integracją. Zero ryzyka regresji przy pierwszym uruchomieniu.

### OpenRouter a Extended Thinking

OpenRouter nie obsługuje parametru `thinking` (stan: Q1 2026). `callBcLlm` ignoruje `thinkingBudget` gdy `BC_LLM_PROVIDER=openrouter` — panel UI wyszarza sekcję ET przy wyborze OpenRouter.

### Opus 4.6 — adaptive thinking

`claude-opus-4-6` ma deprecated `budget_tokens`. `buildThinkingConfig()` w `bc-llm-client.ts` wykrywa ten model i zwraca `{ type: 'adaptive' }` zamiast `{ type: 'enabled', budget_tokens: N }`.

### Meta JSON call w generatorze — bez ET

`bc-lp-generator.ts` ma 2 wywołania per wariant:
- **Call A (HTML):** pełny budżet ET — generuje kompletny HTML LP
- **Call B (meta JSON):** `thinkingBudget: undefined` — ET nie ma sensu dla 1000-tokenowej odpowiedzi JSON

### `generationModel` w `bcLandingPageVariants`

Kolumna zapisuje faktyczny model użyty do generacji. Po wdrożeniu: `claude-sonnet-4-6` (bezpośredni model ID) zamiast `anthropic/claude-sonnet-4-6` (format OpenRouter).
