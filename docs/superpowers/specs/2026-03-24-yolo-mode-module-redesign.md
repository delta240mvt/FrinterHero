# YOLO Mode — Admin Module Redesign Spec

## Goal

Rebuild the YOLO Mode pipeline controller as a first-class admin module, visually and structurally consistent with YouTube Intelligence and Brand Clarity. Add author notes support at the pain-point approval step so notes flow through to generated drafts.

## Architecture

Single-page module at `/admin/yolo/index.astro` using the standard admin layout pattern (sticky header + stats banner + sidebar/main grid). The existing separate `/admin/yolo/pain-points.astro` and `/admin/yolo/gaps.astro` pages are replaced by tabs within the main page. The API is extended to carry per-item `authorNotes` from pain-point approval through to content-gap creation and draft enqueue.

## Tech Stack

Astro SSR (`prerender = false`), vanilla JS for interactivity, existing CSS design tokens, internal API proxy pattern (`proxyInternalApiRequest`), Drizzle ORM on the API side.

---

## Section 1 — Page Layout & Structure

### Header
Standard `admin-header` pattern identical to YouTube Intelligence:
```
P·F  ›  Admin  ›  Yolo Mode
                             [Logout]
```

### Stats Banner
Four stat cards separated by dividers:
| Stat | Color | Source |
|------|-------|--------|
| Pain Points Pending | `#ef4444` | `GET /api/yolo/preview` → `ytPainPointsPending` |
| New Gaps | `var(--gold)` | `gapsNew` |
| In Progress | `var(--teal)` | count of `in_progress` gaps |
| Drafts Ready | `var(--text-primary)` | `draftsReady` |

### Two-Column Layout
```
sidebar (280px)  |  main content (1fr)
```

**Sidebar — Automation Settings**

Three collapsible stage cards:

*Stage 01 — Pain Points → Gaps*
- Toggle (enable/disable `ytPainPointsEnabled`)
- Limit field (1–100, default 10)
- Min Intensity field (1–10, default 5)
- `[Save]` `[▶ Run]` buttons
- Log area

*Stage 02 — Gaps → Drafts*
- Toggle (enable/disable `gapsEnabled`)
- Limit field (1–50)
- Model selector (claude-sonnet-4-6 / claude-opus-4-6 / claude-haiku-4-5)
- `[Save]` `[▶ Run]` buttons
- Log area

*Stage 03 — Auto-Publish*
- Toggle (enable/disable `autoPublishEnabled`)
- Limit field (1–50)
- `[Save]` `[▶ Run]` buttons
- Log area

Bottom of sidebar: `[▶ Run Full Pipeline]` button (gold, runs all enabled stages in sequence).

**Main Content — Tabs**

Tab bar with counts:
```
Pain Points (N)  |  Content Gaps (N)  |  Ready to Publish (N)
```

Active tab indicator: `var(--gold)` underline (YOLO's accent color).

---

## Section 2 — Pain Points Tab

### Layout
- Filter bar: Source dropdown (All / YouTube / Reddit), Min Intensity dropdown (1–10)
- Toolbar: `[Select all]` `[Deselect all]` `[Select hot 8+]` — spacer — `[✓ Approve selected]` (teal)
- Action log area (hidden until action)
- Card list

### Cards
Each card follows the existing `pp-card` pattern:
- Left border color: red (8+), gold (5–7), muted (<5)
- Checkbox, intensity badge, source badge, category, video title, frequency
- Title + truncated description
- Vocabulary quotes
- Suggested angle

**Author Notes (new):** When a card is checked, an author notes textarea slides open beneath the description:
```
[ Author notes (optional — will be attached to the content gap) ]
```
- `textarea` with placeholder
- Monospace font, 2 rows, full width
- Dismisses (clears + collapses) when unchecked

### Approve Action
Clicking `[✓ Approve selected]` collects `{ id, authorNotes }` per checked card and POSTs:
```json
POST /api/yolo/approve/pain-points
{
  "ytItems": [{ "id": 12, "authorNotes": "Focus on beginner angle" }, ...],
  "rdItems": [{ "id": 34, "authorNotes": "" }, ...]
}
```
Approved cards fade to 35% opacity. Log shows created gap IDs.

---

## Section 3 — Content Gaps Tab

### Layout
- Toolbar: `[Select all]` `[Deselect all]` `[Select high confidence 70+]` — spacer — model selector — `[▶ Queue drafts]` (gold)
- Action log
- Card list

### Cards
Existing gap card pattern (confidence left border, confidence badge, source models, title, description, suggested angle, related queries).

**Author Notes (new):** Same expand-on-check pattern as pain points tab. Notes sent per gap ID when queuing:
```json
POST /api/yolo/acknowledge/gaps
{
  "items": [{ "id": 55, "authorNotes": "Include personal story" }, ...],
  "model": "anthropic/claude-sonnet-4-6"
}
```

---

## Section 4 — Ready to Publish Tab

### Layout
- Toolbar: `[Select all]` `[Deselect all]` — spacer — `[▶ Publish selected]` (teal)
- Action log
- Article card list: title, slug, reading time, source gap title, creation date, checkbox
- Clicking article title opens `/admin/article/[id]` in new tab

### Publish Action
```json
POST /api/yolo/publish/selected
{ "ids": [101, 102, 103] }
```

---

## Section 5 — API Changes

### `GET /v1/admin/yolo/preview` — extended
Add `gapsInProgress: number` to response (count of content gaps with status `'in_progress'`). Powers the "In Progress" stats banner card.

### `POST /v1/admin/yolo/approve/pain-points`
**Before:** `{ ytIds: number[], rdIds: number[] }`
**After:** `{ ytItems: [{id, authorNotes?}][], rdItems: [{id, authorNotes?}][] }`

Backward-compatible: old `ytIds`/`rdIds` arrays still accepted (mapped to items with empty authorNotes).

When creating a content gap, set `contentGaps.authorNotes = item.authorNotes ?? ''`.

### `POST /v1/admin/yolo/acknowledge/gaps`
**Before:** `{ ids: number[], model?: string }`
**After:** `{ items: [{id, authorNotes?}][], model?: string }`

When enqueuing a draft job, use `item.authorNotes` if provided, else fall back to `gap.authorNotes` from the DB. This means notes set at pain-point approval time are preserved if the user doesn't override them at gap acknowledgement.

### `POST /v1/admin/yolo/publish/selected` (new endpoint)
Body: `{ ids: number[] }` — publishes specific article IDs (not just top N).
Mirrors the existing `run/publish` logic but operates on explicit IDs.

### `GET /v1/admin/yolo/drafts` (new endpoint)
Returns draft articles with `sourceGapId IS NOT NULL`, scoped to site. Used for the "Ready to Publish" tab.
Response: `{ items: Article[], total: number }`

---

## Section 6 — Admin Hub Update

Add YOLO Mode card to `/admin/index.astro` hub grid:
```
Icon: ⚡
Title: Yolo Mode
Badge: Pipeline (gold)
Description: Mass-approve pain points and gaps, auto-publish drafts.
Counts: N pain points pending · N gaps ready
Link: /admin/yolo
```

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/index.astro` | Full rewrite |
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/pain-points.astro` | Delete (merged into tab) |
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/gaps.astro` | Delete (merged into tab) |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/approve/pain-points.ts` | Keep (proxy unchanged) |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/acknowledge/gaps.ts` | Keep (proxy unchanged) |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/publish/selected.ts` | Create (new proxy) |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/drafts.ts` | Create (new proxy) |
| `apps/api/src/routes/yolo.ts` | Extend approve + acknowledge endpoints, add publish/selected + drafts |
| `apps/client-przemyslawfilipiak/src/pages/admin/index.astro` | Add YOLO hub card |

---

## Error Handling

- All API calls wrapped in try/catch; failures shown in log area with red styling
- Empty states for each tab (no pain points / no gaps / no drafts ready)
- Approve/Queue buttons disabled until ≥1 item selected
- Disabled state during in-flight requests (prevent double-submit)
