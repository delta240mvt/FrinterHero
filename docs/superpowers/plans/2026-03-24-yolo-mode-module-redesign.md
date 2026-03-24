# YOLO Mode Admin Module Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild YOLO Mode as a proper admin module (header + stats + sidebar/tabs) matching YouTube Intelligence, with author notes flowing from pain-point approval through to draft generation.

**Architecture:** Single-page module at `/admin/yolo/index.astro` uses the standard `admin-header` + `stats-banner` + two-column (sidebar settings + tabbed main content) layout. Author notes are collected per-card on check, sent with approve/acknowledge API calls, stored in `contentGaps.authorNotes`, and passed to `enqueueDraftJob`. Separate pain-points and gaps sub-pages are deleted. Two new API endpoints (`/v1/admin/yolo/drafts`, `/v1/admin/yolo/publish/selected`) power the "Ready to Publish" tab.

**Tech Stack:** Astro SSR, vanilla JS, existing CSS design tokens (`--teal`, `--gold`, `--violet`, `--border`, `--bg-*`, `--font-mono`), Node.js API with Drizzle ORM, `proxyInternalApiRequest` proxy pattern.

---

## File Map

| File | Action |
|------|--------|
| `apps/api/src/routes/yolo.ts` | Modify — extend 3 existing endpoints + add 2 new |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/drafts.ts` | Create — proxy for GET /v1/admin/yolo/drafts |
| `apps/client-przemyslawfilipiak/src/pages/api/yolo/publish/selected.ts` | Create — proxy for POST /v1/admin/yolo/publish/selected |
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/index.astro` | Full rewrite |
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/pain-points.astro` | Delete |
| `apps/client-przemyslawfilipiak/src/pages/admin/yolo/gaps.astro` | Delete |
| `apps/client-przemyslawfilipiak/src/pages/admin/index.astro` | Modify — add YOLO hub card |

---

## Task 1: Extend API — preview, approve, acknowledge

**Files:**
- Modify: `apps/api/src/routes/yolo.ts`

- [ ] **Step 1: Add `gapsInProgress` to preview endpoint**

In `GET /v1/admin/yolo/preview`, add a fourth parallel query counting `contentGaps` with `status = 'in_progress'`:

```typescript
// In the Promise.all inside GET /v1/admin/yolo/preview:
const [ytPending, gapsNew, draftsReady, gapsInProgress] = await Promise.all([
  db.select({ total: sql<number>`count(*)::int` })
    .from(ytExtractedGaps)
    .where(and(ytGapScope(site.id), eq(ytExtractedGaps.status, 'pending'), gte(ytExtractedGaps.emotionalIntensity, settings.ytPainPointsMinIntensity))),
  db.select({ total: sql<number>`count(*)::int` })
    .from(contentGaps)
    .where(and(gapScope(site.id), eq(contentGaps.status, 'new'))),
  db.select({ total: sql<number>`count(*)::int` })
    .from(articles)
    .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId))),
  db.select({ total: sql<number>`count(*)::int` })
    .from(contentGaps)
    .where(and(gapScope(site.id), eq(contentGaps.status, 'in_progress'))),
]);
json(res, 200, {
  ytPainPointsPending: ytPending[0]?.total ?? 0,
  gapsNew: gapsNew[0]?.total ?? 0,
  draftsReady: draftsReady[0]?.total ?? 0,
  gapsInProgress: gapsInProgress[0]?.total ?? 0,
  settings,
});
```

- [ ] **Step 2: Update `approve/pain-points` to accept per-item authorNotes**

Replace the existing `POST /v1/admin/yolo/approve/pain-points` handler body. Accept both old `ytIds`/`rdIds` arrays (backward compat) AND new `ytItems`/`rdItems` objects. Store `authorNotes` in the content gap:

```typescript
if (method === 'POST' && pathname === '/v1/admin/yolo/approve/pain-points') {
  const body = await readJsonBody(req);

  // Normalize to [{id, authorNotes}] format
  const ytItems: { id: number; authorNotes: string }[] = Array.isArray(body.ytItems)
    ? body.ytItems.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.ytIds)
    ? body.ytIds.map((id: any) => ({ id: Number(id), authorNotes: '' }))
    : [];

  const rdItems: { id: number; authorNotes: string }[] = Array.isArray(body.rdItems)
    ? body.rdItems.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.rdIds)
    ? body.rdIds.map((id: any) => ({ id: Number(id), authorNotes: '' }))
    : [];

  if (ytItems.length === 0 && rdItems.length === 0) {
    json(res, 400, { error: 'Provide ytItems or rdItems arrays' });
    return true;
  }

  const ytScope = or(eq(ytExtractedGaps.siteId, site.id), isNull(ytExtractedGaps.siteId));
  const rdScope = or(eq(redditExtractedGaps.siteId, site.id), isNull(redditExtractedGaps.siteId));

  let created = 0;
  const createdGapIds: number[] = [];

  if (ytItems.length > 0) {
    const ids = ytItems.map((x) => x.id).filter(Boolean);
    const pending = await db.select().from(ytExtractedGaps)
      .where(and(ytScope, eq(ytExtractedGaps.status, 'pending'), inArray(ytExtractedGaps.id, ids)));

    for (const gap of pending) {
      const item = ytItems.find((x) => x.id === gap.id)!;
      const sourceComments = await ytSourceComments((gap.sourceCommentIds || []).slice(0, 5));
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        gap.sourceVideoTitle ? `\n\nSource Context\n- Video: "${gap.sourceVideoTitle}"\n- Frequency: ${gap.frequency} total mentions analyzed` : '',
        sourceComments.length > 0 ? `\n\nRepresentative Voices\n${sourceComments.map((c) => `- "${String(c.commentText ?? '').slice(0, 150)}" (${c.voteCount} votes)`).join('\n')}` : '',
        gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
      ].filter(Boolean).join('');

      const [contentGap] = await db.insert(contentGaps).values({
        siteId: site.id,
        gapTitle: gap.painPointTitle,
        gapDescription,
        confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
        suggestedAngle: gap.suggestedArticleAngle,
        relatedQueries: gap.vocabularyQuotes,
        sourceModels: ['youtube-apify', 'claude-sonnet'],
        authorNotes: item.authorNotes || null,
        status: 'new',
      }).returning();

      await db.update(ytExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(ytExtractedGaps.id, gap.id), ytScope));

      created++;
      createdGapIds.push(contentGap.id);
    }
  }

  if (rdItems.length > 0) {
    const ids = rdItems.map((x) => x.id).filter(Boolean);
    const pending = await db.select().from(redditExtractedGaps)
      .where(and(rdScope, eq(redditExtractedGaps.status, 'pending'), inArray(redditExtractedGaps.id, ids)));

    for (const gap of pending) {
      const item = rdItems.find((x) => x.id === gap.id)!;
      const gapDescription = [
        `Problem Context\n${gap.painPointDescription}`,
        `\n\nFrequency: ${gap.frequency} mentions analyzed`,
        gap.vocabularyQuotes.length > 0 ? `\n\nVoice of Customer\n${gap.vocabularyQuotes.join(', ')}` : '',
      ].filter(Boolean).join('');

      const [contentGap] = await db.insert(contentGaps).values({
        siteId: site.id,
        gapTitle: gap.painPointTitle,
        gapDescription,
        confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
        suggestedAngle: gap.suggestedArticleAngle,
        relatedQueries: gap.vocabularyQuotes,
        sourceModels: ['reddit-apify', 'claude-sonnet'],
        authorNotes: item.authorNotes || null,
        status: 'new',
      }).returning();

      await db.update(redditExtractedGaps)
        .set({ status: 'approved', approvedAt: new Date(), contentGapId: contentGap.id })
        .where(and(eq(redditExtractedGaps.id, gap.id), rdScope));

      created++;
      createdGapIds.push(contentGap.id);
    }
  }

  json(res, 200, { processed: ytItems.length + rdItems.length, created, createdGapIds });
  return true;
}
```

- [ ] **Step 3: Update `acknowledge/gaps` to carry per-item authorNotes + DB fallback**

Replace the existing `POST /v1/admin/yolo/acknowledge/gaps` handler:

```typescript
if (method === 'POST' && pathname === '/v1/admin/yolo/acknowledge/gaps') {
  const body = await readJsonBody(req);
  const settings = await getOrCreateSettings(site.id);
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : settings.gapsModel;

  // Accept both new [{id, authorNotes}] and old {ids:[]} format
  const items: { id: number; authorNotes: string }[] = Array.isArray(body.items)
    ? body.items.map((x: any) => ({ id: Number(x.id), authorNotes: String(x.authorNotes ?? '') }))
    : Array.isArray(body.ids)
    ? body.ids.map((id: any) => ({ id: Number(id), authorNotes: '' }))
    : [];

  if (items.length === 0) { json(res, 400, { error: 'Provide items array' }); return true; }

  const ids = items.map((x) => x.id).filter(Boolean);
  const targetGaps = await db.select().from(contentGaps)
    .where(and(gapScope(site.id), inArray(contentGaps.id, ids), eq(contentGaps.status, 'new')));

  let enqueued = 0;
  let skipped = 0;
  const jobIds: number[] = [];

  for (const gap of targetGaps) {
    const itemNotes = items.find((x) => x.id === gap.id)?.authorNotes ?? '';
    // Use per-request notes if provided, otherwise fall back to gap's stored authorNotes
    const finalNotes = itemNotes.trim() || gap.authorNotes || '';

    const [existing] = await db.select({ id: appJobs.id }).from(appJobs)
      .where(and(
        eq(appJobs.siteId, site.id),
        eq(appJobs.topic, 'draft'),
        inArray(appJobs.status, ['pending', 'running']),
        sql`${appJobs.payload}->>'gapId' = ${String(gap.id)}`,
      )).limit(1);

    if (existing) { skipped++; continue; }

    const job = await enqueueDraftJob(site.id, gap.id, model, finalNotes);
    await db.update(contentGaps)
      .set({ status: 'in_progress', acknowledgedAt: new Date() })
      .where(and(eq(contentGaps.id, gap.id), gapScope(site.id)));

    enqueued++;
    jobIds.push(job.id);
  }

  json(res, 200, { processed: ids.length, enqueued, skipped, jobIds });
  return true;
}
```

- [ ] **Step 4: Add `GET /v1/admin/yolo/drafts` endpoint**

```typescript
// GET /v1/admin/yolo/drafts — list draft articles from gap generation
if (method === 'GET' && pathname === '/v1/admin/yolo/drafts') {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0'));

  const items = await db.select({
    id: articles.id,
    slug: articles.slug,
    title: articles.title,
    description: articles.description,
    readingTime: articles.readingTime,
    tags: articles.tags,
    sourceGapId: articles.sourceGapId,
    generatedByModel: articles.generatedByModel,
    createdAt: articles.createdAt,
  })
    .from(articles)
    .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId)))
    .orderBy(desc(articles.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich with gap titles
  const gapIds = [...new Set(items.map((a) => a.sourceGapId).filter(Boolean))] as number[];
  const gapTitles: Record<number, string> = {};
  if (gapIds.length > 0) {
    const gaps = await db.select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle })
      .from(contentGaps).where(inArray(contentGaps.id, gapIds));
    for (const g of gaps) gapTitles[g.id] = g.gapTitle;
  }

  const enriched = items.map((a) => ({
    ...a,
    gapTitle: a.sourceGapId ? (gapTitles[a.sourceGapId] ?? null) : null,
  }));

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
    .from(articles)
    .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId)));

  json(res, 200, { items: enriched, total });
  return true;
}
```

- [ ] **Step 5: Add `POST /v1/admin/yolo/publish/selected` endpoint**

```typescript
// POST /v1/admin/yolo/publish/selected — publish specific article IDs
if (method === 'POST' && pathname === '/v1/admin/yolo/publish/selected') {
  const body = await readJsonBody(req);
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) { json(res, 400, { error: 'Provide ids array' }); return true; }

  const drafts = await db.select().from(articles)
    .where(and(articleScope(site.id), eq(articles.status, 'draft'), isNotNull(articles.sourceGapId), inArray(articles.id, ids)));

  const publishedIds: number[] = [];
  const now = new Date();

  for (const article of drafts) {
    const [updated] = await db.update(articles)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(and(eq(articles.id, article.id), articleScope(site.id)))
      .returning();

    if (article.sourceGapId) {
      await db.update(contentGaps)
        .set({ status: 'acknowledged', acknowledgedAt: now })
        .where(and(eq(contentGaps.id, article.sourceGapId), gapScope(site.id)));
    }

    const [generation] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent })
      .from(articleGenerations).where(eq(articleGenerations.articleId, article.id)).limit(1);

    if (generation) {
      await db.update(articleGenerations)
        .set({ publicationTimestamp: now, finalContent: updated.content, contentChanged: generation.originalContent !== updated.content })
        .where(eq(articleGenerations.id, generation.id));
    }

    publishedIds.push(article.id);
  }

  json(res, 200, { published: publishedIds.length, publishedIds });
  return true;
}
```

- [ ] **Step 6: Commit API changes**

```bash
git add apps/api/src/routes/yolo.ts
git commit -m "feat(yolo-api): add gapsInProgress to preview, per-item authorNotes on approve/acknowledge, drafts+publish/selected endpoints"
```

---

## Task 2: New client proxy routes

**Files:**
- Create: `apps/client-przemyslawfilipiak/src/pages/api/yolo/drafts.ts`
- Create: `apps/client-przemyslawfilipiak/src/pages/api/yolo/publish/selected.ts`

- [ ] **Step 1: Create drafts proxy**

`apps/client-przemyslawfilipiak/src/pages/api/yolo/drafts.ts`:
```typescript
export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

export const GET: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/yolo/drafts' });
```

- [ ] **Step 2: Create publish/selected proxy**

`apps/client-przemyslawfilipiak/src/pages/api/yolo/publish/selected.ts`:
```typescript
export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyInternalApiRequest } from '@/lib/internal-api';

export const POST: APIRoute = ({ request, cookies }) =>
  proxyInternalApiRequest({ request, cookies, pathname: '/v1/admin/yolo/publish/selected' });
```

- [ ] **Step 3: Commit proxies**

```bash
git add apps/client-przemyslawfilipiak/src/pages/api/yolo/drafts.ts apps/client-przemyslawfilipiak/src/pages/api/yolo/publish/selected.ts
git commit -m "feat(yolo-proxy): add drafts and publish/selected API proxy routes"
```

---

## Task 3: Delete old sub-pages

**Files:**
- Delete: `apps/client-przemyslawfilipiak/src/pages/admin/yolo/pain-points.astro`
- Delete: `apps/client-przemyslawfilipiak/src/pages/admin/yolo/gaps.astro`

- [ ] **Step 1: Delete both files**

```bash
git rm apps/client-przemyslawfilipiak/src/pages/admin/yolo/pain-points.astro
git rm apps/client-przemyslawfilipiak/src/pages/admin/yolo/gaps.astro
git commit -m "chore(yolo): remove separate pain-points and gaps pages (merged into module tabs)"
```

---

## Task 4: Rewrite `/admin/yolo/index.astro`

**Files:**
- Modify: `apps/client-przemyslawfilipiak/src/pages/admin/yolo/index.astro`

This is the main task. The page has three sections: header, stats banner, sidebar + tabbed main content.

- [ ] **Step 1: Write the full page**

Replace the entire content of `apps/client-przemyslawfilipiak/src/pages/admin/yolo/index.astro` with the following. Read the full spec at `docs/superpowers/specs/2026-03-24-yolo-mode-module-redesign.md` for reference.

```astro
---
export const prerender = false;
import Base from '@/components/layouts/Base.astro';

const session = Astro.cookies.get('session')?.value;
if (!session) return Astro.redirect('/admin/login');

const headers = { cookie: Astro.request.headers.get('cookie') ?? '' };
const activeTab = Astro.url.searchParams.get('tab') || 'pain-points';
const source = Astro.url.searchParams.get('source') || 'all';
const minIntensity = Astro.url.searchParams.get('minIntensity') || '1';

let settings: any = {};
let preview: any = { ytPainPointsPending: 0, gapsNew: 0, gapsInProgress: 0, draftsReady: 0 };
let painPoints: any[] = [];
let gaps: any[] = [];
let drafts: any[] = [];
let ppTotal = 0;
let gapsTotal = 0;
let draftsTotal = 0;

try {
  const [settingsRes, previewRes] = await Promise.all([
    fetch(new URL('/api/yolo/settings', Astro.url), { headers }),
    fetch(new URL('/api/yolo/preview', Astro.url), { headers }),
  ]);
  if (settingsRes.ok) settings = (await settingsRes.json()).settings ?? {};
  if (previewRes.ok) preview = await previewRes.json();
} catch (e) { console.error('[yolo] settings/preview fetch error:', e); }

try {
  if (activeTab === 'pain-points') {
    const params = new URLSearchParams({ source, minIntensity, limit: '200' });
    const res = await fetch(new URL(`/api/yolo/pain-points?${params}`, Astro.url), { headers });
    if (res.ok) { const d = await res.json(); painPoints = d.items ?? []; ppTotal = d.total ?? 0; }
  } else if (activeTab === 'gaps') {
    const res = await fetch(new URL('/api/content-gaps?status=new&limit=200&sortBy=confidence', Astro.url), { headers });
    if (res.ok) { const d = await res.json(); gaps = d.items ?? d.gaps ?? []; gapsTotal = d.pagination?.total ?? gaps.length; }
  } else if (activeTab === 'publish') {
    const res = await fetch(new URL('/api/yolo/drafts?limit=100', Astro.url), { headers });
    if (res.ok) { const d = await res.json(); drafts = d.items ?? []; draftsTotal = d.total ?? 0; }
  }
} catch (e) { console.error('[yolo] tab data fetch error:', e); }

function intensityClass(n: number) { return n >= 8 ? 'hot' : n >= 5 ? 'warm' : 'cool'; }
function confidenceClass(n: number) { return n >= 70 ? 'high' : n >= 40 ? 'mid' : 'low'; }

const TABS = [
  { id: 'pain-points', label: 'Pain Points', count: preview.ytPainPointsPending },
  { id: 'gaps',        label: 'Content Gaps', count: preview.gapsNew },
  { id: 'publish',     label: 'Ready to Publish', count: preview.draftsReady },
];
---

<Base title="Yolo Mode — Admin" description="Automated content pipeline">
<div class="admin-layout">

  <!-- HEADER -->
  <header class="admin-header">
    <a href="/admin" class="admin-logo">P·F</a>
    <nav class="breadcrumb">
      <a href="/admin" class="bc-link">Admin</a>
      <span class="bc-sep">›</span>
      <span class="bc-current">Yolo Mode</span>
    </nav>
    <div class="header-actions">
      <a href="/api/logout" class="btn-logout">Logout</a>
    </div>
  </header>

  <main class="admin-main">

    <!-- STATS BANNER -->
    <section class="stats-banner">
      <div class="stat-card">
        <span class="stat-number" style="color:#ef4444">{preview.ytPainPointsPending}</span>
        <span class="stat-label">Pain Points Pending</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-card">
        <span class="stat-number" style="color:var(--gold)">{preview.gapsNew}</span>
        <span class="stat-label">New Gaps</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-card">
        <span class="stat-number" style="color:var(--teal)">{preview.gapsInProgress ?? 0}</span>
        <span class="stat-label">In Progress</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-card">
        <span class="stat-number">{preview.draftsReady}</span>
        <span class="stat-label">Drafts Ready</span>
      </div>
    </section>

    <!-- TWO-COLUMN LAYOUT -->
    <div class="yolo-layout">

      <!-- SIDEBAR: Automation Settings -->
      <aside class="yolo-sidebar">

        <!-- STAGE 1 -->
        <div class="sidebar-stage">
          <div class="sidebar-stage-head">
            <span class="stage-num">01</span>
            <span class="sidebar-stage-title">Pain Points → Gaps</span>
            <label class="toggle">
              <input type="checkbox" id="yt-enabled" {settings.ytPainPointsEnabled ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="sidebar-stage-cfg">
            <label class="cfg-row">
              <span>Limit</span>
              <input type="number" id="yt-limit" value={settings.ytPainPointsLimit ?? 10} min="1" max="100" />
            </label>
            <label class="cfg-row">
              <span>Min intensity</span>
              <input type="number" id="yt-intensity" value={settings.ytPainPointsMinIntensity ?? 5} min="1" max="10" />
            </label>
          </div>
          <div class="sidebar-stage-actions">
            <button class="btn-save-stage" data-stage="1">Save</button>
            <button class="btn-run-stage" data-stage="pain-points">▶ Run</button>
          </div>
          <div class="stage-log" id="log-1"></div>
        </div>

        <!-- STAGE 2 -->
        <div class="sidebar-stage">
          <div class="sidebar-stage-head">
            <span class="stage-num">02</span>
            <span class="sidebar-stage-title">Gaps → Drafts</span>
            <label class="toggle">
              <input type="checkbox" id="gaps-enabled" {settings.gapsEnabled ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="sidebar-stage-cfg">
            <label class="cfg-row">
              <span>Limit</span>
              <input type="number" id="gaps-limit" value={settings.gapsLimit ?? 5} min="1" max="50" />
            </label>
            <label class="cfg-row">
              <span>Model</span>
              <select id="gaps-model">
                <option value="anthropic/claude-sonnet-4-6" selected={!settings.gapsModel || settings.gapsModel === 'anthropic/claude-sonnet-4-6'}>sonnet-4-6</option>
                <option value="anthropic/claude-opus-4-6" selected={settings.gapsModel === 'anthropic/claude-opus-4-6'}>opus-4-6</option>
                <option value="anthropic/claude-haiku-4-5-20251001" selected={settings.gapsModel === 'anthropic/claude-haiku-4-5-20251001'}>haiku-4-5</option>
              </select>
            </label>
          </div>
          <div class="sidebar-stage-actions">
            <button class="btn-save-stage" data-stage="2">Save</button>
            <button class="btn-run-stage" data-stage="gaps">▶ Run</button>
          </div>
          <div class="stage-log" id="log-2"></div>
        </div>

        <!-- STAGE 3 -->
        <div class="sidebar-stage">
          <div class="sidebar-stage-head">
            <span class="stage-num">03</span>
            <span class="sidebar-stage-title">Auto-Publish</span>
            <label class="toggle">
              <input type="checkbox" id="publish-enabled" {settings.autoPublishEnabled ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="sidebar-stage-cfg">
            <label class="cfg-row">
              <span>Limit</span>
              <input type="number" id="publish-limit" value={settings.autoPublishLimit ?? 10} min="1" max="50" />
            </label>
          </div>
          <div class="sidebar-stage-actions">
            <button class="btn-save-stage" data-stage="3">Save</button>
            <button class="btn-run-stage" data-stage="publish">▶ Run</button>
          </div>
          <div class="stage-log" id="log-3"></div>
        </div>

        <!-- RUN ALL -->
        <button class="btn-run-all" id="btn-run-all">⚡ Run Full Pipeline</button>
        <div class="stage-log" id="log-all"></div>

      </aside>

      <!-- MAIN CONTENT -->
      <div class="yolo-main">

        <!-- TAB BAR -->
        <div class="yolo-tabs">
          {TABS.map(tab => (
            <a
              href={`/admin/yolo?tab=${tab.id}`}
              class={`yolo-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
              <span class="tab-count">{tab.count}</span>
            </a>
          ))}
        </div>

        <!-- TAB: PAIN POINTS -->
        {activeTab === 'pain-points' && (
          <div class="tab-content" id="tab-pain-points">
            <div class="tab-toolbar">
              <form class="filter-inline" method="get">
                <input type="hidden" name="tab" value="pain-points" />
                <select name="source" onchange="this.form.submit()" class="filter-select">
                  <option value="all" selected={source === 'all'}>All sources</option>
                  <option value="youtube" selected={source === 'youtube'}>YouTube</option>
                  <option value="reddit" selected={source === 'reddit'}>Reddit</option>
                </select>
                <select name="minIntensity" onchange="this.form.submit()" class="filter-select">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <option value={String(n)} selected={String(n) === minIntensity}>{n}+ intensity</option>
                  ))}
                </select>
              </form>
              <span class="toolbar-count"><span id="pp-selected-count">0</span> selected / {ppTotal} pending</span>
              <button class="btn-sel" onclick="ppSelectAll()">All</button>
              <button class="btn-sel" onclick="ppDeselectAll()">None</button>
              <button class="btn-sel" onclick="ppSelectHot()">Hot 8+</button>
              <div class="spacer"></div>
              <button class="btn-approve" id="btn-pp-approve" disabled onclick="ppApprove()">✓ Approve selected</button>
            </div>
            <div class="action-log" id="pp-log" style="display:none"></div>

            {painPoints.length === 0 ? (
              <div class="empty-state">No pending pain points. Run a YouTube or Reddit scrape first.</div>
            ) : (
              <div class="item-list">
                {painPoints.map((item: any) => (
                  <div class={`item-card border-${intensityClass(item.emotionalIntensity)}`} data-id={item.id} data-source={item.source} data-intensity={item.emotionalIntensity}>
                    <label class="item-check-row">
                      <input type="checkbox" class="pp-checkbox item-cb" value={item.id} data-source={item.source} onchange="ppOnCheck(this)" />
                      <div class="item-meta">
                        <span class={`intensity-badge int-${intensityClass(item.emotionalIntensity)}`}>{item.emotionalIntensity}/10</span>
                        <span class="source-badge">{item.source === 'youtube' ? '▶ YT' : '● Reddit'}</span>
                        {item.category && <span class="cat-badge">{item.category}</span>}
                        {item.frequency > 1 && <span class="freq-badge">{item.frequency}×</span>}
                        {item.sourceVideoTitle && <span class="video-title">{item.sourceVideoTitle.slice(0,55)}{item.sourceVideoTitle.length > 55 ? '…' : ''}</span>}
                      </div>
                    </label>
                    <h4 class="item-title">{item.painPointTitle}</h4>
                    <p class="item-desc">{item.painPointDescription.slice(0,200)}{item.painPointDescription.length > 200 ? '…' : ''}</p>
                    {item.vocabularyQuotes?.length > 0 && (
                      <div class="item-quotes">
                        {item.vocabularyQuotes.slice(0,3).map((q: string) => <span class="item-quote">"{q}"</span>)}
                      </div>
                    )}
                    {item.suggestedArticleAngle && (
                      <p class="item-angle">→ {item.suggestedArticleAngle.slice(0,120)}{item.suggestedArticleAngle.length > 120 ? '…' : ''}</p>
                    )}
                    <textarea
                      class="author-notes-input"
                      data-id={item.id}
                      placeholder="Author notes (optional) — will be saved with the content gap and passed to draft generation"
                      rows={2}
                      style="display:none"
                    ></textarea>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <!-- TAB: CONTENT GAPS -->
        {activeTab === 'gaps' && (
          <div class="tab-content" id="tab-gaps">
            <div class="tab-toolbar">
              <span class="toolbar-count"><span id="gaps-selected-count">0</span> selected / {gapsTotal} new gaps</span>
              <button class="btn-sel" onclick="gapsSelectAll()">All</button>
              <button class="btn-sel" onclick="gapsDeselectAll()">None</button>
              <button class="btn-sel" onclick="gapsSelectHigh()">High conf 70+</button>
              <div class="spacer"></div>
              <select id="gaps-queue-model" class="filter-select">
                <option value="anthropic/claude-sonnet-4-6">sonnet-4-6</option>
                <option value="anthropic/claude-opus-4-6">opus-4-6</option>
                <option value="anthropic/claude-haiku-4-5-20251001">haiku-4-5</option>
              </select>
              <button class="btn-queue" id="btn-gaps-queue" disabled onclick="gapsQueue()">▶ Queue drafts</button>
            </div>
            <div class="action-log" id="gaps-log" style="display:none"></div>

            {gaps.length === 0 ? (
              <div class="empty-state">No new content gaps. Approve pain points first or run a GEO analysis.</div>
            ) : (
              <div class="item-list">
                {gaps.map((gap: any) => (
                  <div class={`item-card border-${confidenceClass(gap.confidenceScore ?? 0)}`} data-id={gap.id} data-confidence={gap.confidenceScore ?? 0}>
                    <label class="item-check-row">
                      <input type="checkbox" class="gap-checkbox item-cb" value={gap.id} onchange="gapsOnCheck(this)" />
                      <div class="item-meta">
                        <span class={`conf-badge conf-${confidenceClass(gap.confidenceScore ?? 0)}`}>{gap.confidenceScore ?? 0}%</span>
                        {(gap.sourceModels ?? []).map((m: string) => <span class="model-badge">{m}</span>)}
                        {gap.createdAt && <span class="date-badge">{new Date(gap.createdAt).toLocaleDateString('en-GB', {day:'numeric',month:'short'})}</span>}
                        {gap.authorNotes && <span class="notes-indicator" title={gap.authorNotes}>📝 notes</span>}
                      </div>
                    </label>
                    <h4 class="item-title">{gap.gapTitle}</h4>
                    <p class="item-desc">{(gap.gapDescription ?? '').slice(0,200)}{(gap.gapDescription ?? '').length > 200 ? '…' : ''}</p>
                    {gap.suggestedAngle && <p class="item-angle">→ {gap.suggestedAngle.slice(0,140)}{gap.suggestedAngle.length > 140 ? '…' : ''}</p>}
                    {gap.authorNotes && <p class="existing-notes">Saved notes: {gap.authorNotes.slice(0,120)}{gap.authorNotes.length > 120 ? '…' : ''}</p>}
                    <textarea
                      class="author-notes-input"
                      data-id={gap.id}
                      placeholder="Override author notes (leave blank to use saved notes)"
                      rows={2}
                      style="display:none"
                    ></textarea>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <!-- TAB: READY TO PUBLISH -->
        {activeTab === 'publish' && (
          <div class="tab-content" id="tab-publish">
            <div class="tab-toolbar">
              <span class="toolbar-count"><span id="pub-selected-count">0</span> selected / {draftsTotal} drafts</span>
              <button class="btn-sel" onclick="pubSelectAll()">All</button>
              <button class="btn-sel" onclick="pubDeselectAll()">None</button>
              <div class="spacer"></div>
              <button class="btn-approve" id="btn-pub-publish" disabled onclick="pubPublish()">▶ Publish selected</button>
            </div>
            <div class="action-log" id="pub-log" style="display:none"></div>

            {drafts.length === 0 ? (
              <div class="empty-state">No draft articles ready. Queue some gaps first and wait for draft generation to complete.</div>
            ) : (
              <div class="item-list">
                {drafts.map((draft: any) => (
                  <div class="item-card draft-card" data-id={draft.id}>
                    <label class="item-check-row">
                      <input type="checkbox" class="pub-checkbox item-cb" value={draft.id} onchange="pubOnCheck(this)" />
                      <div class="item-meta">
                        <span class="model-badge">{(draft.generatedByModel ?? '').split('/').pop()}</span>
                        <span class="freq-badge">{draft.readingTime ?? 5} min read</span>
                        {draft.createdAt && <span class="date-badge">{new Date(draft.createdAt).toLocaleDateString('en-GB', {day:'numeric',month:'short'})}</span>}
                      </div>
                    </label>
                    <h4 class="item-title">
                      <a href={`/admin/article/${draft.id}`} target="_blank" class="draft-link">{draft.title}</a>
                    </h4>
                    {draft.gapTitle && <p class="item-angle">Gap: {draft.gapTitle}</p>}
                    {draft.description && <p class="item-desc">{draft.description.slice(0,180)}{draft.description.length > 180 ? '…' : ''}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  </main>
</div>
</Base>

<script>
// ── Pain Points tab ──────────────────────────────────────────────
function ppCheckboxes() { return [...document.querySelectorAll<HTMLInputElement>('.pp-checkbox')]; }
function ppUpdateCount() {
  const n = ppCheckboxes().filter(c => c.checked).length;
  const el = document.getElementById('pp-selected-count');
  if (el) el.textContent = String(n);
  const btn = document.getElementById('btn-pp-approve') as HTMLButtonElement | null;
  if (btn) btn.disabled = n === 0;
}
function ppOnCheck(cb: HTMLInputElement) {
  const card = cb.closest('[data-id]') as HTMLElement;
  const notes = card?.querySelector<HTMLTextAreaElement>('.author-notes-input');
  if (notes) notes.style.display = cb.checked ? 'block' : 'none';
  if (!cb.checked && notes) notes.value = '';
  ppUpdateCount();
}
function ppSelectAll() { ppCheckboxes().forEach(c => { c.checked = true; ppOnCheck(c); }); }
function ppDeselectAll() { ppCheckboxes().forEach(c => { c.checked = false; ppOnCheck(c); }); }
function ppSelectHot() { ppCheckboxes().forEach(c => { const card = c.closest('[data-intensity]') as HTMLElement; c.checked = parseInt(card?.dataset.intensity ?? '0') >= 8; ppOnCheck(c); }); }

async function ppApprove() {
  const checked = ppCheckboxes().filter(c => c.checked);
  if (!checked.length) return;
  const logEl = document.getElementById('pp-log')!;
  const btn = document.getElementById('btn-pp-approve') as HTMLButtonElement;

  const ytItems = checked.filter(c => c.dataset.source === 'youtube').map(c => {
    const card = c.closest('[data-id]') as HTMLElement;
    return { id: Number(c.value), authorNotes: card?.querySelector<HTMLTextAreaElement>('.author-notes-input')?.value ?? '' };
  });
  const rdItems = checked.filter(c => c.dataset.source === 'reddit').map(c => {
    const card = c.closest('[data-id]') as HTMLElement;
    return { id: Number(c.value), authorNotes: card?.querySelector<HTMLTextAreaElement>('.author-notes-input')?.value ?? '' };
  });

  btn.disabled = true;
  btn.textContent = '⏳ Approving…';
  logEl.style.display = 'block';
  logEl.className = 'action-log log-running';
  logEl.textContent = `Approving ${checked.length} pain points…`;

  try {
    const res = await fetch('/api/yolo/approve/pain-points', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ytItems, rdItems }),
    });
    const data = await res.json();
    if (res.ok) {
      logEl.className = 'action-log log-ok';
      logEl.textContent = `✓ Created ${data.created} content gaps from ${data.processed} pain points.`;
      checked.forEach(c => { const card = c.closest('[data-id]') as HTMLElement; if (card) card.style.opacity = '0.35'; });
      btn.textContent = '✓ Done';
    } else {
      logEl.className = 'action-log log-err';
      logEl.textContent = `✗ ${data.error ?? res.status}`;
      btn.disabled = false; btn.textContent = '✓ Approve selected';
    }
  } catch (e: any) {
    logEl.className = 'action-log log-err';
    logEl.textContent = `✗ ${e.message}`;
    btn.disabled = false; btn.textContent = '✓ Approve selected';
  }
}

// ── Gaps tab ─────────────────────────────────────────────────────
function gapsCheckboxes() { return [...document.querySelectorAll<HTMLInputElement>('.gap-checkbox')]; }
function gapsUpdateCount() {
  const n = gapsCheckboxes().filter(c => c.checked).length;
  const el = document.getElementById('gaps-selected-count');
  if (el) el.textContent = String(n);
  const btn = document.getElementById('btn-gaps-queue') as HTMLButtonElement | null;
  if (btn) btn.disabled = n === 0;
}
function gapsOnCheck(cb: HTMLInputElement) {
  const card = cb.closest('[data-id]') as HTMLElement;
  const notes = card?.querySelector<HTMLTextAreaElement>('.author-notes-input');
  if (notes) notes.style.display = cb.checked ? 'block' : 'none';
  if (!cb.checked && notes) notes.value = '';
  gapsUpdateCount();
}
function gapsSelectAll() { gapsCheckboxes().forEach(c => { c.checked = true; gapsOnCheck(c); }); }
function gapsDeselectAll() { gapsCheckboxes().forEach(c => { c.checked = false; gapsOnCheck(c); }); }
function gapsSelectHigh() { gapsCheckboxes().forEach(c => { const card = c.closest('[data-confidence]') as HTMLElement; c.checked = parseInt(card?.dataset.confidence ?? '0') >= 70; gapsOnCheck(c); }); }

async function gapsQueue() {
  const checked = gapsCheckboxes().filter(c => c.checked);
  if (!checked.length) return;
  const logEl = document.getElementById('gaps-log')!;
  const btn = document.getElementById('btn-gaps-queue') as HTMLButtonElement;
  const model = (document.getElementById('gaps-queue-model') as HTMLSelectElement)?.value ?? 'anthropic/claude-sonnet-4-6';

  const items = checked.map(c => {
    const card = c.closest('[data-id]') as HTMLElement;
    return { id: Number(c.value), authorNotes: card?.querySelector<HTMLTextAreaElement>('.author-notes-input')?.value ?? '' };
  });

  btn.disabled = true; btn.textContent = '⏳ Queuing…';
  logEl.style.display = 'block';
  logEl.className = 'action-log log-running';
  logEl.textContent = `Queuing draft jobs for ${items.length} gaps…`;

  try {
    const res = await fetch('/api/yolo/acknowledge/gaps', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items, model }),
    });
    const data = await res.json();
    if (res.ok) {
      logEl.className = 'action-log log-ok';
      logEl.textContent = `✓ Enqueued ${data.enqueued} draft job(s) (skipped ${data.skipped} already queued).`;
      checked.forEach(c => { const card = c.closest('[data-id]') as HTMLElement; if (card) card.style.opacity = '0.35'; });
      btn.textContent = '✓ Queued';
    } else {
      logEl.className = 'action-log log-err';
      logEl.textContent = `✗ ${data.error ?? res.status}`;
      btn.disabled = false; btn.textContent = '▶ Queue drafts';
    }
  } catch (e: any) {
    logEl.className = 'action-log log-err';
    logEl.textContent = `✗ ${e.message}`;
    btn.disabled = false; btn.textContent = '▶ Queue drafts';
  }
}

// ── Publish tab ──────────────────────────────────────────────────
function pubCheckboxes() { return [...document.querySelectorAll<HTMLInputElement>('.pub-checkbox')]; }
function pubUpdateCount() {
  const n = pubCheckboxes().filter(c => c.checked).length;
  const el = document.getElementById('pub-selected-count');
  if (el) el.textContent = String(n);
  const btn = document.getElementById('btn-pub-publish') as HTMLButtonElement | null;
  if (btn) btn.disabled = n === 0;
}
function pubOnCheck(_cb: HTMLInputElement) { pubUpdateCount(); }
function pubSelectAll() { pubCheckboxes().forEach(c => { c.checked = true; pubUpdateCount(); }); }
function pubDeselectAll() { pubCheckboxes().forEach(c => { c.checked = false; pubUpdateCount(); }); }

async function pubPublish() {
  const checked = pubCheckboxes().filter(c => c.checked);
  if (!checked.length) return;
  const logEl = document.getElementById('pub-log')!;
  const btn = document.getElementById('btn-pub-publish') as HTMLButtonElement;
  const ids = checked.map(c => Number(c.value));

  btn.disabled = true; btn.textContent = '⏳ Publishing…';
  logEl.style.display = 'block';
  logEl.className = 'action-log log-running';
  logEl.textContent = `Publishing ${ids.length} articles…`;

  try {
    const res = await fetch('/api/yolo/publish/selected', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (res.ok) {
      logEl.className = 'action-log log-ok';
      logEl.textContent = `✓ Published ${data.published} article(s).`;
      checked.forEach(c => { const card = c.closest('[data-id]') as HTMLElement; if (card) card.style.opacity = '0.35'; });
      btn.textContent = '✓ Published';
    } else {
      logEl.className = 'action-log log-err';
      logEl.textContent = `✗ ${data.error ?? res.status}`;
      btn.disabled = false; btn.textContent = '▶ Publish selected';
    }
  } catch (e: any) {
    logEl.className = 'action-log log-err';
    logEl.textContent = `✗ ${e.message}`;
    btn.disabled = false; btn.textContent = '▶ Publish selected';
  }
}

// ── Sidebar stage controls ────────────────────────────────────────
async function saveStage(stage: number) {
  const body: Record<string, unknown> = {};
  if (stage === 1) {
    body.ytPainPointsEnabled = (document.getElementById('yt-enabled') as HTMLInputElement).checked;
    body.ytPainPointsLimit = Number((document.getElementById('yt-limit') as HTMLInputElement).value);
    body.ytPainPointsMinIntensity = Number((document.getElementById('yt-intensity') as HTMLInputElement).value);
  } else if (stage === 2) {
    body.gapsEnabled = (document.getElementById('gaps-enabled') as HTMLInputElement).checked;
    body.gapsLimit = Number((document.getElementById('gaps-limit') as HTMLInputElement).value);
    body.gapsModel = (document.getElementById('gaps-model') as HTMLSelectElement).value;
  } else if (stage === 3) {
    body.autoPublishEnabled = (document.getElementById('publish-enabled') as HTMLInputElement).checked;
    body.autoPublishLimit = Number((document.getElementById('publish-limit') as HTMLInputElement).value);
  }
  const logEl = document.getElementById(`log-${stage}`)!;
  const res = await fetch('/api/yolo/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) { logEl.textContent = '✓ Saved'; logEl.className = 'stage-log log-ok'; }
  else { logEl.textContent = '✗ Save failed'; logEl.className = 'stage-log log-err'; }
  setTimeout(() => { logEl.textContent = ''; logEl.className = 'stage-log'; }, 3000);
}

async function runStage(stageName: string, logId: string) {
  const logEl = document.getElementById(logId)!;
  logEl.textContent = '⏳ Running…'; logEl.className = 'stage-log log-running';
  try {
    const res = await fetch(`/api/yolo/run/${stageName}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = await res.json();
    if (res.ok) { logEl.textContent = `✓ ${JSON.stringify(data)}`; logEl.className = 'stage-log log-ok'; }
    else { logEl.textContent = `✗ ${data.error ?? res.status}`; logEl.className = 'stage-log log-err'; }
  } catch (e: any) { logEl.textContent = `✗ ${e.message}`; logEl.className = 'stage-log log-err'; }
}

document.querySelectorAll('.btn-save-stage').forEach(btn => {
  btn.addEventListener('click', () => saveStage(Number((btn as HTMLElement).dataset.stage)));
});
document.querySelectorAll('.btn-run-stage').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = (btn as HTMLElement).dataset.stage!;
    const n = s === 'pain-points' ? '1' : s === 'gaps' ? '2' : '3';
    runStage(s, `log-${n}`);
  });
});
document.getElementById('btn-run-all')?.addEventListener('click', async () => {
  const logEl = document.getElementById('log-all')!;
  logEl.textContent = '⏳ Running pipeline…'; logEl.className = 'stage-log log-running';
  const results: string[] = [];
  const ppEnabled = (document.getElementById('yt-enabled') as HTMLInputElement).checked;
  const gapEnabled = (document.getElementById('gaps-enabled') as HTMLInputElement).checked;
  const pubEnabled = (document.getElementById('publish-enabled') as HTMLInputElement).checked;
  if (ppEnabled) { const r = await fetch('/api/yolo/run/pain-points', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' }); const d = await r.json(); results.push(`Stage 1: created ${d.created ?? 0} gaps`); }
  if (gapEnabled) { const r = await fetch('/api/yolo/run/gaps', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' }); const d = await r.json(); results.push(`Stage 2: enqueued ${d.enqueued ?? 0} jobs`); }
  if (pubEnabled) { const r = await fetch('/api/yolo/run/publish', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' }); const d = await r.json(); results.push(`Stage 3: published ${d.published ?? 0}`); }
  if (!results.length) { logEl.textContent = 'No stages enabled.'; logEl.className = 'stage-log log-err'; }
  else { logEl.textContent = `✓ Pipeline done\n${results.join('\n')}`; logEl.className = 'stage-log log-ok'; }
});
</script>

<style>
  /* ── Layout ── */
  .admin-layout { min-height: 100vh; background: var(--bg-base); display: flex; flex-direction: column; }
  .admin-header { display: flex; align-items: center; gap: 1rem; padding: 0.875rem 1.5rem; border-bottom: 1px solid var(--border); background: var(--bg-elevated); position: sticky; top: 0; z-index: 20; }
  .admin-logo { font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 700; color: var(--teal); text-decoration: none; }
  .breadcrumb { display: flex; align-items: center; gap: 0.5rem; flex: 1; font-family: var(--font-mono); font-size: var(--text-xs); }
  .bc-link { color: var(--text-muted); text-decoration: none; } .bc-link:hover { color: var(--teal); }
  .bc-sep { color: var(--text-muted); }
  .bc-current { color: var(--text-secondary); }
  .header-actions { display: flex; gap: 0.5rem; }
  .btn-logout { font-family: var(--font-mono); font-size: var(--text-xs); padding: 0.3rem 0.75rem; border: 1px solid rgba(239,68,68,0.3); color: rgba(239,68,68,0.7); border-radius: 0.25rem; text-decoration: none; transition: all 0.15s; }
  .btn-logout:hover { border-color: #ef4444; color: #ef4444; }

  .admin-main { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }

  /* ── Stats Banner ── */
  .stats-banner { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 0.5rem; flex-wrap: wrap; }
  .stat-card { display: flex; flex-direction: column; align-items: center; min-width: 80px; }
  .stat-number { font-family: var(--font-mono); font-size: 1.5rem; font-weight: 700; }
  .stat-label { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-top: 0.2rem; letter-spacing: 0.04em; }
  .stat-divider { width: 1px; height: 40px; background: var(--border); }

  /* ── Two-column ── */
  .yolo-layout { display: grid; grid-template-columns: 260px 1fr; gap: 1.5rem; }
  @media (max-width: 768px) { .yolo-layout { grid-template-columns: 1fr; } }

  /* ── Sidebar ── */
  .yolo-sidebar { display: flex; flex-direction: column; gap: 0.75rem; }
  .sidebar-stage { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.875rem; }
  .sidebar-stage-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
  .stage-num { font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700; color: var(--teal); background: color-mix(in srgb, var(--teal) 15%, transparent); padding: 0.15rem 0.4rem; border-radius: 0.2rem; flex-shrink: 0; }
  .sidebar-stage-title { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary); flex: 1; }
  .sidebar-stage-cfg { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
  .cfg-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
  .cfg-row input, .cfg-row select { background: var(--bg-base); border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.2rem 0.4rem; color: var(--text-primary); font-family: var(--font-mono); font-size: var(--text-xs); width: 90px; text-align: right; }
  .cfg-row input:focus, .cfg-row select:focus { outline: none; border-color: var(--teal); }
  .sidebar-stage-actions { display: flex; gap: 0.4rem; }
  .btn-save-stage { flex: 1; background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-family: var(--font-mono); font-size: var(--text-xs); padding: 0.3rem 0; border-radius: 0.25rem; cursor: pointer; transition: all 0.15s; }
  .btn-save-stage:hover { border-color: var(--text-secondary); color: var(--text-primary); }
  .btn-run-stage { flex: 1; background: var(--teal); border: none; color: var(--bg-base); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 600; padding: 0.3rem 0; border-radius: 0.25rem; cursor: pointer; transition: opacity 0.15s; }
  .btn-run-stage:hover { opacity: 0.85; }
  .btn-run-all { width: 100%; padding: 0.5rem; background: var(--gold); border: none; color: var(--bg-base); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 700; border-radius: 0.375rem; cursor: pointer; transition: opacity 0.15s; margin-top: 0.25rem; }
  .btn-run-all:hover { opacity: 0.85; }
  .stage-log { margin-top: 0.5rem; font-family: var(--font-mono); font-size: 0.65rem; white-space: pre-wrap; border-radius: 0.25rem; min-height: 0; }
  .log-ok { color: var(--teal); background: color-mix(in srgb, var(--teal) 8%, transparent); padding: 0.3rem 0.5rem; }
  .log-err { color: #e87878; background: color-mix(in srgb, #e87878 8%, transparent); padding: 0.3rem 0.5rem; }
  .log-running { color: var(--gold); background: color-mix(in srgb, var(--gold) 8%, transparent); padding: 0.3rem 0.5rem; }

  /* ── Toggle ── */
  .toggle { position: relative; display: inline-flex; cursor: pointer; flex-shrink: 0; }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-track { width: 2rem; height: 1.125rem; background: var(--border); border-radius: 9999px; transition: background 0.2s; }
  .toggle input:checked + .toggle-track { background: var(--teal); }
  .toggle-track::after { content: ''; position: absolute; top: 0.1875rem; left: 0.1875rem; width: 0.75rem; height: 0.75rem; background: white; border-radius: 50%; transition: transform 0.2s; }
  .toggle input:checked ~ .toggle-track::after { transform: translateX(0.875rem); }

  /* ── Main content area ── */
  .yolo-main { display: flex; flex-direction: column; min-width: 0; }
  .yolo-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
  .yolo-tab { padding: 0.5rem 1rem; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; align-items: center; gap: 0.35rem; transition: color 0.15s; }
  .yolo-tab:hover { color: var(--text-secondary); }
  .yolo-tab.active { color: var(--text-primary); border-bottom-color: var(--gold); }
  .tab-count { font-family: var(--font-mono); font-size: 0.6rem; padding: 0.1rem 0.35rem; background: rgba(255,255,255,0.08); border-radius: 0.8rem; }

  /* ── Toolbar ── */
  .tab-toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.875rem; padding: 0.625rem 0.875rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 0.375rem; }
  .toolbar-count { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
  .filter-inline { display: flex; gap: 0.4rem; align-items: center; }
  .filter-select { background: var(--bg-base); border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.2rem 0.4rem; color: var(--text-secondary); font-family: var(--font-mono); font-size: var(--text-xs); }
  .btn-sel { background: transparent; border: 1px solid var(--border); color: var(--text-muted); font-family: var(--font-mono); font-size: var(--text-xs); padding: 0.25rem 0.6rem; border-radius: 0.25rem; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
  .btn-sel:hover { border-color: var(--text-secondary); color: var(--text-secondary); }
  .spacer { flex: 1; }
  .btn-approve { background: var(--teal); border: none; color: var(--bg-base); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 600; padding: 0.3rem 0.875rem; border-radius: 0.25rem; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
  .btn-approve:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-approve:not(:disabled):hover { opacity: 0.85; }
  .btn-queue { background: var(--gold); border: none; color: var(--bg-base); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: 600; padding: 0.3rem 0.875rem; border-radius: 0.25rem; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
  .btn-queue:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-queue:not(:disabled):hover { opacity: 0.85; }

  /* ── Action log ── */
  .action-log { padding: 0.625rem 0.875rem; border-radius: 0.375rem; font-family: var(--font-mono); font-size: var(--text-xs); margin-bottom: 0.875rem; white-space: pre-wrap; }

  /* ── Item cards ── */
  .empty-state { padding: 3rem; text-align: center; font-family: var(--font-mono); font-size: var(--text-sm); color: var(--text-muted); }
  .item-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .item-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; transition: border-color 0.15s; }
  .item-card.border-hot { border-left: 3px solid #e87878; }
  .item-card.border-warm { border-left: 3px solid var(--gold); }
  .item-card.border-cool { border-left: 3px solid var(--border); }
  .item-card.border-high { border-left: 3px solid var(--teal); }
  .item-card.border-mid { border-left: 3px solid var(--gold); }
  .item-card.border-low { border-left: 3px solid var(--border); }
  .item-card:has(.item-cb:checked) { border-color: color-mix(in srgb, var(--teal) 60%, var(--border)); background: color-mix(in srgb, var(--teal) 4%, var(--bg-elevated)); }

  .item-check-row { display: flex; align-items: flex-start; gap: 0.625rem; cursor: pointer; margin-bottom: 0.35rem; }
  .item-cb { flex-shrink: 0; margin-top: 0.15rem; accent-color: var(--teal); cursor: pointer; }
  .item-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; flex: 1; }
  .item-title { font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 0.25rem; padding-left: 1.5rem; }
  .item-desc { font-size: var(--text-xs); color: var(--text-secondary); margin: 0 0 0.35rem; line-height: 1.5; padding-left: 1.5rem; }
  .item-quotes { display: flex; flex-wrap: wrap; gap: 0.3rem; padding-left: 1.5rem; margin-bottom: 0.35rem; }
  .item-quote { font-size: var(--text-xs); color: var(--violet); font-style: italic; }
  .item-angle { font-size: var(--text-xs); color: var(--teal); margin: 0 0 0.25rem; font-style: italic; padding-left: 1.5rem; }
  .existing-notes { font-size: var(--text-xs); color: var(--gold); margin: 0 0 0.25rem; padding-left: 1.5rem; font-style: italic; }

  /* Badges */
  .intensity-badge { font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 0.2rem; }
  .int-hot { background: color-mix(in srgb, #e87878 20%, transparent); color: #e87878; }
  .int-warm { background: color-mix(in srgb, var(--gold) 20%, transparent); color: var(--gold); }
  .int-cool { background: color-mix(in srgb, var(--border) 40%, transparent); color: var(--text-muted); }
  .conf-badge { font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 0.2rem; }
  .conf-high { background: color-mix(in srgb, var(--teal) 20%, transparent); color: var(--teal); }
  .conf-mid { background: color-mix(in srgb, var(--gold) 20%, transparent); color: var(--gold); }
  .conf-low { background: color-mix(in srgb, var(--border) 40%, transparent); color: var(--text-muted); }
  .source-badge { font-family: var(--font-mono); font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 0.2rem; background: color-mix(in srgb, var(--violet) 15%, transparent); color: var(--violet); }
  .cat-badge { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); }
  .freq-badge { font-family: var(--font-mono); font-size: 0.65rem; color: var(--teal); }
  .video-title { font-size: 0.65rem; color: var(--text-muted); font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-badge { font-family: var(--font-mono); font-size: 0.65rem; padding: 0.1rem 0.35rem; background: var(--bg-base); border: 1px solid var(--border); border-radius: 0.2rem; color: var(--text-muted); }
  .date-badge { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted); }
  .notes-indicator { font-size: 0.65rem; color: var(--gold); }

  /* Author notes textarea */
  .author-notes-input { width: 100%; margin-top: 0.5rem; padding: 0.375rem 0.625rem; background: var(--bg-base); border: 1px solid var(--border); border-radius: 0.375rem; color: var(--text-secondary); font-family: var(--font-mono); font-size: var(--text-xs); resize: vertical; transition: border-color 0.15s; }
  .author-notes-input:focus { outline: none; border-color: var(--gold); }

  /* Draft card */
  .draft-card { border-left: 3px solid var(--teal); }
  .draft-link { color: var(--text-primary); text-decoration: none; } .draft-link:hover { color: var(--teal); }
</style>
```

- [ ] **Step 2: Verify page renders without errors**

Open `/admin/yolo` in browser and check:
- Header shows P·F logo + breadcrumb
- Stats banner shows 4 counts
- Sidebar shows 3 stage cards with toggles
- Tab bar shows Pain Points / Content Gaps / Ready to Publish
- Default tab (Pain Points) loads and shows pain point cards or empty state

- [ ] **Step 3: Commit**

```bash
git add apps/client-przemyslawfilipiak/src/pages/admin/yolo/index.astro
git commit -m "feat(yolo): full admin module redesign — header/stats/sidebar/tabs with author notes"
```

---

## Task 5: Add YOLO hub card to admin/index.astro

**Files:**
- Modify: `apps/client-przemyslawfilipiak/src/pages/admin/index.astro`

- [ ] **Step 1: Find where hub cards are defined and insert YOLO card**

Search the admin index for the hub grid section. Add a card for YOLO Mode that shows pain points pending and gaps counts. The card should link to `/admin/yolo` and match the `.hub-card` pattern.

The insert should go near the other intelligence module cards. Find the `hub-grid` div and add:

```html
<a href="/admin/yolo" class="hub-card">
  <span class="hub-icon">⚡</span>
  <div class="hub-body">
    <div class="hub-title">Yolo Mode</div>
    <div class="hub-meta">
      <span class="hub-badge hub-badge--gold">Pipeline</span>
    </div>
    <div class="hub-desc">Mass-approve pain points and gaps, auto-publish drafts. Three-stage automated content pipeline.</div>
  </div>
  <span class="hub-arrow">›</span>
</a>
```

- [ ] **Step 2: Commit**

```bash
git add apps/client-przemyslawfilipiak/src/pages/admin/index.astro
git commit -m "feat(admin-hub): add Yolo Mode card to admin dashboard"
```

---

## Task 6: Final push

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify on Railway**

After deployment, open `/admin/yolo` and confirm:
- Pain Points tab shows items from YT and Reddit
- Checking a card reveals the author notes textarea
- Approving selected items calls `/api/yolo/approve/pain-points` with `ytItems`/`rdItems` format
- Content Gaps tab shows new gaps with saved notes indicator where applicable
- Ready to Publish tab shows drafts with gap title
- Sidebar stage toggles and run buttons work
