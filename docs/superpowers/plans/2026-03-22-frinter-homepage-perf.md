# Homepage Performance Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all remaining render-blocking requests, fix forced reflow, and remove dead code from `apps/client-frinter/src/pages/index.astro` to maximize Lighthouse Performance score.

**Architecture:** The entire page lives in a single self-contained `index.astro` file (3570 lines). Astro extracts `<style is:global>` into an external CSS file at build time — this causes render-blocking. We bypass extraction by moving CSS into a frontmatter constant injected via `<style set:html={css}>`. The forced reflow comes from an eagerly-called scroll handler that reads `window.scrollY` on load (always 0, pointless). Non-critical JS (battle animation, canvas) is deferred past first paint.

**Tech Stack:** Astro 3+, SSR (`output: server`), `index.astro` with `prerender = true`, inline `<style is:global>`, `<script is:inline>`.

---

## Context / Problem Map

| Issue | Root Cause | Fix |
|---|---|---|
| `index.D2gwWeap.css` (8.6KB, render-blocking) | Astro extracts `<style is:global>` into external file | Move CSS to frontmatter const, inject via `<style set:html={css}>` |
| `_id_.CYEvVGiR.css` (4.6KB, render-blocking) | Astro/Tailwind shared chunk included on all prerendered pages | Investigate after CSS inlining; may auto-resolve |
| Forced reflow at `frinter.app:452:78` (104ms) | `onScroll()` called immediately on load — reads `window.scrollY` (layout flush) then writes classList | Remove the eager `onScroll()` call (scrollY is always 0 on load) |
| TBT — battle system JS runs synchronously on load | `initHeroBattle()` and `initPortalCycle()` block main thread during parse | Defer to `requestIdleCallback` (with `setTimeout` fallback) |
| Dead CSS | Battle/canvas CSS is ~800 lines; `<style>` blocks may have orphan rules | Audit after inlining — remove CSS for elements not in HTML |

---

## File Map

| File | Change |
|---|---|
| `apps/client-frinter/src/pages/index.astro` | All changes — CSS inlining, reflow fix, JS deferral, dead code removal |

No new files. No new dependencies.

---

## Task 1 — Fix forced reflow (2 min)

**Files:** Modify `apps/client-frinter/src/pages/index.astro`

The scroll handler reads `window.scrollY` immediately on page load. `scrollY` is always `0` at load — the call does nothing except force a layout flush (104ms penalty).

- [ ] **Step 1: Find the eager `onScroll()` call**

Search for this block (near end of `<script is:inline>`):
```js
const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 10);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll(); // ← this is the reflow
```

- [ ] **Step 2: Remove the eager call**

Change to:
```js
const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 10);
window.addEventListener('scroll', onScroll, { passive: true });
// removed: onScroll() — scrollY is always 0 on load, not needed
```

- [ ] **Step 3: Commit**
```bash
git add apps/client-frinter/src/pages/index.astro
git commit -m "perf(frinter): remove eager onScroll() call — eliminates 104ms forced reflow"
```

---

## Task 2 — Defer non-critical JS past first paint (5 min)

**Files:** Modify `apps/client-frinter/src/pages/index.astro`

`initHeroBattle()` and `initPortalCycle()` run synchronously during parse. They build pixel-art DOM trees (hundreds of elements), start canvas `requestAnimationFrame` loops, and set up `setInterval` timers — all before LCP. Deferring these to idle time removes main-thread blocking during initial render.

The retro pixel canvas init (the `[data-retro-pixel]` loop) also runs synchronously and creates canvas contexts.

- [ ] **Step 1: Find the init block at the bottom of `<script is:inline>`**

It looks like this (roughly lines 3520–3566 in source):
```js
document.querySelectorAll('[data-retro-pixel]').forEach(canvas => { ... });
// ... mobile menu setup ...
const siteHeader = ...
// ...
initHeroBattle();
const portalCanvas = ...
if (portalCanvas) { ... initPortalCycle(...) }
```

- [ ] **Step 2: Restructure the bottom of `<script is:inline>`**

Keep mobile menu and header scroll listener synchronous. Move the `[data-retro-pixel]` population, `initHeroBattle()`, and `initPortalCycle()` into a deferred callback. `retroInstances` is declared synchronously so the deferred callback can push into it.

**Important:** Task 1 removed `onScroll()` eager call — do NOT re-add it here. The scroll handler below is the corrected form from Task 1.

Replace the bottom init block with:

```js
// Keep these synchronous — needed immediately for UX
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileMenuPanel = document.getElementById('mobile-menu-panel');
const mobileOpenIcon = document.getElementById('mobile-menu-open-icon');
const mobileCloseIcon = document.getElementById('mobile-menu-close-icon');

function setMobileMenu(open) {
  if (!mobileMenuToggle || !mobileMenuPanel || !mobileOpenIcon || !mobileCloseIcon) return;
  mobileMenuPanel.classList.toggle('open', open);
  mobileMenuToggle.setAttribute('aria-expanded', String(open));
  mobileOpenIcon.style.display = open ? 'none' : 'block';
  mobileCloseIcon.style.display = open ? 'block' : 'none';
}
if (mobileMenuToggle && mobileMenuPanel) {
  mobileMenuToggle.addEventListener('click', () => {
    const isOpen = mobileMenuPanel.classList.contains('open');
    setMobileMenu(!isOpen);
  });
  mobileMenuPanel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMobileMenu(false));
  });
}

const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  const onScroll = () => siteHeader.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  // NOTE: no eager onScroll() call — scrollY is 0 on load, was causing 104ms forced reflow
}

// Defer all canvas/battle animation inits past first paint
const retroInstances = [];
const initAnimations = () => {
  document.querySelectorAll('[data-retro-pixel]').forEach((canvas) => {
    const instance = createRetroPixelAnimation(canvas);
    if (instance) retroInstances.push(instance);
  });

  initHeroBattle();

  const portalCanvas = document.querySelector('.portal-canvas[data-retro-pixel]');
  if (portalCanvas) {
    const portalInstance = retroInstances.find((i) => i.canvas === portalCanvas);
    if (portalInstance) initPortalCycle(portalInstance);
  }
};

if ('requestIdleCallback' in window) {
  requestIdleCallback(initAnimations, { timeout: 2000 });
} else {
  setTimeout(initAnimations, 200);
}
```

**Important:** Remove the original synchronous `retroInstances` declaration and `forEach` loop from before this block — they are now both inside `initAnimations`. The `retroInstances` array is declared just before `initAnimations` so the deferred callback can push into it.

- [ ] **Step 3: Commit**
```bash
git add apps/client-frinter/src/pages/index.astro
git commit -m "perf(frinter): defer battle/canvas animation init to requestIdleCallback"
```

---

## Task 3 — Inline CSS to eliminate render-blocking external file (15 min)

**Files:** Modify `apps/client-frinter/src/pages/index.astro`

Astro extracts `<style is:global>` into `/_astro/index.xxx.css`. To bypass extraction, we move ALL CSS into a frontmatter JS template string and inject it via `<style set:html={css}>`. Astro does not process or extract CSS from `set:html` — it's treated as raw HTML, inlined directly in the response.

This eliminates one render-blocking HTTP request (~480ms).

The CSS block currently spans from the `<style is:global>` opening tag to its closing `</style>` — approximately 2470 lines. After Tasks 1 and 2 the line numbers will shift; use search-and-replace, not line numbers.

- [ ] **Step 1: Extract CSS content**

In the Astro frontmatter (at the top of the file, between `---` delimiters), after `export const prerender = true;`, add a variable that holds ALL the CSS. The CSS content is everything currently between `<style is:global>` and `</style>`.

```astro
---
export const prerender = true;

const APP_URL = import.meta.env.PUBLIC_APP_URL || 'https://web.frinter.app';
const year = new Date().getFullYear();

// ... existing content/faq/ld variables ...

const pageCss = `
  @font-face { ... }
  /* ... ALL CSS currently in <style is:global> ... */
`;
---
```

**Important:** The CSS contains backtick characters (`\``) in some places (e.g., CSS content properties or none). Escape any backticks inside the string with `\`` or use a different delimiter approach. Check for backticks in the CSS before extracting.

- [ ] **Step 2: Check for backticks inside the CSS block only**

The CSS block spans lines 261–2731 (before our edits; shift by ~20 lines after Tasks 1–2). Backticks in the HTML template section (lines 2732+) are from Astro expressions like `` href={`${APP_URL}/login`} `` — those are NOT in the CSS string and do not need escaping.

Run this check scoped to the CSS block:
```bash
awk 'NR>=261 && NR<=2760' apps/client-frinter/src/pages/index.astro | grep -n '`'
```

If any backticks found, escape them as `` \` `` in the `pageCss` template string. If no results, the string is safe to use as-is.

- [ ] **Step 3: Replace `<style is:global>` with inline injection**

Remove the entire `<style is:global>...</style>` block and replace with:
```astro
<style set:html={pageCss}></style>
```

This goes in the same position in `<head>` where the style block was.

- [ ] **Step 4: Build and verify**

```bash
cd apps/client-frinter && npx astro build 2>&1 | tail -20
```

Expected: build succeeds. Check `dist/client/index.html` — it should contain `<style>` inline with the CSS, NOT a `<link rel="stylesheet">` pointing to `/_astro/index.xxx.css`.

```bash
grep -c '<link rel="stylesheet"' apps/client-frinter/dist/client/index.html
```
Expected: `0` (no external stylesheet links, or only the `_id_` one if it persists).

- [ ] **Step 5: Handle `_id_.CYEvVGiR.css`**

This file will **likely persist** after CSS inlining — it comes from the Tailwind integration, which emits a CSS chunk for prerendered pages regardless of `<style is:global>` removal.

Check its contents after rebuild:
```bash
cat apps/client-frinter/dist/client/_astro/_id_.*.css | head -80
```

It will contain Tailwind base/reset styles. Since `pageCss` already has a full CSS reset (`*, *::before, *::after { box-sizing: border-box }` etc.), most of it is redundant.

**Primary fix — disable Tailwind preflight globally.**

`pageCss` already has a full CSS reset. The `_id_` chunk is Tailwind's `preflight` (base reset) CSS. Disabling it eliminates the chunk entirely without any async loading complexity.

In `apps/client-frinter/tailwind.config.mjs`, add `corePlugins.preflight: false`:

```js
// apps/client-frinter/tailwind.config.mjs  (read file first, add to existing export)
export default {
  // ... existing config ...
  corePlugins: {
    preflight: false,
  },
};
```

Then rebuild and confirm the `_id_` chunk is gone from `dist/client/index.html`:
```bash
grep '_id_' apps/client-frinter/dist/client/index.html
# Expected: no output
```

⚠️ **Admin regression check**: `preflight: false` affects ALL pages in this app including admin. After the change, open the admin login page and check it looks correct. Admin pages use `Base.astro` → `global.css` which has `@tailwind base` — if admin has its own reset via Tailwind base, disabling preflight here means it gets no CSS reset.

If admin pages break visually, revert `preflight: false` and instead accept the `_id_` chunk remaining as a render-blocking CSS (low impact ~160ms) — it is the lowest-priority item on the list and acceptable if admin regressions occur.

- [ ] **Step 6: Commit**
```bash
git add apps/client-frinter/src/pages/index.astro
git commit -m "perf(frinter): inline CSS via set:html to eliminate render-blocking external stylesheet"
```

---

## Task 4 — Remove dead CSS (10 min)

**Files:** Modify `apps/client-frinter/src/pages/index.astro`

The CSS block has ~2470 lines. Some of it may be dead (for removed sections). Common dead code candidates:

1. **Old hero styles**: Classes from previous hero iterations (check for classes defined in CSS that don't appear anywhere in the HTML)
2. **Old problem/solution section classes**: If the page was refactored from an older design
3. **Duplicate media queries**: Multiple `@media` blocks that can be consolidated

- [ ] **Step 1: Audit specific known candidate CSS families**

Manual inspection is most reliable for this file. For each class family below, search the HTML section (after the `</style>` tag) to confirm it has live HTML elements:

```bash
# Check if a class appears in the HTML section (after line 2731)
awk 'NR>2731' apps/client-frinter/src/pages/index.astro | grep -c 'hero-battle'
awk 'NR>2731' apps/client-frinter/src/pages/index.astro | grep -c 'hp-bar'
awk 'NR>2731' apps/client-frinter/src/pages/index.astro | grep -c 'portal-canvas'
awk 'NR>2731' apps/client-frinter/src/pages/index.astro | grep -c 'problem-section[^-]'
```

**Classes to check:**
- `.hero-battle`, `.battle-inner`, `.battle-side`, `.battle-row`, `.battle-label`, `.battle-center`, `.battle-vs`, `.battle-sword`, `.battle-winner`, `.battle-crown`, `.hp-bar`, `.hp-unit` — these are populated by JS into the HTML; check that the container IDs (`#battle-losers`, `#battle-winner`, `#hero-battle-stars`) exist in the HTML
- `.portal-canvas`, `.portal-wrap` — check HTML for `portal-canvas` class
- `.problem-section` (old name, without `-new`) vs `.problem-section-new` — if old one has no HTML, remove its CSS block

- [ ] **Step 2: Remove confirmed dead CSS blocks**

For each confirmed dead CSS section, remove it entirely from `pageCss`.

- [ ] **Step 3: Verify page renders correctly**

Open the dev server and visually check:
```bash
cd apps/client-frinter && npx astro dev
```
Check homepage visually — all sections should look correct.

- [ ] **Step 4: Commit**
```bash
git add apps/client-frinter/src/pages/index.astro
git commit -m "perf(frinter): remove dead CSS classes from homepage"
```

---

## Task 5 — Push to branch and main (2 min)

- [ ] **Step 1: Push current branch**
```bash
git push origin base190326-clients
```

- [ ] **Step 2: Merge to main and push**
```bash
# Verify no extra commits landed on main since last merge
git log --oneline main..base190326-clients

git checkout main
git merge base190326-clients --ff-only
git push origin main
git checkout base190326-clients
```

If `--ff-only` fails (another commit on main), use `git merge base190326-clients` (merge commit) instead.

---

## Expected Lighthouse Improvements

| Metric | Before | Expected After |
|---|---|---|
| FCP | ~3.0s | ~1.5–2.0s (no render-blocking CSS) |
| LCP | ~3.5s | ~2.0–2.5s |
| TBT | 0ms | 0ms (already 0, maintained) |
| Performance Score | 84 | 90–95 |

## Risks

- **FOUC risk for `_id_` CSS async load**: If `_id_` CSS contains above-fold styles, making it async could cause flash. Check contents before deciding async vs inline vs remove.
- **backtick escaping**: Template literal for CSS string must have all backticks escaped. Missing one will break the Astro build with a cryptic error.
- **Battle system HTML**: The `initHeroBattle()` populates `#battle-losers` and `#battle-winner` containers. Deferring to idle means these will be empty on initial render. This is acceptable (enhancement, not critical content).
