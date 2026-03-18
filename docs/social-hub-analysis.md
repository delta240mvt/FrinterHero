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
| BUG-05: brak DELETE briefs/[id] | — | 📋 Zablokowany (wymaga implementacji) |
| BUG-06: PUT /render nie istnieje | — | 📋 Zablokowany (wymaga implementacji) |
| BUG-07: brak copyId w render POST | — | 📋 Zablokowany (wymaga implementacji) |
| BUG-08–11: mniejsze bugi | — | 📋 Opisane |
