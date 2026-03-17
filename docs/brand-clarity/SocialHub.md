# SocialHub — Pełny Plan Implementacji Modułu

**Ostatnia aktualizacja:** 2026-03-17
**Status:** 📋 Plan wdrożenia — oczekuje na implementację
**Konwencja nazewnictwa:** prefiks `sh_` dla tabel DB, `sh-` dla skryptów, `social-hub` dla ścieżek URL

---

## 1. WIZJA MODUŁU

SocialHub to samodzielny moduł FrinterHero (na równi z YouTube Intelligence i Brand Clarity), który pozwala adminowi wybrać dowolną treść z aplikacji (artykuł, pain point, cytat VoC, klaster), przetworzyć ją w kontent viralowy (grafika Satori / wideo WaveSpeed), a następnie opublikować na wielu kontach społecznościowych przez jedno API (Upload-Post.com).

### Kluczowe zasady projektowe:
- **Pełna kontrola admina** — admin zatwierdza każdy krok, od wyboru źródła, przez prompt pośredni, po finalny publish.
- **Dostęp do całej bazy wiedzy** — artykuły, pain pointy, klastry, KB entries, VoC cytaty.
- **Prompt pośredni (Suggestion Prompt)** — admin może wpisać sugestię/kontekst, który wpływa na to, jak AI przetworzy treść na post socialowy.
- **Ustawienia systemowe** — konfiguracja providerów, modeli, szablonów i kont z poziomu panelu admina.

---

## 2. PEŁNY FLOW — ASCII MAP

```
  SOCIALHUB PIPELINE
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                                                                              │
  │  ŹRÓDŁA TREŚCI (dane z istniejących modułów FrinterHero)                     │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  articles              — opublikowane artykuły ze strony               │  │
  │  │  contentGaps           — wykryte luki w AI (GEO monitor)               │  │
  │  │  bcExtractedPainPoints — pain pointy z Brand Clarity                   │  │
  │  │  bcPainClusters        — klastry bólów (syntetyczne tematy)            │  │
  │  │  knowledgeEntries      — baza wiedzy autora (KB)                       │  │
  │  │  redditExtractedGaps   — gapy z Reddita                               │  │
  │  │  ytExtractedGaps       — gapy z YouTube Intelligence                   │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                │                                              │
  │                         [admin wybiera źródło]                                │
  │                                │                                              │
  │                                ▼                                              │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  STAGE 1 — CONTENT BRIEF                              [UI ONLY]       │  │
  │  │                                                                        │  │
  │  │  · Admin wybiera 1+ źródeł treści (artykuł, pain point, klaster)      │  │
  │  │  · System automatycznie ładuje kontekst:                               │  │
  │  │    — pełna treść artykułu / pain pointu                                │  │
  │  │    — vocData (problemLabel, dominantEmotion, quotes)                   │  │
  │  │    — powiązane KB entries (fulltext match)                             │  │
  │  │    — llms-full.txt (brand voice + author identity)                     │  │
  │  │  · Admin wpisuje Suggestion Prompt (opcjonalny):                       │  │
  │  │    "Skup się na aspekcie X", "Ton ironiczny", "Dla grupy Y"           │  │
  │  │  · Admin wybiera format wyjściowy:                                     │  │
  │  │    — 📷 Grafika (Satori)                                               │  │
  │  │    — 🎬 Wideo (WaveSpeed)                                              │  │
  │  │    — 📝 Tekst (czysty post tekstowy)                                   │  │
  │  │  · Admin wybiera platformy docelowe (multi-select):                    │  │
  │  │    — Instagram / Threads / TikTok / X / LinkedIn                       │  │
  │  │                                                                        │  │
  │  │  Output: shContentBrief record → DB                                    │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                │                                              │
  │                                ▼                                              │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  STAGE 2 — AI COPYWRITER                              [SONNET × 1]    │  │
  │  │                                                                        │  │
  │  │  Mega-prompt składa się z:                                             │  │
  │  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
  │  │  │  1. SYSTEM: Jesteś ekspertem Social Media, Brand Voice z         │  │  │
  │  │  │     llms-full.txt. Grade 6 reading level.                        │  │  │
  │  │  │  2. CONTEXT: Pełna treść źródła (artykuł/PP/klaster)            │  │  │
  │  │  │  3. KNOWLEDGE: Dopasowane KB entries                             │  │  │
  │  │  │  4. SUGGESTION: Admin prompt pośredni (jeśli podany)             │  │  │
  │  │  │  5. FORMAT: Generuj { hookLine, bodyText, hashtags, cta,         │  │  │
  │  │  │     imagePromptDescription (opis grafiki dla szablonu Satori),   │  │  │
  │  │  │     videoScript (skrypt do TTS jeśli format=wideo) }             │  │  │
  │  │  └─────────────────────────────────────────────────────────────────┘  │  │
  │  │                                                                        │  │
  │  │  Output: shGeneratedCopy record → DB                                   │  │
  │  │  Status: draft (czeka na review admina)                                │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                │                                              │
  │                    [admin review + edycja copy]                                │
  │                                │                                              │
  │                                ▼                                              │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  STAGE 3 — MEDIA RENDER                                                │  │
  │  │                                                                        │  │
  │  │  ŚCIEŻKA A: GRAFIKA (Satori)                          [NO AI]        │  │
  │  │  · Satori renderuje JSX template z Brand Design System                 │  │
  │  │  · Input: hookLine + bodyText + wybrany szablon                        │  │
  │  │  · Formaty: 1080×1080 (feed), 1080×1920 (story/reels)                 │  │
  │  │  · Output: PNG → upload do Storage (S3/Cloudinary)                     │  │
  │  │  · Rendering: SYNCHRONICZNY (milisekundy)                              │  │
  │  │                                                                        │  │
  │  │  ŚCIEŻKA B: WIDEO (WaveSpeed API)                     [AI VIDEO]     │  │
  │  │  · TTS: Tekst videoScript → audio (ElevenLabs / Kokoro)                │  │
  │  │  · WaveSpeed: audio + avatar image → wideo (Wan 2.2 / InfiniteTalk)   │  │
  │  │  · Output: MP4 URL → download → upload do Storage                      │  │
  │  │  · Rendering: ASYNCHRONICZNY (webhook / polling, 1-5 min)              │  │
  │  │                                                                        │  │
  │  │  ŚCIEŻKA C: TEKST (bez mediów)                        [NO AI]        │  │
  │  │  · Tylko copy — gotowe do podania w API Upload-Post jako tekst         │  │
  │  │                                                                        │  │
  │  │  Output: shMediaAsset record → DB                                      │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                │                                              │
  │                    [admin preview + approve]                                   │
  │                                │                                              │
  │                                ▼                                              │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  STAGE 4 — PUBLISH                                     [API CALL]     │  │
  │  │                                                                        │  │
  │  │  · Upload-Post API: jeden POST request per platforma                   │  │
  │  │  · System automatycznie dostosowuje format:                            │  │
  │  │    — Instagram: kwadrat 1080×1080 + caption z hashtags                 │  │
  │  │    — Threads: tekst + obraz lub wideo                                  │  │
  │  │    — TikTok: wideo 9:16 z opisem                                      │  │
  │  │    — X/Twitter: tekst 280 znaków + media attachment                    │  │
  │  │    — LinkedIn: tekst + media attachment                                │  │
  │  │  · Publish: natychmiast lub scheduled (data + godzina)                 │  │
  │  │  · Multi-account: admin wybiera, na które konta danej platformy       │  │
  │  │                                                                        │  │
  │  │  Output: shPublishLog records → DB (1 per konto docelowe)              │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                │                                              │
  │                                ▼                                              │
  │  ┌────────────────────────────────────────────────────────────────────────┐  │
  │  │  STAGE 5 — ANALYTICS (odczyt z Upload-Post)            [API CALL]     │  │
  │  │                                                                        │  │
  │  │  · Polling/Webhook z Upload-Post: views, likes, comments, shares       │  │
  │  │  · Dashboard: metryki per post, per platforma, per pain point          │  │
  │  │  · Insight: które pain pointy generują największy engagement           │  │
  │  │                                                                        │  │
  │  │  Output: shPostMetrics records → DB                                    │  │
  │  └────────────────────────────────────────────────────────────────────────┘  │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. SCHEMAT BAZY DANYCH

### Nowe tabele (prefiks `sh_`)

#### `shSettings` — ustawienia modułu (1 wiersz, JSONB)
```typescript
export const shSettings = pgTable('sh_settings', {
  id: serial('id').primaryKey(),
  config: jsonb('config').notNull().$type<{
    // LLM
    copywriterModel: string;           // 'claude-sonnet-4-6'
    copywriterThinkingBudget: number;  // 10000
    // Video
    videoProvider: string;             // 'wavespeed'
    videoModel: string;                // 'wan-2.2-ultra-fast'
    ttsProvider: string;               // 'elevenlabs' | 'kokoro'
    // Distribution
    distributionProvider: string;      // 'upload-post'
    autoSchedule: boolean;             // false
    defaultHashtags: string[];         // ['#productivity', '#deepwork']
    // Brand Voice
    brandVoiceFile: string;            // 'public/llms-full.txt'
    maxPostLength: number;             // 280 (per platform override)
  }>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

#### `shSocialAccounts` — podpięte konta social media
```typescript
export const shSocialAccounts = pgTable('sh_social_accounts', {
  id: serial('id').primaryKey(),
  platform: varchar('platform', { length: 30 }).notNull(),    // instagram | tiktok | threads | twitter | linkedin
  accountName: varchar('account_name', { length: 255 }).notNull(),
  accountHandle: varchar('account_handle', { length: 255 }),
  authPayload: jsonb('auth_payload'),                         // tokeny Upload-Post (user ID)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shContentBriefs` — zlecenia treści (Stage 1)
```typescript
export const shContentBriefs = pgTable('sh_content_briefs', {
  id: serial('id').primaryKey(),
  // Źródło treści (polimorficzne — jedno z poniższych wypełnione)
  sourceType: varchar('source_type', { length: 30 }).notNull(),
    // 'article' | 'pain_point' | 'pain_cluster' | 'content_gap' | 'kb_entry' | 'reddit_gap' | 'yt_gap'
  sourceId: integer('source_id').notNull(),                   // ID rekordu w tabeli źródłowej
  sourceTitle: varchar('source_title', { length: 500 }),      // cache: tytuł źródła do wyświetlenia
  sourceSnapshot: text('source_snapshot'),                    // cache: pełna treść w momencie tworzenia
  // Konfiguracja admina
  suggestionPrompt: text('suggestion_prompt'),                // prompt pośredni admina
  outputFormat: varchar('output_format', { length: 20 }).notNull(), // 'image' | 'video' | 'text'
  targetPlatforms: jsonb('target_platforms').$type<string[]>().notNull().default([]),
  targetAccountIds: jsonb('target_account_ids').$type<number[]>().notNull().default([]),
  // Kontekst dołączony automatycznie
  kbEntriesUsed: jsonb('kb_entries_used').$type<number[]>().default([]),
  brandVoiceUsed: boolean('brand_voice_used').notNull().default(true),
  // Status
  status: varchar('status', { length: 30 }).notNull().default('draft'),
    // draft → generating → copy_review → rendering → render_review → scheduling → published → done
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shGeneratedCopy` — tekst oraz skrypt wygenerowany przez AI (Stage 2)
```typescript
export const shGeneratedCopy = pgTable('sh_generated_copy', {
  id: serial('id').primaryKey(),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  hookLine: text('hook_line').notNull(),                      // pierwsza linia posta (hook)
  bodyText: text('body_text').notNull(),                      // treść posta
  hashtags: jsonb('hashtags').$type<string[]>().default([]),
  cta: text('cta'),                                           // call-to-action
  imageLayoutDescription: text('image_layout_description'),   // opis dla szablonu Satori
  videoScript: text('video_script'),                          // tekst do TTS (tylko format=video)
  // Meta
  generationModel: varchar('generation_model', { length: 100 }),
  promptUsed: text('prompt_used'),                            // pełny prompt wysłany do LLM
  // Admin edits
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | approved | rejected
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shTemplates` — szablony graficzne Satori
```typescript
export const shTemplates = pgTable('sh_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),           // 'Retro Quote Card'
  slug: varchar('slug', { length: 100 }).notNull().unique(),  // 'retro-quote-card'
  category: varchar('category', { length: 50 }).notNull(),    // 'quote' | 'pain_point' | 'tip' | 'promo'
  aspectRatio: varchar('aspect_ratio', { length: 10 }).notNull(), // '1:1' | '9:16' | '16:9'
  jsxTemplate: text('jsx_template').notNull(),                // kod JSX/HTML szablonu
  previewUrl: text('preview_url'),                            // podgląd statyczny
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shMediaAssets` — wygenerowane pliki mediów (Stage 3)
```typescript
export const shMediaAssets = pgTable('sh_media_assets', {
  id: serial('id').primaryKey(),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  copyId: integer('copy_id').references(() => shGeneratedCopy.id),
  templateId: integer('template_id').references(() => shTemplates.id),
  type: varchar('type', { length: 10 }).notNull(),            // 'image' | 'video'
  mediaUrl: text('media_url'),                                // URL w trwałym storage
  thumbnailUrl: text('thumbnail_url'),                        // miniaturka (dla wideo)
  width: integer('width'),
  height: integer('height'),
  durationSeconds: integer('duration_seconds'),               // tylko video
  fileSizeBytes: integer('file_size_bytes'),
  renderProvider: varchar('render_provider', { length: 30 }), // 'satori' | 'wavespeed'
  renderModel: varchar('render_model', { length: 50 }),       // 'wan-2.2' | null
  renderCostUsd: real('render_cost_usd'),                     // koszt renderowania
  status: varchar('status', { length: 20 }).notNull().default('pending'),
    // pending → rendering → completed → failed
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shPublishLog` — log publikacji (Stage 4)
```typescript
export const shPublishLog = pgTable('sh_publish_log', {
  id: serial('id').primaryKey(),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  mediaAssetId: integer('media_asset_id').references(() => shMediaAssets.id),
  accountId: integer('account_id').notNull().references(() => shSocialAccounts.id),
  platform: varchar('platform', { length: 30 }).notNull(),
  externalPostId: varchar('external_post_id', { length: 255 }), // ID posta na platformie
  externalPostUrl: text('external_post_url'),                    // link do posta
  publishedAt: timestamp('published_at'),
  scheduledFor: timestamp('scheduled_for'),                      // null = natychmiastowy publish
  status: varchar('status', { length: 20 }).notNull().default('pending'),
    // pending → scheduled → published → failed
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### `shPostMetrics` — analityka postów (Stage 5)
```typescript
export const shPostMetrics = pgTable('sh_post_metrics', {
  id: serial('id').primaryKey(),
  publishLogId: integer('publish_log_id').notNull().references(() => shPublishLog.id, { onDelete: 'cascade' }),
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  engagementRate: real('engagement_rate'),                     // (likes+comments+shares) / views
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
});
```

---

## 4. NOWE PLIKI — MAPA SYSTEMU

### Skrypty (`scripts/`)

| Skrypt | Stage | Rola |
|--------|-------|------|
| `sh-copywriter.ts` | 2 | AI generuje hookLine, bodyText, hashtags, videoScript z kontekstu |
| `sh-video-render.ts` | 3B | Obsługa TTS + request do WaveSpeed API + polling statusu |

### Serwisy (`src/lib/`)

| Plik | Rola |
|------|------|
| `sh-settings.ts` | `getShSettings()`, `saveShSettings()`, `buildShEnv()` |
| `sh-image-gen.ts` | Satori rendering: JSX template → SVG → PNG (resvg-js) |
| `sh-video-gen.ts` | WaveSpeed API client: TTS → audio + avatar → video request |
| `sh-distributor.ts` | Upload-Post API client: publish media to platforms |
| `sh-source-loader.ts` | Uniwersalny loader: `loadSource(sourceType, sourceId)` → ujednolicony kontekst |
| `sh-kb-matcher.ts` | Fulltext match KB entries do wybranego źródła |
| `sh-copywriter-job.ts` | Job manager: spawn `sh-copywriter.ts` z env vars |
| `sh-video-job.ts` | Job manager: spawn `sh-video-render.ts` z env vars |

### API Routes (`src/pages/api/social-hub/`)

| Method | Endpoint | Opis |
|--------|----------|------|
| `GET` | `/api/social-hub/settings` | Pobierz ustawienia SocialHub |
| `PUT` | `/api/social-hub/settings` | Zapisz ustawienia SocialHub |
| `GET` | `/api/social-hub/accounts` | Lista podpiętych kont |
| `POST` | `/api/social-hub/accounts` | Dodaj nowe konto (auth Upload-Post) |
| `DELETE` | `/api/social-hub/accounts/[id]` | Usuń konto |
| `GET` | `/api/social-hub/sources` | Lista dostępnych źródeł (artykuły + PP + KB + gaps) |
| `POST` | `/api/social-hub/briefs` | Stwórz nowy brief |
| `GET` | `/api/social-hub/briefs` | Lista briefów (z paginacją) |
| `GET` | `/api/social-hub/briefs/[id]` | Szczegóły briefu |
| `POST` | `/api/social-hub/briefs/[id]/generate-copy` | Uruchom AI Copywriter (Stage 2) |
| `PUT` | `/api/social-hub/briefs/[id]/copy` | Admin edytuje / zatwierdza copy |
| `POST` | `/api/social-hub/briefs/[id]/render` | Generuj media (Stage 3: Satori lub WaveSpeed) |
| `POST` | `/api/social-hub/briefs/[id]/publish` | Opublikuj na wybranych kontach (Stage 4) |
| `GET` | `/api/social-hub/briefs/[id]/metrics` | Pobierz analitykę posta (Stage 5) |
| `GET` | `/api/social-hub/templates` | Lista szablonów Satori |
| `POST` | `/api/social-hub/templates` | Dodaj nowy szablon |
| `GET` | `/api/social-hub/analytics` | Dashboard analityczny (agregaty) |

### Admin UI (`src/pages/admin/social-hub/`)

| Strona | Opis |
|--------|------|
| `index.astro` | Dashboard: lista briefów, metryki, szybkie akcje |
| `new.astro` | Kreator nowego posta: wybór źródła, formatu, platform |
| `[briefId].astro` | Widok briefu: copy review, media preview, publish |
| `accounts.astro` | Zarządzanie kontami social media (connect/disconnect) |
| `templates.astro` | Zarządzanie szablonami Satori (preview + edycja JSX) |
| `settings.astro` | Ustawienia: modele LLM, video provider, default hashtags |
| `analytics.astro` | Dashboard analityczny: engagement per platforma, per źródło |

---

## 5. UI FLOW — NAWIGACJA

```
  ADMIN SIDEBAR
  ├── Dashboard
  ├── Articles
  ├── GEO Monitor
  ├── Content Gaps
  ├── Reddit Intelligence
  ├── YouTube Intelligence
  ├── Brand Clarity
  └── Social Hub  ◄━━━━━ NOWY MODUŁ
       ├── 📋 Posts (lista briefów + statusy)
       ├── 📱 Accounts (podpięte konta)
       ├── 🎨 Templates (szablony Satori)
       ├── 📊 Analytics (dashboard metryczny)
       └── ⚙️ Settings (providery, modele, hashtags)
```

### Widok "New Post" (`new.astro`)

```
  ┌─────────────────────────────────────────────────────────────┐
  │  NEW SOCIAL POST                                             │
  │                                                              │
  │  ── Step 1: Wybierz źródło ──                               │
  │  [Dropdown: Artykuły | Pain Points | Klastry | KB | Gaps]   │
  │  [Search bar z autosuggest]                                  │
  │                                                              │
  │  ── Step 2: Kontekst źródła (readonly preview) ──           │
  │  Tytuł: "System chaos is killing your productivity"          │
  │  Intensywność: 9/10 | Emocja: frustration                   │
  │  Cytaty VoC: "I have notes in 5 different apps..."           │
  │  KB Match: [Frinter Deep Focus Method] [WholeBeing Design]   │
  │                                                              │
  │  ── Step 3: Suggestion Prompt ──                             │
  │  [Textarea: "Skup się na aspekcie ADHD i digital minimalism"]│
  │                                                              │
  │  ── Step 4: Format ──                                        │
  │  ( ) 📷 Grafika (Satori)     [wybierz szablon ▼]            │
  │  ( ) 🎬 Wideo (WaveSpeed)    [Wan 2.2 ▼]                   │
  │  ( ) 📝 Tekst (bez mediów)                                  │
  │                                                              │
  │  ── Step 5: Platformy & Konta ──                             │
  │  [✓] Instagram (@focus_daily, @deep_work_pl)                 │
  │  [✓] Threads (@focus_daily)                                  │
  │  [ ] TikTok                                                  │
  │  [✓] X (@fraborian)                                          │
  │                                                              │
  │  [  Generate Copy →  ]                                       │
  └─────────────────────────────────────────────────────────────┘
```

### Widok "Brief Detail" (`[briefId].astro`)

```
  ┌─────────────────────────────────────────────────────────────┐
  │  POST BRIEF #42                            Status: copy_review│
  │                                                              │
  │  ── Source ──                                                │
  │  Pain Point: "System chaos is killing your productivity"     │
  │  Suggestion: "Skup się na aspekcie ADHD..."                  │
  │                                                              │
  │  ── Generated Copy ──                                        │
  │  HOOK: "Your notes are in 5 apps. Your brain is in none."   │
  │  BODY: [editable textarea - admin może edytować]              │
  │  HASHTAGS: #productivity #ADHD #deepwork #focussprint        │
  │  CTA: "One system. All your thoughts. Link in bio."          │
  │                                                              │
  │  [ ✏️ Edit ] [ ✅ Approve Copy ] [ 🔄 Regenerate ]          │
  │                                                              │
  │  ── Media Preview ──                                          │
  │  [Rendered image preview 1080x1080]                           │
  │  Template: Retro Quote Card | Format: 1:1                    │
  │                                                              │
  │  [ ✅ Approve Media ] [ 🔄 Re-render ]                      │
  │                                                              │
  │  ── Publish ──                                               │
  │  Targets: IG @focus_daily, Threads @focus_daily, X @fraborian│
  │  Schedule: [ Now ▼ ] or [ Pick date/time ]                   │
  │                                                              │
  │  [  🚀 Publish Now  ]                                        │
  └─────────────────────────────────────────────────────────────┘
```

---

## 6. USTAWIENIA SYSTEMOWE (`/admin/social-hub/settings`)

### Sekcja: LLM Copywriter
- Model: `claude-sonnet-4-6` (dropdown, analogicznie do Brand Clarity)
- Extended Thinking Budget: `10000` tokenów
- Default Suggestion Prompt: textarea (globalny prefiks dodawany do każdego briefu)

### Sekcja: Video Generation
- Provider: `WaveSpeed` (radio)
- Model: `Wan 2.2 Ultra Fast` / `InfiniteTalk` (dropdown)
- TTS Provider: `ElevenLabs` / `Kokoro` (dropdown)
- Avatar Image URL: (upload lub URL do zdjęcia używanego w wideo)

### Sekcja: Distribution
- Provider: `Upload-Post.com`
- API Key: (masked input)
- Default Hashtags: chip editor (add/remove)
- Auto-schedule: toggle + default time slot

### Sekcja: Brand Voice
- Plik Brand Voice: `public/llms-full.txt` (readonly, link do edycji)
- Tone overrides: textarea (dodatkowe instrukcje stylowe)

---

## 7. SKRYPT COPYWRITER — MEGA-PROMPT

```
  AI COPYWRITER MEGA-PROMPT
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  SYSTEM PROMPT:                                              │
  │  Jesteś Social Media Copywriterem marki [authorName].       │
  │  Twój styl: [llms-full.txt excerpt — philosophy + voice].   │
  │  Grade 6 reading level. Max 15 słów per zdanie.             │
  │  Banned: leverage, revolutionary, innovative, game-changer. │
  │  Styl: bezpośredni, autentyczny, z elementami humoru.       │
  │                                                              │
  │  USER PROMPT:                                                │
  │  === ŹRÓDŁO ===                                              │
  │  [pełna treść artykułu/PP/klastra]                           │
  │                                                              │
  │  === BAZA WIEDZY ===                                         │
  │  [matched KB entries — max 3, sorted by importance]          │
  │                                                              │
  │  === SUGESTIA ADMINA ===                                     │
  │  [suggestion_prompt from admin — opcjonalne]                 │
  │                                                              │
  │  === PLATFORMA DOCELOWA ===                                  │
  │  [instagram: max 2200 znaków, hashtags 20-30]                │
  │  [threads: max 500, bez hashtags]                            │
  │  [twitter: max 280, 2-3 hashtags]                            │
  │                                                              │
  │  Generuj JSON:                                               │
  │  {                                                           │
  │    "hookLine": "...",                                        │
  │    "bodyText": "...",                                        │
  │    "hashtags": ["...", "..."],                                │
  │    "cta": "...",                                             │
  │    "imageLayoutDescription": "...",                          │
  │    "videoScript": "..." (tylko jeśli format=video)           │
  │  }                                                           │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

---

## 8. KONTEKST DLA AGENTÓW AUTONOMICZNYCH

> **UWAGA DLA AI AGENTÓW:** Ta sekcja zawiera kluczowe informacje o wzorcach, konwencjach i plikach referencyjnych projektu. Przeczytaj ją w całości PRZED rozpoczęciem implementacji jakiegokolwiek tasku SocialHub.

### 8.1 Wzorzec "Job Manager" (OBOWIĄZKOWY)
Każdy długotrwały proces w FrinterHero używa wzorca Singleton EventEmitter.

**Pliki referencyjne (CZYTAJ PRZED IMPLEMENTACJĄ):**
- `src/lib/bc-scrape-job.ts` — wzorzec klasy `XxxJobManager extends EventEmitter`
- `src/lib/yt-scrape-job.ts` — identyczny wzorzec dla YouTube

**Kluczowe zasady:**
1. Klasa dziedziczy po `EventEmitter`, emituje eventy: `start`, `line`, `progress`, `done`.
2. Singleton na `globalThis` — przetrwa Vite HMR: `globalThis.__frinter_sh_xxx_job`.
3. `spawn('npx', ['tsx', 'scripts/sh-xxx.ts'], { env: {...process.env, ...extraEnv}, shell: true })`.
4. Parsowanie stdout linia po linii: `pushLine()` z `BcLogEntry { line, ts }`.
5. Specjalne prefiksy: `RESULT_JSON:`, `QUOTA_EXCEEDED`, `commentsCollected:` — analogicznie SH powinien mieć `SH_COPY_READY:`, `SH_RENDER_DONE:`, `SH_ERROR:`.

### 8.2 Wzorzec "Settings" (OBOWIĄZKOWY)
Ustawienia modułu przechowywane w DB (1 wiersz, JSONB), nie w `.env`.

**Plik referencyjny:** `src/lib/bc-settings.ts`

**Kluczowe zasady:**
1. Interface `ShSettingsConfig` z defaultami (`SH_SETTINGS_DEFAULTS`).
2. `getShSettings()` — `db.select().from(shSettings).limit(1)`, fallback do defaults.
3. `saveShSettings(config)` — upsert (update if exists, insert if not).
4. `buildShEnv(config)` — konwertuje settings JSON na flat env vars dla child_process.

### 8.3 Wzorzec "LLM Client" (OBOWIĄZKOWY)
SocialHub powinien WSPÓŁDZIELIĆ `bc-llm-client.ts`, NIE tworzyć własnego klienta LLM.

**Plik referencyjny:** `src/lib/bc-llm-client.ts`

**Kluczowe zasady:**
1. Import: `import { callBcLlm, type BcLlmCallOptions } from '../lib/bc-llm-client'`.
2. Wspiera dwa providery: `openrouter` (default) i `anthropic` (z Extended Thinking).
3. Model selector: SH dodaje własne env vars: `SH_COPYWRITER_MODEL`, `SH_COPYWRITER_THINKING_BUDGET`.

### 8.4 Wzorzec "API Route" (OBOWIĄZKOWY)
Każdy endpoint API jest plikiem `.ts` w `src/pages/api/`.

**Pliki referencyjne:**
- `src/pages/api/brand-clarity/settings.ts` — GET/PUT single-row config
- `src/pages/api/brand-clarity/[projectId]/cluster-pain-points.ts` — POST triggering job

**Kluczowe zasady:**
1. Export `const prerender = false;` (SSR endpoint).
2. Astro API Handler: `export const GET/POST/PUT/DELETE: APIRoute = async ({ params, request }) => {...}`.
3. Zwracaj `new Response(JSON.stringify({...}), { status: 200, headers: { 'Content-Type': 'application/json' }})`.
4. Autoryzacja: sprawdzaj session cookie (patrz `src/pages/api/auth.ts`).

### 8.5 Wzorzec "Admin UI Page" (OBOWIĄZKOWY)
Strony admina używają Astro + inline `<script>` z vanilla JS (NIE React/Vue).

**Pliki referencyjne:**
- `src/pages/admin/brand-clarity/settings.astro` — formularz ustawień
- `src/pages/admin/brand-clarity/[id]/scrape.astro` — widok z SSE logami + przyciskami

**Kluczowe zasady:**
1. Layout: `import AdminLayout from '../../../layouts/AdminLayout.astro'`.
2. Dane serverowe: `const data = await fetch(...)` w frontmatter.
3. Interaktywność: `<script>` na dole pliku, `document.getElementById()`, `fetch()`.
4. Stylowanie: Tailwind CSS klasy.
5. SSE (Server-Sent Events): dla long-running jobs — `new EventSource('/api/social-hub/briefs/[id]/stream')`.

### 8.6 Schemat Bazy Danych — konwencje
**Plik:** `src/db/schema.ts` (jeden plik, ~489 linii)

**Zasady:**
1. Dodawaj tabele SH na KOŃCU pliku, po komentarzu `// ========================================`.
2. Prefiks: `sh` w nazwie exportu TypeScript, `sh_` w nazwie tabeli SQL.
3. `onDelete: 'cascade'` dla relacji parent-child, `'set null'` dla optional references.
4. Indexy: dodawaj dla kolumn używanych w WHERE/ORDER BY (status, briefId, platform).

### 8.7 Istniejące tabele źródłowe — jak czytać dane
Agent MUSI wiedzieć skąd brać dane dla `sh-source-loader.ts`:

| sourceType | Tabela | Klucz | Pola do snapshot |
|---|---|---|---|
| `article` | `articles` | `id` | `title`, `content`, `description`, `tags` |
| `pain_point` | `bcExtractedPainPoints` | `id` | `painPointTitle`, `painPointDescription`, `vocData`, `customerLanguage`, `category`, `emotionalIntensity` |
| `pain_cluster` | `bcPainClusters` | `id` | `clusterTheme`, `dominantEmotion`, `bestQuotes`, `synthesizedProblemLabel`, `synthesizedSuccessVision` |
| `content_gap` | `contentGaps` | `id` | `gapTitle`, `gapDescription`, `suggestedAngle` |
| `kb_entry` | `knowledgeEntries` | `id` | `title`, `content`, `tags`, `type` |
| `reddit_gap` | `redditExtractedGaps` | `id` | `painPointTitle`, `painPointDescription`, `vocabularyQuotes`, `category` |
| `yt_gap` | `ytExtractedGaps` | `id` | `painPointTitle`, `painPointDescription`, `vocabularyQuotes`, `category` |

### 8.8 Zewnętrzne API — kontrakty

**WaveSpeed API (Video):**
- Endpoint: `POST https://api.wavespeed.ai/api/v3/predictions`
- Auth: `Authorization: Bearer {WAVESPEED_API_KEY}`
- Request body: `{ model_id, input: { audio_url, image_url, duration } }`
- Response: `{ id, status, output: { video_url } }`
- Polling: `GET /api/v3/predictions/{id}` until `status === 'completed'`

**Upload-Post API (Distribution):**
- Endpoint: `POST https://api.upload-post.com/api/upload`
- Auth: `Authorization: Apikey {UPLOADPOST_API_KEY}`
- Body: FormData z `video`, `title`, `user`, `platform[]`
- Wspierane platforms: `tiktok`, `instagram`, `youtube`, `facebook`, `linkedin`, `threads`, `twitter`, `pinterest`, `reddit`, `bluesky`

**ElevenLabs TTS (Audio):**
- Endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- Auth: `xi-api-key: {ELEVENLABS_API_KEY}`
- Body: `{ text, model_id: 'eleven_multilingual_v2' }`
- Response: binary audio/mpeg stream

---

## 9. ATOMOWE TASKI — PEŁNA LISTA

### FAZA 1: Fundament (DB + Settings + Accounts)

#### 1.1 Schema & Migracja
- [ ] **T-1.1.1** Dodaj komentarz sekcji `// ========================================\n// SocialHub Module\n// ========================================` na końcu `src/db/schema.ts`
- [ ] **T-1.1.2** Zdefiniuj tabelę `shSettings` w `src/db/schema.ts` (wg schematu z §3)
- [ ] **T-1.1.3** Zdefiniuj tabelę `shSocialAccounts` w `src/db/schema.ts`
- [ ] **T-1.1.4** Zdefiniuj tabelę `shContentBriefs` w `src/db/schema.ts`
- [ ] **T-1.1.5** Zdefiniuj tabelę `shGeneratedCopy` w `src/db/schema.ts`
- [ ] **T-1.1.6** Zdefiniuj tabelę `shTemplates` w `src/db/schema.ts`
- [ ] **T-1.1.7** Zdefiniuj tabelę `shMediaAssets` w `src/db/schema.ts`
- [ ] **T-1.1.8** Zdefiniuj tabelę `shPublishLog` w `src/db/schema.ts`
- [ ] **T-1.1.9** Zdefiniuj tabelę `shPostMetrics` w `src/db/schema.ts`
- [ ] **T-1.1.10** Uruchom `npx drizzle-kit generate` i zweryfikuj SQL migracji
- [ ] **T-1.1.11** Uruchom `npx drizzle-kit push` na Railway DB (lub lokalnie)

#### 1.2 Settings Service
- [ ] **T-1.2.1** Stwórz `src/lib/sh-settings.ts` — interface `ShSettingsConfig`, defaults `SH_SETTINGS_DEFAULTS`
- [ ] **T-1.2.2** Implementuj `getShSettings()` (analogicznie do `getBcSettings()`)
- [ ] **T-1.2.3** Implementuj `saveShSettings(config)` (upsert pattern)
- [ ] **T-1.2.4** Implementuj `buildShEnv(config)` — konwersja na env vars dla child_process

#### 1.3 Settings API
- [ ] **T-1.3.1** Stwórz `src/pages/api/social-hub/settings.ts` — GET handler
- [ ] **T-1.3.2** Dodaj PUT handler do `settings.ts` — walidacja + `saveShSettings()`

#### 1.4 Accounts API
- [ ] **T-1.4.1** Stwórz `src/pages/api/social-hub/accounts/index.ts` — GET (lista) + POST (dodaj)
- [ ] **T-1.4.2** Stwórz `src/pages/api/social-hub/accounts/[id].ts` — DELETE + PUT (toggle active)

#### 1.5 Settings UI
- [ ] **T-1.5.1** Stwórz `src/pages/admin/social-hub/settings.astro` — formularz z sekcjami: LLM, Video, Distribution, Brand Voice
- [ ] **T-1.5.2** Dodaj `<script>` do settings.astro — fetch GET on load, PUT on submit, toast feedback

#### 1.6 Accounts UI
- [ ] **T-1.6.1** Stwórz `src/pages/admin/social-hub/accounts.astro` — lista kont z toggle active, przycisk usuń
- [ ] **T-1.6.2** Dodaj modal "Add Account" — formularz: platform (dropdown), accountName, accountHandle
- [ ] **T-1.6.3** Dodaj `<script>` — CRUD fetch do `/api/social-hub/accounts`

#### 1.7 Navigation
- [ ] **T-1.7.1** Dodaj "Social Hub" do sidebar w `AdminLayout.astro` (ikona: share/megaphone, href: `/admin/social-hub`)
- [ ] **T-1.7.2** Dodaj sub-links: Posts, Accounts, Templates, Analytics, Settings

### FAZA 2: Source Loader + Brief Creator

#### 2.1 Source Loader
- [ ] **T-2.1.1** Stwórz `src/lib/sh-source-loader.ts` — eksportuj `loadSource(sourceType: string, sourceId: number): Promise<ShSourceData>`
- [ ] **T-2.1.2** Implementuj case `article` — query `articles` by id, zwróć `{ title, content, description, tags }`
- [ ] **T-2.1.3** Implementuj case `pain_point` — query `bcExtractedPainPoints`, zwróć pola z vocData
- [ ] **T-2.1.4** Implementuj case `pain_cluster` — query `bcPainClusters`, zwróć theme + quotes + visions
- [ ] **T-2.1.5** Implementuj case `content_gap` — query `contentGaps`
- [ ] **T-2.1.6** Implementuj case `kb_entry` — query `knowledgeEntries`
- [ ] **T-2.1.7** Implementuj case `reddit_gap` — query `redditExtractedGaps`
- [ ] **T-2.1.8** Implementuj case `yt_gap` — query `ytExtractedGaps`
- [ ] **T-2.1.9** Dodaj `formatSourceForPrompt(source: ShSourceData): string` — ujednolicony tekst do mega-prompta

#### 2.2 KB Matcher
- [ ] **T-2.2.1** Stwórz `src/lib/sh-kb-matcher.ts` — eksportuj `matchKbEntries(text: string, limit: number): Promise<KnowledgeEntry[]>`
- [ ] **T-2.2.2** Implementuj fulltext search po `knowledgeEntries.content` i `knowledgeEntries.title` (PostgreSQL `ILIKE` lub `to_tsvector`)
- [ ] **T-2.2.3** Sortuj wyniki po `importanceScore` DESC, zwróć top N

#### 2.3 Sources API
- [ ] **T-2.3.1** Stwórz `src/pages/api/social-hub/sources.ts` — GET endpoint zwracający ujednoliconą listę źródeł
- [ ] **T-2.3.2** Implementuj query do 7 tabel źródłowych, zwróć `{ sourceType, sourceId, title, preview, metadata }`
- [ ] **T-2.3.3** Dodaj parametr `?type=article|pain_point|...` do filtrowania
- [ ] **T-2.3.4** Dodaj parametr `?search=text` do przeszukiwania tytułów

#### 2.4 Briefs API
- [ ] **T-2.4.1** Stwórz `src/pages/api/social-hub/briefs/index.ts` — GET (lista z paginacją offset+limit) + POST (create brief)
- [ ] **T-2.4.2** W POST: wywołaj `loadSource()`, `matchKbEntries()`, zapisz `sourceSnapshot` do DB
- [ ] **T-2.4.3** Stwórz `src/pages/api/social-hub/briefs/[id].ts` — GET (szczegóły z joined copy + media + publish logs)

#### 2.5 Brief Creator UI
- [ ] **T-2.5.1** Stwórz `src/pages/admin/social-hub/new.astro` — layout z 5 sekcjami (steps)
- [ ] **T-2.5.2** Step 1 UI: dropdown sourceType + search input z autosuggest (fetch `/api/social-hub/sources?type=X&search=Y`)
- [ ] **T-2.5.3** Step 2 UI: readonly preview wybranego źródła (title, preview text, metadata badges)
- [ ] **T-2.5.4** Step 3 UI: textarea suggestionPrompt z placeholderem
- [ ] **T-2.5.5** Step 4 UI: radio buttons format (image/video/text) + conditional template/model dropdowns
- [ ] **T-2.5.6** Step 5 UI: checkbox grid platform×konto (fetch `/api/social-hub/accounts`)
- [ ] **T-2.5.7** Submit button: POST do `/api/social-hub/briefs`, redirect do `[briefId].astro`

#### 2.6 Briefs List UI
- [ ] **T-2.6.1** Stwórz `src/pages/admin/social-hub/index.astro` — tabela briefów z kolumnami: ID, Source, Format, Status, Date, Actions
- [ ] **T-2.6.2** Dodaj status badges (kolorowe chipy per status: draft=gray, generating=yellow, published=green)
- [ ] **T-2.6.3** Dodaj przycisk "+ New Post" (link do `/admin/social-hub/new`)
- [ ] **T-2.6.4** Dodaj filtrowanie po statusie i typie źródła

### FAZA 3: AI Copywriter

#### 3.1 Copywriter Script
- [ ] **T-3.1.1** Stwórz `scripts/sh-copywriter.ts` — czyta env vars `SH_BRIEF_ID`
- [ ] **T-3.1.2** Implementuj ładowanie briefu + sourceSnapshot + kbEntries z DB
- [ ] **T-3.1.3** Implementuj ładowanie brand voice z `public/llms-full.txt` (read file → string)
- [ ] **T-3.1.4** Implementuj budowanie mega-prompta (system + source + KB + suggestion + format instructions)
- [ ] **T-3.1.5** Wywołaj `callBcLlm()` z poprawnym modelem i thinkingBudget
- [ ] **T-3.1.6** Parsuj odpowiedź JSON: `{ hookLine, bodyText, hashtags, cta, imageLayoutDescription, videoScript }`
- [ ] **T-3.1.7** Zapisz wynik do `shGeneratedCopy` + zaktualizuj brief status na `copy_review`
- [ ] **T-3.1.8** Wypisz `RESULT_JSON:{...}` na stdout (pattern z bc-scrape-job.ts)

#### 3.2 Copywriter Job Manager
- [ ] **T-3.2.1** Stwórz `src/lib/sh-copywriter-job.ts` — klasa `ShCopywriterJobManager extends EventEmitter`
- [ ] **T-3.2.2** Implementuj singleton na `globalThis.__frinter_sh_copywriter_job`
- [ ] **T-3.2.3** Implementuj `start(briefId, extraEnv)` — spawn `scripts/sh-copywriter.ts`
- [ ] **T-3.2.4** Implementuj `getSnapshot()`, `isRunning()`, `stop()`

#### 3.3 Copywriter API
- [ ] **T-3.3.1** Stwórz `src/pages/api/social-hub/briefs/[id]/generate-copy.ts` — POST, uruchom job, zwróć status
- [ ] **T-3.3.2** Stwórz `src/pages/api/social-hub/briefs/[id]/copy.ts` — PUT (admin edytuje hookLine/bodyText/hashtags, zatwierdza/odrzuca)
- [ ] **T-3.3.3** Stwórz `src/pages/api/social-hub/briefs/[id]/stream.ts` — SSE z logami job managera (EventSource)

#### 3.4 Copywriter UI
- [ ] **T-3.4.1** Stwórz `src/pages/admin/social-hub/[briefId].astro` — widok briefu (pełny layout)
- [ ] **T-3.4.2** Sekcja "Source": readonly display źródła + suggestion prompt
- [ ] **T-3.4.3** Sekcja "Generated Copy": edytowalne pola hookLine, bodyText, hashtags (chip editor), cta
- [ ] **T-3.4.4** Przyciski: `[✏️ Edit]`, `[✅ Approve Copy]`, `[🔄 Regenerate]`
- [ ] **T-3.4.5** SSE console: log generacji w real-time (jak scrape.astro)

### FAZA 4: Media Rendering

#### 4.1 Satori Image Generator
- [ ] **T-4.1.1** Uruchom `npm install satori @resvg/resvg-js satori-html`
- [ ] **T-4.1.2** Stwórz `src/lib/sh-image-gen.ts` — eksportuj `renderSocialImage(opts): Promise<Buffer>`
- [ ] **T-4.1.3** Implementuj ładowanie czcionek (woff2 z `public/fonts/`) — `readFileSync` w init
- [ ] **T-4.1.4** Implementuj `renderSocialImage()`: `satori(markup, { width, height, fonts })` → SVG string
- [ ] **T-4.1.5** Implementuj konwersję SVG → PNG: `new Resvg(svg).render().asPng()`
- [ ] **T-4.1.6** Implementuj upload PNG do storage (S3 / Cloudinary / Railway Volume)
- [ ] **T-4.1.7** Stwórz 3 domyślne szablony JSX: `retro-quote-card` (1080×1080), `pain-point-story` (1080×1920), `tip-card` (1080×1080)
- [ ] **T-4.1.8** Seed szablony do tabeli `shTemplates` (insert default templates on first run)

#### 4.2 WaveSpeed Video Generator
- [ ] **T-4.2.1** Stwórz `src/lib/sh-video-gen.ts` — eksportuj `requestVideoRender(opts): Promise<string>` (zwraca prediction ID)
- [ ] **T-4.2.2** Implementuj `generateTtsAudio(text, voiceId): Promise<string>` (ElevenLabs → upload audio → zwróć URL)
- [ ] **T-4.2.3** Implementuj `submitToWaveSpeed(audioUrl, avatarImageUrl, model): Promise<string>` (POST → prediction ID)
- [ ] **T-4.2.4** Implementuj `pollWaveSpeedStatus(predictionId): Promise<{ status, videoUrl }>` (GET polling co 5s)
- [ ] **T-4.2.5** Implementuj `downloadAndStore(videoUrl): Promise<string>` (download MP4 → upload do storage → zwróć trwały URL)

#### 4.3 Video Render Script
- [ ] **T-4.3.1** Stwórz `scripts/sh-video-render.ts` — czyta `SH_BRIEF_ID`, `SH_COPY_ID` z env
- [ ] **T-4.3.2** Implementuj pipeline: load copy → TTS → WaveSpeed → poll → download → store → update DB
- [ ] **T-4.3.3** Wypisuj statusy: `SH_TTS_DONE:`, `SH_VIDEO_SUBMITTED:`, `SH_RENDER_DONE:{url}`, `SH_ERROR:{msg}`

#### 4.4 Video Job Manager
- [ ] **T-4.4.1** Stwórz `src/lib/sh-video-job.ts` — klasa `ShVideoJobManager extends EventEmitter` (singleton pattern)
- [ ] **T-4.4.2** Implementuj `start(briefId, copyId, extraEnv)` — spawn script

#### 4.5 Render API
- [ ] **T-4.5.1** Stwórz `src/pages/api/social-hub/briefs/[id]/render.ts` — POST: route do Satori (sync) lub WaveSpeed (async job)
- [ ] **T-4.5.2** Dla image: wywołaj `renderSocialImage()`, zapisz do `shMediaAssets`, zwróć URL inline
- [ ] **T-4.5.3** Dla video: uruchom `shVideoJob.start()`, zwróć `{ status: 'rendering', jobId }`

#### 4.6 Templates API & UI
- [ ] **T-4.6.1** Stwórz `src/pages/api/social-hub/templates.ts` — GET (lista) + POST (create)
- [ ] **T-4.6.2** Stwórz `src/pages/admin/social-hub/templates.astro` — grid szablonów z preview + edytor JSX (textarea)
- [ ] **T-4.6.3** Dodaj przycisk "Preview" — renderuje szablon z sample data i wyświetla inline

#### 4.7 Media Preview UI
- [ ] **T-4.7.1** Dodaj sekcję "Media Preview" do `[briefId].astro` — wyświetla wygenerowany obraz/wideo
- [ ] **T-4.7.2** Przyciski: `[✅ Approve Media]`, `[🔄 Re-render]`, `[🎨 Change Template]`

### FAZA 5: Publishing

#### 5.1 Distributor Service
- [ ] **T-5.1.1** Stwórz `src/lib/sh-distributor.ts` — eksportuj `publishToAccount(assetUrl, copy, account): Promise<UploadPostResponse>`
- [ ] **T-5.1.2** Implementuj `buildFormData(mediaUrl, caption, platform): FormData` z adaptacją per platforma
- [ ] **T-5.1.3** Implementuj `publishToUploadPost(formData): Promise<{ postId, postUrl }>` (fetch POST)
- [ ] **T-5.1.4** Implementuj `publishBrief(briefId): Promise<ShPublishLog[]>` — iteruj po kontach, wywołaj publish, zapisz logi

#### 5.2 Publish API
- [ ] **T-5.2.1** Stwórz `src/pages/api/social-hub/briefs/[id]/publish.ts` — POST: `publishBrief()`, zwróć logi
- [ ] **T-5.2.2** Obsłuż scheduling: jeśli `scheduledFor` podany, zapisz log ze statusem `scheduled` (cron job wyśle później)

#### 5.3 Publish UI
- [ ] **T-5.3.1** Dodaj sekcję "Publish" do `[briefId].astro` — lista targetów z checkboxami, date/time picker
- [ ] **T-5.3.2** Przycisk `[🚀 Publish Now]` — fetch POST do `/api/social-hub/briefs/[id]/publish`
- [ ] **T-5.3.3** Po publikacji: wyświetl linki do postów na platformach (klikalne)

### FAZA 6: Analytics

- [ ] **T-6.1** Stwórz `src/pages/api/social-hub/briefs/[id]/metrics.ts` — GET: fetch metrics z Upload-Post API, zapisz do `shPostMetrics`
- [ ] **T-6.2** Stwórz `src/pages/api/social-hub/analytics.ts` — GET: agregaty (total posts, avg engagement, top platform)
- [ ] **T-6.3** Stwórz `src/pages/admin/social-hub/analytics.astro` — dashboard z wykresami (bar chart engagement per platform, top 10 posts by likes)
- [ ] **T-6.4** Dodaj mini-metrics do `[briefId].astro` — inline display views/likes/comments per publish log

---

## 10. DODATKOWE FEATURES (SUGESTIE WŁASNE)

### 🗓️ Feature: Content Calendar
**Co:** Widok kalendarza miesięcznego z zaplanowanymi postami.
**Dlaczego:** Admin widzi na jednym ekranie, kiedy i co idzie na platformy — unika "czarnych dziur" bez contentu.
**Implementacja:**
- [ ] **T-X.1** Stwórz `src/pages/admin/social-hub/calendar.astro` — grid 7×5 (dni tygodnia × tygodnie)
- [ ] **T-X.2** Query `shPublishLog` WHERE `scheduledFor` BETWEEN month_start AND month_end
- [ ] **T-X.3** Dodaj drag & drop do przesuwania postów między dniami (JS `dragstart`/`drop` + PUT API)

### 🔀 Feature: A/B Copy Variants
**Co:** AI generuje 2-3 warianty copy (różne hooki) zamiast jednego. Admin wybiera najlepszy lub puszcza oba jako A/B test.
**Dlaczego:** Testowanie hooków to klucz do wiralności — nigdy nie wiadomo, co "chwyci".
**Implementacja:**
- [ ] **T-X.4** Dodaj kolumnę `variantIndex` (integer) do `shGeneratedCopy` (0 = primary, 1 = alt, 2 = alt2)
- [ ] **T-X.5** Zmodyfikuj mega-prompt: "Generuj 3 warianty: aggressive, empathetic, humorous"
- [ ] **T-X.6** UI: karuzela wariantów w `[briefId].astro` z przyciskiem "Use This One"

### 🎠 Feature: Carousel Generator (Multi-Image)
**Co:** Zamiast jednej grafiki, generuj karuzele (np. 5 slajdów) — idealnie dla Instagrama i LinkedIna.
**Dlaczego:** Karuzele mają 2-3x wyższy engagement niż single-image posty (standard rynkowy).
**Implementacja:**
- [ ] **T-X.7** Dodaj `outputFormat = 'carousel'` do `shContentBriefs`
- [ ] **T-X.8** Mega-prompt generuje `slides: [{ hookLine, bodyText }]` zamiast single copy
- [ ] **T-X.9** Satori renderuje N slajdów z numeracją (1/5, 2/5...) jako osobne PNG
- [ ] **T-X.10** Upload-Post: wyślij array obrazów w jednym POST (carousel post)

### 🔁 Feature: Repurpose Chain
**Co:** Jeden pain point → automatycznie generuje 3 formaty: grafikę (feed), story (9:16), tekst (Threads). Admin zatwierdza paczkę jednym kliknięciem.
**Dlaczego:** Eliminuje ręczne tworzenie 3 briefów dla tego samego contentu.
**Implementacja:**
- [ ] **T-X.11** Dodaj przycisk "Repurpose" w widoku Pain Pointu → tworzy 3 briefs automatycznie (image 1:1, image 9:16, text)
- [ ] **T-X.12** Linkuj briefs jako `repurposeGroupId` (kolumna w `shContentBriefs`)
- [ ] **T-X.13** UI: widok grupy — approve/publish all at once

### ⏱️ Feature: Queue System (Batch Processing)
**Co:** Zamiast tworzyć posty jeden po drugim, admin dodaje 10-20 pain pointów do kolejki. System generuje copy + render + publish sekwencyjnie.
**Dlaczego:** Przy 15 kontach i 30 pain pointach ręczne tworzenie to godziny pracy.
**Implementacja:**
- [ ] **T-X.14** Stwórz tabelę `shQueue` (`id`, `briefId`, `priority`, `status`, `processedAt`)
- [ ] **T-X.15** Stwórz `src/lib/sh-queue-processor.ts` — worker: pobiera next pending z queue, uruchamia pipeline
- [ ] **T-X.16** UI: przycisk "Add to Queue" w widoku Pain Points Base + bulk select
- [ ] **T-X.17** UI: widok kolejki z progress barem i logami

---

## 11. ZALEŻNOŚCI (npm)

| Pakiet | Wersja | Rola |
|--------|--------|------|
| `satori` | `^0.10+` | JSX → SVG rendering |
| `@resvg/resvg-js` | `^2.6+` | SVG → PNG conversion |
| `satori-html` | `^0.3+` | HTML string → satori-compatible VDOM |

*WaveSpeed, Upload-Post, ElevenLabs: czyste `fetch` — brak dodatkowych SDK.*

---

## 12. KONFIGURACJA (`.env.local`)

```ini
# SocialHub — Video Generation
WAVESPEED_API_KEY=ws_placeholder

# SocialHub — TTS (Text-to-Speech)
ELEVENLABS_API_KEY=el_placeholder

# SocialHub — Distribution
UPLOADPOST_API_KEY=up_placeholder

# SocialHub — LLM (współdzielony z Brand Clarity)
# ANTHROPIC_API_KEY i OPENROUTER_API_KEY już są w .env
```

*Reszta konfiguracji (modele, hashtags, tone) — w panelu admina `/admin/social-hub/settings`.*
