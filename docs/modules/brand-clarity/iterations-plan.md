# Plan: Pain Points Base + Iteracje LP

## Koncepcja

Zakładka **"4–5. Scrape & Review"** zostaje przemianowana na **"Pain Points Base"** — jest globalną bazą pain pointów projektu, zbieraną ze wszystkich skrapowanych filmów. To punkt startowy dla wielu wersji landing pages.

**Iteracja** to folder z intencją — pozwala wybrać z bazy top 30 pain pointów pasujących do danego kąta narracyjnego, a następnie przeprowadzić na nich clustering i generację LP. Jeden projekt → wiele iteracji → wiele landing pages.

```
Pain Points Base (globalna baza)
│   ├── pain point #1 (approved)
│   ├── pain point #2 (approved)
│   ├── pain point #3 (rejected)
│   └── ...N pain pointów
│
├── Iteracja A: "Przedsiębiorcy z problemem deep work"
│   ├── Intencja: [tekst]
│   ├── Selekcja AI: top 30 pain pointów z bazy
│   ├── Clustering (2-3 klastry z tych 30)
│   └── LP Variants (curiosity_hook / pain_mirror / outcome_promise)
│
├── Iteracja B: "Menedżerowie z problemem work-life balance"
│   ├── Intencja: [tekst]
│   ├── Selekcja AI: top 30 (inne niż w A)
│   ├── Clustering
│   └── LP Variants
│
└── Iteracja C: ...
```

---

## Zmiany w schemacie bazy danych

### 1. Nowa tabela `bcIterations`

```typescript
bcIterations = pgTable('bc_iterations', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),                          // nazwa folderu, np. "Iteracja 1"
  intention: text('intention'),                               // intencja wpisana przez usera
  status:    text('status').notNull().default('draft'),       // draft | selecting | selected | clustering | clustered | generating | done
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

### 2. Nowa tabela `bcIterationSelections`

Wyniki selekcji AI — które pain pointy weszły do iteracji i dlaczego.

```typescript
bcIterationSelections = pgTable('bc_iteration_selections', {
  id:           serial('id').primaryKey(),
  iterationId:  integer('iteration_id').notNull().references(() => bcIterations.id, { onDelete: 'cascade' }),
  painPointId:  integer('pain_point_id').notNull().references(() => bcExtractedPainPoints.id, { onDelete: 'cascade' }),
  rank:         integer('rank').notNull(),                    // 1–30, nadany przez AI
  selectionReason: text('selection_reason'),                  // krótkie uzasadnienie AI
  createdAt:    timestamp('created_at').notNull().defaultNow(),
})
```

### 3. Modyfikacja `bcPainClusters`

Dodać kolumnę `iterationId` (nullable — dla wstecznej kompatybilności):

```typescript
iterationId: integer('iteration_id').references(() => bcIterations.id, { onDelete: 'set null' })
```

Istniejące klastry bez `iterationId` = stary flow (legacy). Nowe klastry zawsze mają `iterationId`.

### 4. Modyfikacja `bcLandingPageVariants`

Analogicznie dodać `iterationId` (nullable):

```typescript
iterationId: integer('iteration_id').references(() => bcIterations.id, { onDelete: 'set null' })
```

---

## Nowe API endpoints

### Zarządzanie iteracjami

| Method | Endpoint | Opis |
|--------|----------|------|
| `GET` | `/api/brand-clarity/[projectId]/iterations` | Lista iteracji projektu |
| `POST` | `/api/brand-clarity/[projectId]/iterations` | Utwórz nową iterację (body: `{ name }`) |
| `PUT` | `/api/brand-clarity/[projectId]/iterations/[itId]` | Aktualizuj nazwę/intencję |
| `DELETE` | `/api/brand-clarity/[projectId]/iterations/[itId]` | Usuń iterację (kaskada: selekcje, klastry, warianty) |

### Selekcja AI

| Method | Endpoint | Opis |
|--------|----------|------|
| `POST` | `/api/brand-clarity/[projectId]/iterations/[itId]/select` | Uruchom selekcję AI top 30 |
| `GET` | `/api/brand-clarity/[projectId]/iterations/[itId]/selections` | Pobierz wyniki selekcji |

### Clustering i generacja (kontekst iteracji)

Istniejące endpointy `cluster-pain-points` i `generate-variants` otrzymują opcjonalny parametr `iterationId` w body — filtrują input i tagują output.

---

## Nowy skrypt: `bc-pain-selector.ts`

**Lokalizacja:** `/scripts/bc-pain-selector.ts`

**Wejście (env):**
- `BC_PROJECT_ID`
- `BC_ITERATION_ID`

**Algorytm:**

```
1. Wczytaj intencję iteracji z bcIterations
2. Wczytaj WSZYSTKIE approved pain pointy projektu z bcExtractedPainPoints
   (brak limitu — cała baza, nie tylko te z jednego skrapa)
3. Wywołaj Claude Sonnet z promptem selekcji:

   PROMPT:
   """
   Jesteś ekspertem od konwersji landing pages.

   Intencja iteracji: [intention]

   Poniżej lista [N] zatwierdzonych pain pointów z bazy projektu.
   Dla każdego masz: tytuł, opis, intensywność emocjonalną (1-10),
   kategorię, customerLanguage, desiredOutcome, vocData.

   Wybierz TOP 30 pain pointów, które najlepiej pasują do intencji iteracji.
   Kryteria selekcji:
   - Bezpośrednia relevancja do intencji
   - Wysoka intensywność emocjonalna (waga 40%)
   - Specyficzny język klienta (waga 30%)
   - Zróżnicowanie kategorii (unikaj duplikowania tego samego problemu)

   Zwróć JSON:
   {
     "selected": [
       {
         "painPointId": 42,
         "rank": 1,
         "selectionReason": "Najsilniej rezonuje z intencją bo..."
       },
       ...
     ]
   }
   """

4. Zapisz wyniki do bcIterationSelections
5. Zaktualizuj status iteracji na 'selected'
6. Output: SELECTED:30
```

**Model:** Claude Sonnet 4.6 (ten sam co clustering — potrzebne rozumowanie)

**Uwaga dot. rozmiaru kontekstu:** Przy dużej bazie (100+ pain pointów) wysyłamy skrócony format każdego PP (id, title, intensity, category, customerLanguage, desiredOutcome) — bez pełnych opisów. Jeśli baza < 50 PP, wysyłamy pełny format.

---

## Zmiany w istniejących skryptach

### `bc-pain-clusterer.ts`

Dodać obsługę `BC_ITERATION_ID`:

```typescript
// Jeśli iterationId podany:
const painPoints = await db
  .select({ pp: bcExtractedPainPoints })
  .from(bcIterationSelections)
  .innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id))
  .where(eq(bcIterationSelections.iterationId, iterationId))
  .orderBy(asc(bcIterationSelections.rank))

// Zapisz klastry z iterationId
await db.insert(bcPainClusters).values({ ...cluster, iterationId })
```

### `bc-lp-generator.ts`

Analogicznie — pobierz klastry danej iteracji (`where iterationId = X`) i taguj wygenerowane warianty.

---

## Zmiany w UI

### Struktura nawigacji

```
[Tab: Pain Points Base] → [Lista Iteracji]
                                │
                         [Iteracja: folder]
                                │
                         ┌──────┴──────┐
                         │  Intencja   │
                         │  [textarea] │
                         │  [Wybierz top 30 →] │
                         └──────┬──────┘
                                │
                         Selekcja AI (lista 30 PP z rankingiem)
                                │
                         [Klastruj te 30 →]
                                │
                         Klastry (2-3)
                                │
                         [Generuj LP →]
                                │
                         Warianty LP

---

## Dalsze kroki — Generowanie Mediów (VoC Clips)

Następnym krokiem po wygenerowaniu wariantów LP jest stworzenie materiałów wideo ("Voice of Customer Clips") na podstawie wybranych Pain Pointów danej iteracji.

Szczegółowy plan techniczny i finansowy (wybór **WaveSpeed AI**) znajduje się w osobnym dokumencie:
👉 [**Video Generation Plan (VoC Clips)**](./video-generation-plan.md)

---

### Widok "Pain Points Base" (obecna strona scrape.astro)

**Zmiany:**
1. Zmienić nagłówek sekcji z "Pain Points" → "Pain Points Base"
2. Dodać sekcję "Iteracje" nad listą pain pointów — siatkę folderów
3. Przyciski "Cluster Pain Points" i "Generate LPs →" **przenieść do widoku iteracji** (usunąć z głównego widoku)
4. Zachować widok bazy pain pointów (scraping + approve/reject) bez zmian

### Nowa strona `iteration.astro`

**Lokalizacja:** `/src/pages/admin/brand-clarity/[id]/iterations/[itId].astro`

**Sekcje (od góry):**

1. **Header** — breadcrumb: `Pain Points Base > Iteracja: [nazwa]` + edytowalny tytuł
2. **Intencja** — textarea z placeholderem ("Opisz cel tej iteracji: dla kogo, jaki ból chcesz zaadresować...")
3. **Selekcja** — stan selekcji AI:
   - Przed selekcją: przycisk "Wybierz top 30 z bazy" (disabled jeśli brak intencji)
   - W trakcie: spinner + log SSE (jak w scrape console)
   - Po selekcji: lista 30 kart PP (skrócona wersja BcPainPointCard) z rankingiem i uzasadnieniem AI
4. **Klastrowanie** — jak obecny widok klastrów, tylko na tych 30 PP
5. **Generacja LP** → link do variants.astro (z kontekstem iterationId)

---

## Kolejność wdrożenia (tickety)

### Faza 1 — Baza danych (no UI)
- [ ] Migracja: tabele `bcIterations`, `bcIterationSelections`
- [ ] Migracja: kolumny `iterationId` w `bcPainClusters`, `bcLandingPageVariants`
- [ ] Aktualizacja `schema.ts`

### Faza 2 — Backend API
- [ ] CRUD endpoints iteracji (GET/POST/PUT/DELETE)
- [ ] Skrypt `bc-pain-selector.ts` (selekcja AI top 30)
- [ ] Endpoint `/select` + SSE stream dla selekcji
- [ ] Aktualizacja `bc-pain-clusterer.ts` o obsługę `iterationId`
- [ ] Aktualizacja `bc-lp-generator.ts` o obsługę `iterationId`

### Faza 3 — UI
- [ ] Zmiana nazwy sekcji na "Pain Points Base" w `scrape.astro`
- [ ] Komponent siatki folderów iteracji (inline na `scrape.astro`)
- [ ] Nowa strona `iteration.astro` z pełnym flow
- [ ] Usunięcie przycisków Cluster/GenerateLPs z `scrape.astro` (opcjonalnie — można zostawić legacy)

---

## Decyzje projektowe

**Q: Czy user może ręcznie edytować selekcję 30 PP?**
A: Tak — w widoku iteracji można odhaczyć PP wybrany przez AI lub dodać pominięty (modal z listą bazy).

**Q: Co z istniejącymi klastrami i wariantami bez iterationId?**
A: Legacy — nadal dostępne w widoku projektu. Nowe klastry/warianty zawsze mają iterationId.

**Q: Limit iteracji?**
A: Brak limitu w MVP.

**Q: Czy selekcja AI liczy tylko approved PP?**
A: Tak — tylko status='approved'. Pending i rejected są ignorowane.

**Q: Czy ta sama PP może być w wielu iteracjach?**
A: Tak — baza jest współdzielona, każda iteracja to inny "lens".
