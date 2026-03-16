# Brand Clarity — Konfiguracja LLM przez UI

**Data:** 2026-03-16
**Cel:** Przenieść całą konfigurację LLM (provider, modele, Extended Thinking) z `.env` do panelu admina. W `.env` zostają tylko klucze API.

---

## Architektura

```
Admin UI /admin/brand-clarity/settings
        ↓ PUT /api/brand-clarity/settings
        ↓ bc_settings (PostgreSQL — 1 wiersz JSONB)
        ↑ GET /api/brand-clarity/settings

Spawn API routes (projects, generate-variants, cluster, scrape/start)
        → getBcSettings() → buildLlmEnv()
        → spawn('npx tsx scripts/...', { env: { ...process.env, ...llmEnv } })
```

## Nowe pliki

| Plik | Rola |
|------|------|
| `src/lib/bc-settings.ts` | Helper: getBcSettings(), saveBcSettings(), buildLlmEnv() |
| `src/pages/api/brand-clarity/settings.ts` | GET / PUT |
| `src/pages/admin/brand-clarity/settings.astro` | Strona ustawień |

## Zmienione pliki

| Plik | Zmiana |
|------|--------|
| `src/db/schema.ts` | +`bcSettings` table |
| `src/pages/api/brand-clarity/projects/index.ts` | inject llmEnv do spawna |
| `src/pages/api/brand-clarity/[projectId]/generate-variants.ts` | inject llmEnv |
| `src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts` | inject llmEnv |
| `src/lib/bc-scrape-job.ts` | start() przyjmuje extraEnv |
| `src/pages/api/brand-clarity/[projectId]/scrape/start.ts` | czyta settings, przekazuje do job |
| `src/pages/admin/brand-clarity/index.astro` | link do /settings |

## BcSettingsConfig (typ)

```typescript
{
  provider: 'openrouter' | 'anthropic';
  lpModel: string;           // dla lp-parser + lp-generator
  scraperModel: string;      // dla bc-scraper
  clusterModel: string;      // dla bc-pain-clusterer
  generatorModel: string;    // dla bc-lp-generator
  extendedThinkingEnabled: boolean;
  lpThinkingBudget: number;
  scraperThinkingBudget: number;
  clusterThinkingBudget: number;
  generatorThinkingBudget: number;
}
```

## Dostępne modele Anthropic w UI

```
claude-opus-4-6          — Opus 4.6 (adaptive thinking)
claude-sonnet-4-6        — Sonnet 4.6 ★ (domyślny)
claude-haiku-4-5-20251001 — Haiku 4.5 (szybki, tani)
```

## Checklist

- [x] `src/db/schema.ts` — dodano `bcSettings`
- [x] `src/lib/bc-settings.ts` — helper
- [x] `src/pages/api/brand-clarity/settings.ts` — GET/PUT
- [x] `src/pages/admin/brand-clarity/settings.astro` — UI
- [x] `src/pages/api/brand-clarity/projects/index.ts` — llmEnv inject
- [x] `src/pages/api/brand-clarity/[projectId]/generate-variants.ts` — llmEnv inject
- [x] `src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts` — llmEnv inject
- [x] `src/lib/bc-scrape-job.ts` — extraEnv param
- [x] `src/pages/api/brand-clarity/[projectId]/scrape/start.ts` — settings inject
- [x] `src/pages/admin/brand-clarity/index.astro` — settings link
- [x] `npx drizzle-kit push` — migracja DB
