# Design: YOLO Pain Points — Shuffle Categories Button

**Date:** 2026-03-24
**Status:** Approved

## Problem

The Pain Points tab in YOLO mode lets users manually select pain points to approve. The existing selection helpers (All, None, Hot 8+) all select by intensity — meaning the top picks always come from the same dominant category (e.g. "focus"). This results in content gap batches with no category diversity.

## Solution

Add a **Shuffle** button to the Pain Points tab toolbar. On click it:

1. Deselects all currently selected pain points.
2. Groups all loaded pain point cards by their `category` value.
3. Picks 1 random card from each group.
4. Marks those cards as selected (checking their checkbox and updating the counter).

Items with no category are grouped under `other` and also receive 1 slot.

## Scope

- **Client-side only** — works on the up-to-200 items already loaded in the page. No new API endpoint.
- **Affected client:** `client-przemyslawfilipiak` only — `client-frinter` and `client-focusequalsfreedom` use a simplified YOLO page without a Pain Points tab or item selection UI.

## Changes

### 1. `data-category` attribute on item cards

Add `data-category` to the existing attribute list on `.item-card` — do not remove existing attributes:

```html
<div class="item-card item-card--clickable border-${intensityClass(item.emotionalIntensity)}"
  data-id={item.id}
  data-source={item.source}
  data-intensity={item.emotionalIntensity}
  data-category={item.category ?? 'other'}
  onclick="ppCardClick(event, this)">
```

### 2. Shuffle button in toolbar

```html
<button class="btn-sel" onclick="ppShuffle()">Shuffle</button>
```

Placed after the existing `Hot 8+` button.

### 3. `ppShuffle()` function

Selector is scoped to `#tab-pain-points` to avoid picking cards from other tabs (Gaps, Publish) which share the `.item-card` class but have no `.pp-checkbox`.

```js
function ppShuffle() {
  ppDeselectAll();
  const cards = document.querySelectorAll('#tab-pain-points .item-card');
  const byCategory = {};
  cards.forEach(card => {
    const cat = card.dataset.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(card);
  });
  Object.values(byCategory).forEach(group => {
    const pick = group[Math.floor(Math.random() * group.length)];
    const cb = pick.querySelector('.pp-checkbox');
    if (cb && !cb.checked) { cb.checked = true; ppOnCheck(cb); }
  });
}
```

## Out of Scope

- Server-side shuffle endpoint
- Category filter chips / UI filter bar
- Per-category count display after shuffle
