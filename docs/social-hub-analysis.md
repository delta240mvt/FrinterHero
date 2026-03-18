# Social Hub — Pełna Analiza Kodu, Bugi i Sugestie Jakościowe

> Data analizy: 2026-03-18  
> Analizowane pliki: `src/pages/admin/social-hub/**`, `src/pages/api/social-hub/**`, `src/lib/sh-*.ts`

---

## Mapa architektury

```
new.astro (wizard 5-krokowy)
  └─► POST /api/social-hub/briefs         → tworzy brief
        ├─ loadSource(sourceType, id)      → sh-source-loader.ts
        └─ matchKbEntries(content, 3)      → sh-kb-matcher.ts

[briefId].astro (detail view)
  ├─► POST /api/social-hub/briefs/[id]/generate-copy → sh-copywriter-job.ts
  │     └─► GET /api/social-hub/briefs/[id]/stream   (SSE)
  ├─► PUT  /api/social-hub/briefs/[id]/copy           → edycja + approve/reject
  ├─► POST /api/social-hub/briefs/[id]/render         → sh-image-gen.ts / sh-video-job.ts
  └─► POST /api/social-hub/briefs/[id]/publish        → sh-distributor.ts

index.astro (lista briefów)
  └─► DELETE /api/social-hub/briefs/[id]   ← ⚠️ BRAK TEGO ENDPOINTU

sources API: GET /api/social-hub/sources?type=XXX&search=YYY
accounts API: GET/POST /api/social-hub/accounts
              DELETE/PUT /api/social-hub/accounts/[id]
templates API: GET/POST/PUT /api/social-hub/templates
settings API:  GET/PUT /api/social-hub/settings
queue API:     GET/POST/DELETE/PUT /api/social-hub/queue
analytics API: GET /api/social-hub/analytics
calendar API:  GET/PUT /api/social-hub/calendar
repurpose API: POST /api/social-hub/repurpose
```

---

## 🔴 Krytyczne Bugi (naprawione + znalezione)

### BUG-01 — `type=articles` → 400 Bad Request [NAPRAWIONY ✅]

**Plik:** `src/pages/admin/social-hub/new.astro`  
**Linia:** 60–67 (select option values)

**Opis:**  
Wartości `value` w `<select id="source-type">` używały form pluralnych:
```html
<!-- PRZED (BŁĘDNE) -->
<option value="articles">Articles</option>
<option value="pain_points">Pain Points</option>
<option value="pain_clusters">Pain Clusters</option>
...
```

API `sources.ts` (linia 270–278) definiuje `VALID_TYPES` wyłącznie w formach singularnych:
```ts
const VALID_TYPES = ['article','pain_point','pain_cluster','content_gap','kb_entry','reddit_gap','yt_gap'];
```

Walidacja na linii 305:
```ts
if (typeParam && !(VALID_TYPES as readonly string[]).includes(typeParam)) {
  return new Response(..., { status: 400 });
}
```

Każde zapytanie frontendu zwracało **400** od razu.

**Fix:** Zmieniono wartości select na singularne + zaktualizowano inicjalny `state.sourceType` i `formatSourceType()`.

---

### BUG-02 — `fetchSources()` sprawdza `data.items` ale API zwraca gołą tablicę [NAPRAWIONY ✅]

**Plik:** `src/pages/admin/social-hub/new.astro`  
**Linia:** ~319

**Opis:**  
```js
// PRZED (BŁĘDNE)
if (!data.items || data.items.length === 0) { ... }
data.items.forEach(item => { ... });
```

API `sources.ts` zwraca:
```ts
return new Response(JSON.stringify(results), ...); // gołe array SourceRow[]
```

Nawet po naprawie BUG-01, wszystkie wyniki byłyby zignorowane bo `data.items` = `undefined`.

**Fix:** Zastąpiono `data.items` przez `Array.isArray(data) ? data : (data.items ?? [])`.

---

### BUG-03 — `item.id` zamiast `item.sourceId` przy mapowaniu kart [NAPRAWIONY ✅]

**Plik:** `src/pages/admin/social-hub/new.astro`  
**Linia:** ~328

**Opis:**  
API `sources.ts` zwraca obiekty `SourceRow` z polem `sourceId`, a nie `id`:
```ts
type SourceRow = {
  sourceType: string;
  sourceId: number;  // ← to pole
  title: string;
  ...
};
```

Frontend używał `item.id` → `card.dataset.id` → `state.selectedSource.id` byłoby `undefined`, a potem `parseInt(undefined)` = `NaN`.

**Fix:** `card.dataset.id = item.sourceId ?? item.id`.

---

### BUG-04 — `targetPlatforms` nieobecny w POST payload [NAPRAWIONY ✅]

**Plik:** `src/pages/admin/social-hub/new.astro` → `src/pages/api/social-hub/briefs/index.ts`

**Opis:**  
`briefs/index.ts` linia 102:
```ts
if (!Array.isArray(targetPlatforms) || !Array.isArray(targetAccountIds)) {
  return new Response(..., { status: 400 });
}
```

Frontend wysyłał payload BEZ pola `targetPlatforms`. Każdy submit kroku 5 zwracałby **400**.

**Fix:** Dodano derywację `targetPlatforms` z zaznaczonych accountId → platform lookup z `accountsData` (dostępne przez `define:vars`).

---

### BUG-05 — Brak DELETE na `/api/social-hub/briefs/[id]` [NIEZAIMPLEMENTOWANE]

**Plik:** `src/pages/api/social-hub/briefs/[id].ts`  
**Plik UI:** `src/pages/admin/social-hub/index.astro` linia 252

**Opis:**  
`index.astro` wywołuje:
```js
await fetch(`/api/social-hub/briefs/${pendingId}`, { method: 'DELETE' });
```

Plik `briefs/[id].ts` eksportuje **tylko** `GET`. Brak `DELETE`. Kliknięcie "Delete" w liście zwraca **405 Method Not Allowed**.

**Sugestia naprawy:**  
```ts
// Dodać do src/pages/api/social-hub/briefs/[id].ts
export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }
  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }
  try {
    // Cascade delete: generated copy, media assets, publish logs, metrics
    await db.delete(shPostMetrics).where(
      inArray(shPostMetrics.publishLogId, 
        db.select({ id: shPublishLog.id }).from(shPublishLog).where(eq(shPublishLog.briefId, id))
      )
    );
    await db.delete(shPublishLog).where(eq(shPublishLog.briefId, id));
    await db.delete(shMediaAssets).where(eq(shMediaAssets.briefId, id));
    await db.delete(shGeneratedCopy).where(eq(shGeneratedCopy.briefId, id));
    const [deleted] = await db.delete(shContentBriefs).where(eq(shContentBriefs.id, id)).returning();
    if (!deleted) return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404, headers: JSON_HEADERS });
    return new Response(JSON.stringify({ ok: true, id }), { headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Brief DELETE]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
```

---

### BUG-06 — "Approve Media" wysyła PUT do `/render` ale ten endpoint nie ma PUT [UI-ONLY]

**Plik:** `src/pages/admin/social-hub/[briefId].astro` linia 738–741  
**Plik API:** `src/pages/api/social-hub/briefs/[id]/render.ts`

**Opis:**  
```js
// UI wysyła PUT
const res = await fetch(`/api/social-hub/briefs/${BRIEF_ID}/render`, {
  method: 'PUT',
  body: JSON.stringify({ assetId, action: 'approve' }),
});
```

`render.ts` eksportuje wyłącznie `POST`. Zatwierdzenie mediów zwraca **405 Method Not Allowed** i nie aktualizuje statusu assetu ani briefa.

**Sugestia naprawy:**  
Dodać `PUT` do `render.ts` lub przekazać logikę approva assetu do dedykowanego endpointu (np. `render.ts` z `action: 'approve'` obsługiwanym przez `PUT`):

```ts
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) { ... }
  const briefId = parseInt(params.id || '0', 10);
  const body = await request.json().catch(() => ({}));
  const { assetId, action } = body;
  
  if (action === 'approve' && assetId) {
    await db.update(shMediaAssets)
      .set({ status: 'approved' })
      .where(and(eq(shMediaAssets.id, assetId), eq(shMediaAssets.briefId, briefId)));
    await db.update(shContentBriefs)
      .set({ status: 'published' })
      .where(eq(shContentBriefs.id, briefId));
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  }
  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: JSON_HEADERS });
};
```

---

### BUG-07 — Render "new" POST brakuje `copyId` [CZĘŚCIOWY BUG]

**Plik:** `src/pages/admin/social-hub/[briefId].astro` linia 787–792

**Opis:**  
```js
// UI wysyła tylko { format } bez copyId
body: JSON.stringify({ format }),
```

`render.ts` wymaga obowiązkowo `copyId` (linia 36):
```ts
if (!copyId || !format) {
  return new Response(JSON.stringify({ error: 'Missing required fields: copyId, format' }), { status: 400 });
}
```

Kliknięcie "🎬 Render" zawsze zwraca **400**, mimo że approved copy istnieje.

**Sugestia naprawy w UI:**  
```js
document.getElementById('btn-render')?.addEventListener('click', async () => {
  const templateSelect = document.getElementById('render-template-select');
  const format = templateSelect?.value;
  if (!format) { alert('Please select a template/format first.'); return; }
  
  // Pobierz ID approved copy z DOM lub ze stanu
  const approvedCopyId = document.querySelector('[data-copy-id][data-status="approved"]')?.dataset.copyId;
  if (!approvedCopyId) { alert('No approved copy found. Approve a copy variant first.'); return; }
  
  const res = await fetch(`/api/social-hub/briefs/${BRIEF_ID}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ copyId: parseInt(approvedCopyId), format }),
  });
  ...
});
```

---

### BUG-08 — `data-status` nie jest przechowywany na kartach copy w [briefId].astro

**Plik:** `src/pages/admin/social-hub/[briefId].astro`

**Opis:**  
Karty copy (`<div class="tab-panel" data-copy-id={copy.id}>`) nie mają atrybutu `data-status`. BUG-07 miał być naprawiony przez querySelector `[data-status="approved"]`, ale nie zadziała bez tego atrybutu.

**Fix:** Dodać `data-status={copy.status}` do elementu `<div class="tab-panel">`.

---

### BUG-09 — `data-meta` w kartach źródeł jest stringiem JSON, ale wyświetlany jest raw

**Plik:** `src/pages/admin/social-hub/new.astro` linia ~335

**Opis:**  
```js
card.dataset.meta = item.meta || JSON.stringify(item.metadata ?? {});
// Potem w template:
${item.meta ? `<span class="source-card-badge">${escapeHtml(item.meta)}</span>` : ''}
```

Gdy `item.meta` jest undefined (bo API zwraca `metadata` jako obiekt, nie `meta` jako string), wyświetlany jest surowy JSON-string jako badge: `{"status":"published","tags":[...]...}`.

**Fix:** Wyciągać czytelną informację z metadata zamiast serializować cały obiekt:
```js
const metaBadge = item.meta || 
  (item.metadata?.status ?? item.metadata?.category ?? item.metadata?.emotionalIntensity ?? '');
card.dataset.meta = String(metaBadge);
```

---

### BUG-10 — Baza błędów SSE: `variantCount` nie jest emitowany ze streamu

**Plik:** `src/pages/api/social-hub/briefs/[id]/stream.ts`

**Opis:**  
`[briefId].astro` linia 545:
```js
if (payload.variantCount !== undefined && variantCountEl) {
  variantCountEl.textContent = payload.variantCount;
}
```

`stream.ts` emituje tylko `{ line: ... }` i `{ done: true, code, status, result }`. Pole `variantCount` nigdy nie jest emitowane → licznik wariantów zawsze pozostaje `0`.

**Fix:** Albo emitować update z `variantCount` w job-u (`sh-copywriter-job.ts`), albo usunąć zbędny licznik z UI.

---

### BUG-11 — `totalPosts` w `index.astro` pokazuje Limit 50, nie realną sumę

**Plik:** `src/pages/admin/social-hub/index.astro` linia 10, 20

**Opis:**  
```ts
briefs = await db.select().from(shContentBriefs).orderBy(...).limit(50); // max 50
const totalPosts = briefs.length; // zawsze ≤ 50
```

Stat "Total Posts" będzie nieprawdziwy gdy jest >50 briefów.

**Fix:**  
```ts
const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(shContentBriefs);
// ...
const totalPosts = total;
```

---

## 🟡 Problemy z przepływem informacji (Data Flow Issues)

### FLOW-01 — `state.sourceType` w new.astro jest ustawiony jako wybrany typ, ale POSTowany `sourceType` musi się zgadzać z wartościami oczekiwanymi przez `loadSource()`

**Opis:**  
`loadSource()` w `sh-source-loader.ts` (switch/case) obsługuje: `article`, `pain_point`, `pain_cluster`, `content_gap`, `kb_entry`, `reddit_gap`, `yt_gap`.

Po naprawie BUG-01 wartości selecta są już singularne — **przepływ jest spójny** po naprawie.

---

### FLOW-02 — `copy.status` po zatwierdzeniu nie zmienia `brief.status` "rendering" na nic po reject

**Opis:**  
`copy.ts` linia 67:
```ts
if (body.status === 'approved') {
  await db.update(shContentBriefs).set({ status: 'rendering' }).where(...);
}
```

Brak logiki dla `rejected`:  
- Jeśli zatwierdzono A, brief = `rendering`.  
- Jeśli potem odrzucono B (inny wariant), brief status nie jest resetowany.  
- Wynik: brief utknie w stanie `rendering` mimo braku approved copy.

**Sugestia:** Przy `rejected` sprawdzić czy jest jeszcze jakiś `approved` copy; jeśli nie, cofnąć brief do `copy_review`.

---

### FLOW-03 — Render media: template select w briefId.astro używa hardcoded wartości niezgodnych z bazą

**Plik:** `src/pages/admin/social-hub/[briefId].astro` linia 278–283

**Opis:**  
```html
<option value="square_1x1">Square 1:1</option>
<option value="portrait_9x16">Portrait 9:16</option>
<option value="landscape_16x9">Landscape 16:9</option>
<option value="story_4x5">Story 4:5</option>
```

Te wartości są używane jako `templateSlug` w `render.ts`. Ale `shTemplates.slug` w bazie to wartości jak `retro-quote-card`, `minimal-dark`, itp. (z `sh-image-gen.ts`).

**Fix:** Załadować listę aktywnych szablonów z `/api/social-hub/templates` dynamicznie zamiast hardcode'ować slugi.

---

### FLOW-04 — `loadSource()` akceptuje tylko singularne `sourceType`, ale brief w bazie może mieć wartość `articles` (błędną) z poprzednich submisji

**Opis:**  
Jeśli briefs były już tworzone przed naprawą BUG-01 (z `sourceType: 'articles'`), `loadSource()` w `sh-source-loader.ts` defaultuje do `return null` (case default). Copywriter job wtedy dostanie pusty source i może wygenerować błąd lub puste warianty.

**Sugestia:** Dodać do `loadSource()` normalizację:
```ts
const normalized = {
  articles: 'article', pain_points: 'pain_point', ...
}[sourceType] ?? sourceType;
```

---

### FLOW-05 — `sh-kb-matcher.ts` — słaba jakość matchowania słów kluczowych

**Opis:**  
```ts
const keywords = text
  .split(/\s+/)
  .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
  .filter(w => w.length > 4)
  .slice(0, 5);
```

- Tylko 5 słów kluczowych, tylko tekst angielski/ASCII.
- Polski tekst (`sourceTitle` po polsku) straci znaki diakrytyczne → złe dopasowanie.
- `filter(w => w.length > 4)` zmienia `ból` → `bol` (4 litery) → odfiltrowane.

**Sugestia:** Zwiększyć limit słów, dodać normalizację Unicode, lub przejść na full-text search (PostgreSQL `tsvector`).

---

## 🟡 Drobne bugi i niespójności

| #     | Lokalizacja                    | Problem                                                                                 |
|-------|--------------------------------|-----------------------------------------------------------------------------------------|
| S-01  | `sources.ts` — gdzie-when      | Brak paginacji: hardcoded `.limit(100)`. Przy dużych tabelach zwróci tylko 100 rekordów, bez informacji o paginacji. |
| S-02  | `briefs/index.ts` GET          | `count(*)::int` działa tylko na Postgres. Nie ma failsafe dla SQLite.                    |
| S-03  | `[briefId].astro` — render     | "Re-render" wysyła `{ assetId, format }` ale API `render.ts` POST nie obsługuje `assetId` jako parametru do re-renderu — tworzy zawsze nowy asset. |
| S-04  | `accounts/index.ts` GET        | Brak try/catch — błąd DB crashuje całość bez obsługi błędu.                              |
| S-05  | `new.astro` — fetchSources     | Brak obsługi HTTP 401 — nie przekierowuje do logowania.                                  |
| S-06  | `index.astro` stats            | `inQueue` zlicza też `draft` — ale draft nie jest w kolejce.                             |
| S-07  | `[briefId].astro` stage-bar    | Brak stanów `generating`, `copy_review`, `render_review`, `done` w logice stage bar.    |
| S-08  | `metrics.ts`                    | TTL 1h jest hardcoded, nie konfigurowalny przez settings.                                |
| S-09  | `analytics.ts`                  | Brak analizy — wymaga weryfikacji implementacji.                                          |
| S-10  | `briefId.astro` + `new.astro`  | Brak CSRF protection — wszystkie endpointy autentykują tylko przez `session` cookie.     |

---

## 🟢 Sugestie podniesienia jakości kodu

### Q-01 — Centralna walidacja i normalizacja `sourceType`

Zamiast rozpraszać walidację typów w 3 miejscach (`sources.ts`, `sh-source-loader.ts`, `briefs/index.ts`), wydzielić jedno źródło prawdy:

```ts
// src/lib/sh-source-types.ts
export const SOURCE_TYPES = ['article', 'pain_point', 'pain_cluster', 'content_gap', 'kb_entry', 'reddit_gap', 'yt_gap'] as const;
export type SourceType = typeof SOURCE_TYPES[number];
export const isValidSourceType = (t: string): t is SourceType => SOURCE_TYPES.includes(t as SourceType);
```

Importować i używać w każdym miejscu zamiast duplikować listy.

---

### Q-02 — Wydzielenie `auth()` do wspólnego helpera

Funkcja `auth(cookies)` jest kopiowana do każdego pliku API (9+ kopii). Narusza DRY.

```ts
// src/lib/sh-auth.ts
import type { AstroCookies } from 'astro';
export function requireAuth(cookies: AstroCookies): boolean {
  return !!cookies.get('session')?.value;
}
export const UNAUTHORIZED = new Response(
  JSON.stringify({ error: 'Unauthorized' }), 
  { status: 401, headers: { 'Content-Type': 'application/json' } }
);
```

---

### Q-03 — Stały `JSON_HEADERS` i helper `jsonResponse()`

Podobnie `JSON_HEADERS` jest duplikowany w każdym pliku:

```ts
// src/lib/sh-api-utils.ts
export const jsonOk = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const jsonError = (error: string, status = 500) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });
```

---

### Q-04 — Paginacja w `/api/social-hub/sources`

Aktualnie limit=100 per typ, bez informacji o całkowitej liczbie. Dodać:

```ts
// Zwracać
{ items: SourceRow[], total: number, offset: number, limit: number }
```

I zaktualizować frontend, żeby pokazywał "Showing 1-100 of 847" i obsługiwał następne strony.

---

### Q-05 — Explicit error boundaries w Astro frontmatter

W `[briefId].astro` brak try/catch przy ładowaniu danych `db.select()`. Jeśli baza nie odpowiada:

```ts
// PRZED
const copies = await db.select().from(shGeneratedCopy)...;

// PO
let copies: typeof shGeneratedCopy.$inferSelect[] = [];
try {
  copies = await db.select().from(shGeneratedCopy)...;
} catch (e) {
  console.error('[SH Brief] Failed to load copies:', e);
}
```

---

### Q-06 — Debounce `source-search` powinien anulować pending request

Aktualnie `debounce()` tylko opóźnia start fetcha. Jeśli poprzedni fetch jest w toku i nowy start się wywołuje, mogą przyjść odpowiedzi "out of order". Użyć `AbortController`:

```js
let abortController = null;

async function fetchSources() {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;
  
  const res = await fetch('/api/social-hub/sources?' + params, { signal });
  ...
}
```

---

### Q-07 — Stan wczytania źródeł — "auto-load on mount"

Aktualnie `fetchSources()` wywołuje się przy mount z defaultowym typem `article`. To:
1. Wysyła request zanim użytkownik wybrał typ — może być niechciane przy dużych bazach.
2. Jeśli typ zmieniony, stary request może dokończyć się po nowym (race condition).

Rozważyć usunięcie `fetchSources()` z `// Initial load` i pokazanie promptu "Choose a type to begin".

---

### Q-08 — Walidacja `outputFormat` na backendzie

`briefs/index.ts` nie waliduje `outputFormat` — wstawia do DB dowolną wartość:
```ts
const { sourceType, sourceId, suggestionPrompt, outputFormat, ... } = body;
// Brak sprawdzenia: outputFormat ∈ ['image', 'video', 'text']
```

**Fix:** Dodać walidację:
```ts
const VALID_FORMATS = ['image', 'video', 'text'] as const;
if (!VALID_FORMATS.includes(outputFormat)) {
  return jsonError('outputFormat must be image, video or text', 400);
}
```

---

### Q-09 — `sh-kb-matcher.ts` — dodanie PostgreSQL full-text search

```ts
// Zamiast string matching ILIKE:
import { sql } from 'drizzle-orm';

const tsQuery = keywords.join(' | ');
return db
  .select()
  .from(knowledgeEntries)
  .where(sql`to_tsvector('english', ${knowledgeEntries.title} || ' ' || ${knowledgeEntries.content}) @@ to_tsquery('english', ${tsQuery})`)
  .orderBy(desc(knowledgeEntries.importanceScore))
  .limit(limit);
```

---

### Q-10 — Dodanie `updatedAt` do `shContentBriefs`

Obiekty brief zmieniają status wielokrotnie (`draft → generating → copy_review → rendering...`) ale brak pola `updatedAt`. Utrudnia debugging i audyt.

```sql
-- W migracji
ALTER TABLE sh_content_briefs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
```

---

## Podsumowanie naprawionych błędów w tej sesji

| Bug | Plik | Status |
|-----|------|--------|
| BUG-01: type=articles → 400 | `new.astro` select values | ✅ Naprawiony |
| BUG-02: data.items vs bare array | `new.astro` fetchSources | ✅ Naprawiony |
| BUG-03: item.id vs item.sourceId | `new.astro` card dataset | ✅ Naprawiony |
| BUG-04: brak targetPlatforms w POST | `new.astro` submit payload | ✅ Naprawiony |
| BUG-05: brak DELETE briefs/[id] | `briefs/[id].ts` | ✅ Naprawiony |
| BUG-06: PUT /render nie istnieje | — | 📋 Do zrobienia (TASK-03) |
| BUG-07: brak copyId w render POST | — | 📋 Do zrobienia (TASK-04) |
| BUG-08–11: mniejsze bugi | — | 📋 Do zrobienia (TASK-05 – TASK-08) |

---

## 🤖 Lista Tasków dla Agentów Autonomicznych

> Format każdego tasku: precyzyjny kontekst + plik docelowy + warunek akceptacji.  
> Taski są niezależne o ile nie wskazano zależności (`depends_on`).  
> Priorytet: 🔴 krytyczny → 🟡 ważny → 🟢 jakościowy

---

### TASK-01 — Dodanie `PUT /api/social-hub/briefs/[id]/render` (Approve Media)

**Priorytet:** 🔴 Krytyczny  
**Plik docelowy:** `src/pages/api/social-hub/briefs/[id]/render.ts`  
**Zależności:** brak

**Kontekst:**  
`[briefId].astro` wywołuje `PUT /render` z `{ assetId, action: 'approve' }` w momencie kliknięcia "✅ Approve Media". Endpoint `render.ts` eksportuje tylko `POST` — metoda `PUT` nie istnieje → 405.

**Implementacja:**
```ts
// Dodać do render.ts
import { and } from 'drizzle-orm';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }
  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }
  let body: { assetId?: number; action?: string };
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }
  const { assetId, action } = body;
  if (action === 'approve' && assetId) {
    await db.update(shMediaAssets)
      .set({ status: 'completed' })  // lub 'approved' jeśli enum to dopuszcza
      .where(and(eq(shMediaAssets.id, assetId), eq(shMediaAssets.briefId, briefId)));
    await db.update(shContentBriefs)
      .set({ status: 'done' })
      .where(eq(shContentBriefs.id, briefId));
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
  }
  return new Response(JSON.stringify({ error: 'Unknown action or missing assetId' }), { status: 400, headers: JSON_HEADERS });
};
```

**Warunek akceptacji:**
- `PUT /api/social-hub/briefs/5/render` z `{ assetId: 3, action: 'approve' }` zwraca `200 { ok: true }`
- Status briefa w DB zmienia się na `done`
- Status assetu w DB zmienia się na `completed`
- Brak 405 w konsoli przeglądarki po kliknięciu "Approve Media"

---

### TASK-02 — Naprawa `data-status` na kartach copy + przekazanie `copyId` do render

**Priorytet:** 🔴 Krytyczny  
**Plik docelowy:** `src/pages/admin/social-hub/[briefId].astro`  
**Zależności:** brak (niezależny od TASK-01)

**Kontekst:**  
Dwa powiązane problemy w tym samym pliku:

1. **BUG-08:** Elementy `<div class="tab-panel" data-copy-id={copy.id}>` nie mają `data-status={copy.status}` → querySelector `[data-status="approved"]` nigdy nic nie znajdzie.

2. **BUG-07:** Przycisk "🎬 Render" (linia ~787) wysyła `{ format }` bez `copyId` → API zwraca 400 ("Missing required fields: copyId, format").

**Implementacja — krok 1:** W Astro template zmienić (linia ~177):
```astro
<!-- PRZED -->
<div class={`tab-panel ${idx === 0 ? 'active' : ''}`} id={`copy-${copy.id}`} data-copy-id={copy.id}>

<!-- PO -->
<div class={`tab-panel ${idx === 0 ? 'active' : ''}`} id={`copy-${copy.id}`} data-copy-id={copy.id} data-status={copy.status}>
```

**Implementacja — krok 2:** W `<script>` sekcji zmienić handler btn-render (~linia 779):
```js
document.getElementById('btn-render')?.addEventListener('click', async () => {
  const templateSelect = document.getElementById('render-template-select');
  const templateSlug = templateSelect?.value;
  if (!templateSlug) { alert('Please select a template first.'); return; }

  // Pobierz approved copyId z data-status
  const approvedPanel = document.querySelector('.tab-panel[data-status="approved"]');
  const approvedCopyId = approvedPanel ? parseInt(approvedPanel.dataset.copyId, 10) : null;
  if (!approvedCopyId) { alert('No approved copy variant. Approve a copy first.'); return; }

  const btn = document.getElementById('btn-render');
  btn.disabled = true;
  btn.textContent = '🎬 Rendering…';
  try {
    const res = await fetch(`/api/social-hub/briefs/${BRIEF_ID}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copyId: approvedCopyId, templateSlug, format: 'image' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    window.location.reload();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '🎬 Render';
    alert(`Render failed: ${e.message}`);
  }
});
```

**Warunek akceptacji:**
- Elementy `.tab-panel` mają atrybut `data-status` z wartością `draft`/`approved`/`rejected`
- Kliknięcie "Render" bez approved copy pokazuje alert, nie wywołuje API
- Kliknięcie "Render" z approved copy wysyła poprawny `copyId` + `templateSlug` → brak 400

---

### TASK-03 — Dynamiczne ładowanie szablonów w `[briefId].astro`

**Priorytet:** 🔴 Krytyczny  
**Plik docelowy:** `src/pages/admin/social-hub/[briefId].astro`  
**Zależności:** TASK-02 (render select musi mieć prawidłowe slug-i)

**Kontekst:**  
Select szablonów (linia ~278) ma hardcoded `value="square_1x1"`, `"portrait_9x16"` itp. — te wartości nie odpowiadają slotom `slug` w tabeli `shTemplates` (np. `retro-quote-card`, `minimal-dark`). Używane jako `templateSlug` w `render.ts` → template nie jest znajdowany → fallback do domyślnego.

**Implementacja:**  
W frontmatter Astro (`---`) dodać:
```ts
import { shTemplates } from '@/db/schema';
const activeTemplates = await db.select().from(shTemplates).where(eq(shTemplates.isActive, true)).orderBy(shTemplates.id);
```

W HTML zastąpić hardcoded select:
```astro
<!-- PRZED -->
<select id="render-template-select" class="select-input">
  <option value="">— select template —</option>
  <option value="square_1x1">Square 1:1</option>
  ...
</select>

<!-- PO -->
<select id="render-template-select" class="select-input">
  <option value="">— select template —</option>
  {activeTemplates.map(t => (
    <option value={t.slug}>{t.name} — {t.aspectRatio}</option>
  ))}
</select>
```

**Warunek akceptacji:**
- Select zawiera tylko szablony z tabeli `shTemplates` z `isActive = true`
- Wartości `option.value` = `t.slug` (np. `retro-quote-card`)
- Jeśli brak szablonów → wyświetla hint "No active templates"

---

### TASK-04 — Naprawa logiki statusu briefa przy reject copy

**Priorytet:** 🟡 Ważny  
**Plik docelowy:** `src/pages/api/social-hub/briefs/[id]/copy.ts`  
**Zależności:** brak

**Kontekst:**  
`copy.ts` ustawia `brief.status = 'rendering'` gdy copy jest `approved`, ale nie robi nic przy `rejected`. Jeśli zatwierdzono wariant A, brief = `rendering`. Następnie odrzucono A → brak approved copy, ale brief nadal `rendering`. Użytkownik nie może wygenerować nowej kopii (bo `canGenerate` = `brief.status === 'draft' || 'copy_review'`).

**Implementacja:** Po sekcji `if (body.status === 'approved')` w `copy.ts` dodać:
```ts
// Jeśli odrzucono — sprawdź czy jest nadal jakiś approved wariant
if (body.status === 'rejected') {
  const remainingApproved = await db
    .select({ id: shGeneratedCopy.id })
    .from(shGeneratedCopy)
    .where(and(
      eq(shGeneratedCopy.briefId, briefId),
      eq(shGeneratedCopy.status, 'approved'),
    ))
    .limit(1);

  if (remainingApproved.length === 0) {
    // Brak approved copy — cofnij brief do copy_review
    await db
      .update(shContentBriefs)
      .set({ status: 'copy_review' })
      .where(eq(shContentBriefs.id, briefId));
  }
}
```

**Warunek akceptacji:**
- Odrzucenie ostatniego approved wariantu → `brief.status` wraca do `copy_review`
- Odrzucenie jednego z wielu (inne nadal approved) → status briefa nie zmienia się
- `canGenerate` w UI staje się `true` po odrzuceniu ostatniego

---

### TASK-05 — Naprawa `data-meta` badge w kartach źródeł

**Priorytet:** 🟡 Ważny  
**Plik docelowy:** `src/pages/admin/social-hub/new.astro`  
**Zależności:** brak

**Kontekst:**  
`card.dataset.meta = item.meta || JSON.stringify(item.metadata ?? {})` — `item.meta` jest `undefined` (API zwraca `item.metadata` jako obiekt). Badge wyświetla surowy JSON: `{"status":"published","tags":["adhd",...]}`.

**Implementacja:** W `fetchSources()` przy tworzeniu kart zmienić:
```js
// PRZED
card.dataset.meta = item.meta || JSON.stringify(item.metadata ?? {});

// PO — wyciągnij czytelną wartość z metadata
const meta = item.metadata ?? {};
const metaBadge = meta.status ?? meta.category ?? meta.emotionalIntensity ?? meta.type ?? '';
card.dataset.meta = String(metaBadge);
```

I w template karty zmienić warunek renderowania badge na:
```js
${card.dataset.meta ? `<span class="source-card-badge">${escapeHtml(card.dataset.meta)}</span>` : ''}
```

**Warunek akceptacji:**
- Badge na kartach źródeł pokazuje np. `published`, `adhd`, `8` (intensity) zamiast raw JSON
- Brak badge gdy metadata jest pusty obiekt
- Badge nie wyświetla `[object Object]` ani długiego JSON-stringa

---

### TASK-06 — Naprawa `totalPosts` w `index.astro` (COUNT vs slice)

**Priorytet:** 🟡 Ważny  
**Plik docelowy:** `src/pages/admin/social-hub/index.astro`  
**Zależności:** brak

**Kontekst:**  
`totalPosts = briefs.length` przy `LIMIT 50` → zawsze max 50, nawet jeśli baza ma 200 briefów.

**Implementacja:** W frontmatter Astro:
```ts
// PRZED
briefs = await db.select().from(shContentBriefs).orderBy(desc(shContentBriefs.createdAt)).limit(50);
const totalPosts = briefs.length;

// PO
const [{ totalPosts }] = await db
  .select({ totalPosts: sql<number>`count(*)::int` })
  .from(shContentBriefs);
briefs = await db.select().from(shContentBriefs).orderBy(desc(shContentBriefs.createdAt)).limit(50);
// totalPosts teraz pochodzi z COUNT(*), nie z briefs.length
```

Zaktualizować też statystykę `inQueue` — usunąć `draft` ze zliczania:
```ts
// PRZED
const inQueue = statusCount('generating') + statusCount('rendering') + statusCount('draft');

// PO — draft to nie queue
const inQueue = statusCount('generating') + statusCount('rendering') + statusCount('scheduled');
```

**Warunek akceptacji:**
- Przy 150 briefach w bazie, stat "Total Posts" = 150 (nie 50)
- `inQueue` nie zlicza `draft`

---

### TASK-07 — Dodanie `AbortController` do `fetchSources` (race condition)

**Priorytet:** 🟢 Jakościowy  
**Plik docelowy:** `src/pages/admin/social-hub/new.astro`  
**Zależności:** brak

**Kontekst:**  
Szybkie zmiany typu w select lub wpisywanie w search mogą wywołać wiele równoległych requestów. Ostatni zakończony wygrywa niezależnie od kolejności → UI może pokazać wyniki dla poprzedniego zapytania.

**Implementacja:** W `<script>`:
```js
// DODAĆ NA POCZĄTKU bloku fetchSources
let fetchAbortController = null;

async function fetchSources() {
  // Anuluj poprzedni request jeśli w toku
  if (fetchAbortController) {
    fetchAbortController.abort();
  }
  fetchAbortController = new AbortController();
  const { signal } = fetchAbortController;

  // ... reszta funkcji bez zmian, dodać signal do fetch:
  const res = await fetch('/api/social-hub/sources?' + params.toString(), { signal });
  // ...
}
// W catch - ignorować AbortError:
} catch (err) {
  if (err.name === 'AbortError') return; // anulowane — ok
  sourceLoading.style.display = 'none';
  sourceEmpty.style.display = 'flex';
  sourceEmpty.querySelector('span:last-child').textContent = 'Error: ' + err.message;
}
```

**Warunek akceptacji:**
- Szybka zmiana 3 typów nie powoduje migotania wyników
- W Network tab widać że poprzednie requesty są anulowane (`(canceled)`)
- Brak "race condition" — zawsze widoczne wyniki ostatniego wyboru

---

### TASK-08 — Stworzenie `src/lib/sh-source-types.ts` — centralne źródło prawdy

**Priorytet:** 🟢 Jakościowy  
**Plik docelowy:** `src/lib/sh-source-types.ts` (nowy plik)  
**Zależności:** brak (ale refaktor następnie wymagany w: `sources.ts`, `sh-source-loader.ts`, `briefs/index.ts`)

**Kontekst:**  
Lista valid `sourceType` jest zdefiniowana w 3 miejscach niezależnie. Każda przyszła zmiana wymaga edycji 3 plików.

**Implementacja — nowy plik:**
```ts
// src/lib/sh-source-types.ts

export const SOURCE_TYPES = [
  'article',
  'pain_point',
  'pain_cluster',
  'content_gap',
  'kb_entry',
  'reddit_gap',
  'yt_gap',
] as const;

export type SourceType = typeof SOURCE_TYPES[number];

export const isValidSourceType = (t: string): t is SourceType =>
  (SOURCE_TYPES as readonly string[]).includes(t);

/** Normalizacja starych pluralnych wartości (przed BUG-01 fix) */
export const LEGACY_TYPE_MAP: Record<string, SourceType> = {
  articles:      'article',
  pain_points:   'pain_point',
  pain_clusters: 'pain_cluster',
  content_gaps:  'content_gap',
  kb_entries:    'kb_entry',
  reddit_gaps:   'reddit_gap',
  yt_gaps:       'yt_gap',
};

export const normalizeSourceType = (t: string): SourceType | null =>
  isValidSourceType(t) ? t : (LEGACY_TYPE_MAP[t] ?? null);
```

**Refaktor w `sources.ts`:**
```ts
import { SOURCE_TYPES, isValidSourceType } from '@/lib/sh-source-types';
// Usunąć lokalną definicję VALID_TYPES
// Zastąpić: !(VALID_TYPES as readonly string[]).includes(typeParam)
// Na:       !isValidSourceType(typeParam)
```

**Refaktor w `sh-source-loader.ts`:**
```ts
import { normalizeSourceType } from '@/lib/sh-source-types';
export async function loadSource(sourceType: string, sourceId: number) {
  const type = normalizeSourceType(sourceType);
  if (!type) return null;
  switch (type) { ... }
}
```

**Warunek akceptacji:**
- Plik `sh-source-types.ts` istnieje i eksportuje: `SOURCE_TYPES`, `SourceType`, `isValidSourceType`, `normalizeSourceType`
- `sources.ts` i `sh-source-loader.ts` importują z tego pliku (nie mają własnych list)
- `normalizeSourceType('articles')` zwraca `'article'`
- `normalizeSourceType('invalid')` zwraca `null`
- Wszystkie testy TypeScript przechodzą bez błędów

---

### TASK-09 — Wydzielenie `auth()` i `JSON_HEADERS` do `src/lib/sh-api-utils.ts`

**Priorytet:** 🟢 Jakościowy  
**Plik docelowy:** `src/lib/sh-api-utils.ts` (nowy plik) + refaktor 9 plików API  
**Zależności:** brak

**Kontekst:**  
`auth(cookies)` i `const JSON_HEADERS = { 'Content-Type': 'application/json' }` są skopiowane do każdego z 9+ plików API.

**Implementacja — nowy plik:**
```ts
// src/lib/sh-api-utils.ts
import type { AstroCookies } from 'astro';

export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function isAuthenticated(cookies: AstroCookies): boolean {
  return !!cookies.get('session')?.value;
}

export const jsonOk = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export const jsonError = (message: string, status = 500): Response =>
  new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });

export const jsonUnauthorized = (): Response =>
  jsonError('Unauthorized', 401);
```

**Pliki do refaktoru** (zastąpić lokalne kopie importem):
- `src/pages/api/social-hub/sources.ts`
- `src/pages/api/social-hub/briefs/index.ts`
- `src/pages/api/social-hub/briefs/[id].ts`
- `src/pages/api/social-hub/briefs/[id]/copy.ts`
- `src/pages/api/social-hub/briefs/[id]/render.ts`
- `src/pages/api/social-hub/briefs/[id]/generate-copy.ts`
- `src/pages/api/social-hub/briefs/[id]/publish.ts`
- `src/pages/api/social-hub/accounts/index.ts`
- `src/pages/api/social-hub/accounts/[id].ts`
- `src/pages/api/social-hub/templates.ts`
- `src/pages/api/social-hub/settings.ts`
- `src/pages/api/social-hub/queue.ts`

**Warunek akceptacji:**
- Plik `sh-api-utils.ts` istnieje z 5 eksportami
- Żaden plik API nie definiuje lokalnie `function auth(...)` ani `const JSON_HEADERS`
- Wszystkie pliki API importują z `@/lib/sh-api-utils`
- Brak regresji — wszystkie endpointy zwracają takie same odpowiedzi jak przed refaktorem

---

### TASK-10 — Dodanie `updatedAt` do `shContentBriefs`

**Priorytet:** 🟢 Jakościowy  
**Pliki docelowe:**
- `src/db/schema.ts` (dodanie kolumny do definicji)
- `migrations/` (nowa migracja SQL)
- `src/pages/api/social-hub/briefs/[id]/copy.ts` (aktualizacja przy każdym update statusu)

**Kontekst:**  
Brief przechodzi przez wiele statusów (`draft → generating → copy_review → rendering → done`) bez śladu timestamps zmian. Niemożliwe jest debugowanie "od kiedy brief utknął w statusie rendering".

**Implementacja — schema:**
```ts
// W definicji shContentBriefs w schema.ts dodać:
updatedAt: timestamp('updated_at').defaultNow().notNull(),
```

**Implementacja — migracja:**
```sql
-- migrations/0005_sh_briefs_updated_at.sql
ALTER TABLE sh_content_briefs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
```

**Implementacja — aktualizacja przy każdej zmianie statusu:**
```ts
// W każdym miejscu gdzie jest:
await db.update(shContentBriefs).set({ status: '...' }).where(...)
// Zmienić na:
await db.update(shContentBriefs).set({ status: '...', updatedAt: new Date() }).where(...)
```

Pliki do zaktualizowania: `copy.ts`, `render.ts`, `publish.ts`, `briefs/index.ts`.

**Warunek akceptacji:**
- Kolumna `updated_at` istnieje w tabeli `sh_content_briefs`
- Po każdej zmianie statusu briefa `updated_at` = `NOW()`
- `updatedAt` jest widoczny w odpowiedzi `GET /api/social-hub/briefs/[id]`
- Migracja jest idempotentna (`ADD COLUMN IF NOT EXISTS`)

---

### Tabela priorytetów tasków

| Task | Opis | Priorytet | Estimated LOC | Niezależny? |
|------|------|-----------|---------------|-------------|
| TASK-01 | PUT /render — approve media | 🔴 | ~35 | ✅ |
| TASK-02 | data-status + copyId w render | 🔴 | ~30 | ✅ |
| TASK-03 | Dynamiczne szablony w briefId.astro | 🔴 | ~15 | depends TASK-02 |
| TASK-04 | Logika reject copy → status briefa | 🟡 | ~20 | ✅ |
| TASK-05 | data-meta badge w kartach źródeł | 🟡 | ~10 | ✅ |
| TASK-06 | totalPosts COUNT + inQueue fix | 🟡 | ~10 | ✅ |
| TASK-07 | AbortController w fetchSources | 🟢 | ~15 | ✅ |
| TASK-08 | sh-source-types.ts — centralne typy | 🟢 | ~50 | ✅ |
| TASK-09 | sh-api-utils.ts — auth + json helpers | 🟢 | ~80 | ✅ |
| TASK-10 | updatedAt w shContentBriefs | 🟢 | ~25 | ✅ |
