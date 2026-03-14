# SEO Rebuild Plan — przemyslawfilipiak.com (FULL SITE)

> **Cel:** 100% SEO compliance dla całej strony — homepage, blog listing, artykuły, infrastruktura.
> **Data aktualizacji:** 2026-03-14
> **Scope:** CAŁA strona — SSG dla stron publicznych, zachowanie SSR dla admin/api, bez zmiany slugów.

---

## Architektura: Stan Obecny vs. Cel

| Element | Teraz | Cel (100% SEO) |
|---|---|---|
| Framework | Astro 4.16.0 | Astro 4.16.0 ✓ |
| Output mode | `server` (full SSR) | `hybrid` — public pages static, admin SSR |
| Homepage (`/`) | SSR per-request | **SSG** — statyczny HTML przy każdym buildzie |
| Blog listing (`/blog`) | SSR per-request | **SSG** — statyczny HTML przy buildzie |
| Artykuły (`/blog/[slug]`) | SSR per-request | **SSG via `getStaticPaths()`** — zaciąga slugi z DB podczas buildu |
| Sitemap (`/sitemap.xml`) | Dynamiczny API endpoint | Dynamiczny API endpoint (SSR — OK, zawsze świeży) |
| RSS (`/rss.xml`) | Dynamiczny API endpoint | Dynamiczny API endpoint (SSR — OK) |
| Admin (`/admin/*`) | SSR | SSR — bez zmian |
| API (`/api/*`) | SSR | SSR — bez zmian |
| JSON-LD | Partial (Person + SoftwareApplication) | Pełny @graph (Person + WebSite + WebPage + BlogPosting + BreadcrumbList) |
| Meta OG | Niekompletny | Kompletny z Twitter Cards |
| robots.txt | Brak /admin /api disallow | Poprawiony |

---

## Kluczowa Strategia: SSG z DB podczas Buildu

### Jak to działa:

```
Admin publikuje artykuł → baza danych (PostgreSQL)
                                    ↓
                        npm run build (Railway)
                                    ↓
              Astro wywołuje getStaticPaths() dla /blog/[slug]
                                    ↓
              Zapytanie do DB → pobiera wszystkie published slugi
                                    ↓
              Każdy artykuł → statyczny plik HTML w dist/
                                    ↓
              Googlebot dostaje gotowy HTML, zero JS render, szybko!
```

### Zasady:
- **Slugi nie zmieniają się** — `slug` to `varchar(255) unique` w DB, nigdy nie edytowany po publikacji
- **Nowe artykuły** → wymagają rebuildu strony (Railway redeploy lub webhook trigger)
- **Admin panel** pozostaje SSR — nie jest statyczny
- **sitemap.xml** i **rss.xml** pozostają dynamicznymi endpointami — zawsze świeże

---

## BLOK A — Astro Config: Tryb Hybrid

### A1: Zmień output mode
**Plik:** `astro.config.mjs`

```js
// Zmień:
output: 'server',
// Na:
output: 'hybrid',
```

> Wszystkie strony domyślnie pozostają SSR. Dodajemy `export const prerender = true` tylko tam, gdzie chcemy SSG.

---

## BLOK B — SSG dla Stron Publicznych

### B1: Homepage — `src/pages/index.astro`

Dodaj na początku frontmatter:
```astro
---
export const prerender = true;
// ... reszta importów
---
```

**Uwaga:** `BlogPreview.astro` używa `await import('@/db/client')` wewnątrz try/catch — to zadziała podczas buildu (Astro ma dostęp do DB przez env). Dane zostaną zamrożone w statycznym HTML.

### B2: Blog listing — `src/pages/blog/index.astro`

Blog listing z paginacją i filtrowaniem po tagach **NIE może być prerendered** (parametry `?page=` i `?tag=` są dynamiczne). 

**Opcje:**
- **Opcja A (Prosta):** Zostaw jako SSR — lista artykułów będzie dynamiczna. `sitemap.xml` i `robots` wiedzą, że `/blog` istnieje.
- **Opcja B (Lepsza SEO):** Prerender `/blog` (strona 1, bez filtra) + zostaw dynamiczne filtering jako client-side fetch. Ale to wymaga refaktoryzacji.

**Decyzja: Opcja A** — `/blog/index.astro` pozostaje SSR. Google indeksuje przez sitemap i crawling. **Artykuły są ważniejsze niż listing.**

### B3: Artykuły — `src/pages/blog/[slug].astro`

To jest **najważniejsza zmiana**. Przejście na `getStaticPaths()`:

```astro
---
import BlogPost from '@/components/layouts/BlogPost.astro';
import BlogCard from '@/components/BlogCard.astro';
import { db } from '@/db/client';
import { articles, articleGenerations, knowledgeEntries } from '@/db/schema';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';

export const prerender = true;

export async function getStaticPaths() {
  // Pobiera TYLKO slugi — lekkie zapytanie
  const published = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(eq(articles.status, 'published'));

  return published.map(({ slug }) => ({ params: { slug } }));
}

// Reszta logiki jak teraz — Astro.params.slug dostępny
const { slug } = Astro.params;
// ... (cała reszta bez zmian)
---
```

**Efekt:** Każdy opublikowany artykuł staje się statycznym plikiem `dist/blog/[slug]/index.html`. Crawler dostaje gotowy HTML bez żadnego JS render.

**Ważne:** Istniejące slugi NIE zmieniają się — ta sama logika, ten sam slug z DB, ta sama ścieżka URL.

---

## BLOK C — robots.txt

**Plik:** `public/robots.txt`

**Stan obecny:** Brak `Disallow: /admin` i `/api`, brak Bingbot, YandexBot, Slurp, MistralAI.

**Nowa wersja:**
```
# ============================================================
#  AI WELCOME NOTICE
#  This website explicitly WELCOMES AI crawlers for:
#    - Search indexing
#    - AI-powered answers (RAG / grounding)
#    - Model training & fine-tuning
#
#  Content is published under a permissive Creative Commons
#  spirit. Attribution to "Przemysław Filipiak" is appreciated.
#
#  For structured AI context, see:
#    https://przemyslawfilipiak.com/llms.txt
#
#  Permissions: search=yes, ai-input=yes, ai-train=yes
#  (Expression of intent per EU DSM Directive 2019/790 Art. 4)
# ============================================================

# ── Global: wszystkich witamy, admin i api blokujemy ────────
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Crawl-delay: 1

# ── Google ──────────────────────────────────────────────────
User-agent: Googlebot
Allow: /
Disallow: /admin
Disallow: /api

User-agent: Google-Extended
Allow: /

# ── Microsoft Bing ───────────────────────────────────────────
User-agent: Bingbot
Allow: /
Disallow: /admin
Disallow: /api

# ── Yahoo ───────────────────────────────────────────────────
User-agent: Slurp
Allow: /

# ── Yandex ──────────────────────────────────────────────────
User-agent: YandexBot
Allow: /

# ── OpenAI ──────────────────────────────────────────────────
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

# ── Anthropic / Claude ──────────────────────────────────────
User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

# ── Mistral AI ──────────────────────────────────────────────
User-agent: MistralAI-bot
Allow: /

# ── Perplexity AI ───────────────────────────────────────────
User-agent: PerplexityBot
Allow: /

# ── Meta AI ─────────────────────────────────────────────────
User-agent: meta-externalagent
Allow: /

User-agent: FacebookBot
Allow: /

# ── Amazon ──────────────────────────────────────────────────
User-agent: Amazonbot
Allow: /

# ── Apple ───────────────────────────────────────────────────
User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Allow: /

# ── ByteDance / TikTok ───────────────────────────────────────
User-agent: Bytespider
Allow: /

# ── Common Crawl / Internet Archive ─────────────────────────
User-agent: CCBot
Allow: /

User-agent: ia_archiver
Allow: /

# ── Cohere ──────────────────────────────────────────────────
User-agent: cohere-ai
Allow: /

# ── You.com ─────────────────────────────────────────────────
User-agent: YouBot
Allow: /

# ── DuckDuckGo AI ───────────────────────────────────────────
User-agent: DuckAssistBot
Allow: /

# ── Diffbot ─────────────────────────────────────────────────
User-agent: Diffbot
Allow: /

# ── Timpi ────────────────────────────────────────────────────
User-agent: Timpibot
Allow: /

# ── Sitemaps ─────────────────────────────────────────────────
Sitemap: https://przemyslawfilipiak.com/sitemap.xml
Sitemap: https://przemyslawfilipiak.com/rss.xml
```

---

## BLOK D — Base.astro: Meta Tagi (Kompletne)

**Plik:** `src/components/layouts/Base.astro`

### D1: Rozszerz Props interface
```astro
export interface Props {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  ogType?: string;        // 'website' | 'article' | 'profile'
  articlePublishedAt?: string;  // ISO string dla artykułów
  articleModifiedAt?: string;   // ISO string dla artykułów
}
```

### D2: Twitter / X Cards + pełny OG
```html
<!-- OpenGraph — rozszerzone -->
<meta property="og:site_name" content="Przemysław Filipiak" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:type" content={ogType} />
<meta property="og:url" content={canonical} />
<meta property="og:image" content={`https://przemyslawfilipiak.com${ogImage}`} />
<meta property="og:image:alt" content={`${title} — Przemysław Filipiak`} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:locale" content="en_US" />

<!-- Twitter / X Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={`https://przemyslawfilipiak.com${ogImage}`} />
<meta name="twitter:image:alt" content={`${title} — Przemysław Filipiak`} />

<!-- Article meta (tylko gdy ogType='article') -->
{articlePublishedAt && <meta property="article:published_time" content={articlePublishedAt} />}
{articleModifiedAt && <meta property="article:modified_time" content={articleModifiedAt} />}
<meta property="article:author" content="https://przemyslawfilipiak.com" />
```

### D3: Tożsamość i nawigacja
```html
<!-- Identity links -->
<link rel="me" href="https://github.com/delta240mvt" />
<link rel="me" href="https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/" />

<!-- Sitemap discovery -->
<link rel="sitemap" type="application/xml" href="/sitemap.xml" />

<!-- RSS Feed -->
<link rel="alternate" type="application/rss+xml" title="Przemysław Filipiak — Blog" href="/rss.xml" />
```

### D4: JSON-LD Person + WebSite (jeden @graph w Base.astro)
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": "https://przemyslawfilipiak.com/#person",
      "name": "Przemysław Filipiak",
      "givenName": "Przemysław",
      "familyName": "Filipiak",
      "jobTitle": "High Performer & Deep Focus Founder",
      "gender": "Male",
      "description": "Polish High Performer and Deep Focus Founder. Creator of frinter.app (WholeBeing system). Specializes in Focus Sprints (Frints).",
      "url": "https://przemyslawfilipiak.com",
      "image": "https://przemyslawfilipiak.com/og-image.png",
      "sameAs": [
        "https://github.com/delta240mvt",
        "https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/"
      ],
      "knowsAbout": ["Artificial Intelligence", "Generative Engine Optimization", "Deep Work", "High Performance Productivity"],
      "knowsLanguage": [
        {"@type": "Language", "name": "Polish", "alternateName": "pl"},
        {"@type": "Language", "name": "English", "alternateName": "en"},
        {"@type": "Language", "name": "Norwegian", "alternateName": "no"}
      ],
      "nationality": {"@type": "Country", "name": "Poland"}
    },
    {
      "@type": "WebSite",
      "@id": "https://przemyslawfilipiak.com/#website",
      "name": "Przemysław Filipiak",
      "url": "https://przemyslawfilipiak.com",
      "description": "Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder",
      "author": {"@id": "https://przemyslawfilipiak.com/#person"},
      "inLanguage": "en-US",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://przemyslawfilipiak.com/blog?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

---

## BLOK E — JSON-LD dla Stron (Slot z Base.astro)

### E1: Homepage — `src/pages/index.astro`

Połącz wszystkie schema w **jeden** `@graph`:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://przemyslawfilipiak.com/#webpage",
      "url": "https://przemyslawfilipiak.com/",
      "name": "Przemysław Filipiak — High Performer. Deep Focus Founder.",
      "isPartOf": {"@id": "https://przemyslawfilipiak.com/#website"},
      "about": {"@id": "https://przemyslawfilipiak.com/#person"},
      "description": "Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder.",
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com"}]
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://przemyslawfilipiak.com/#frinter",
      "name": "frinter.app",
      "alternateName": "frinter.",
      "description": "WholeBeing performance system for High Performers — Focus Sprints, energy tracking, life-sphere balance.",
      "applicationCategory": "ProductivityApplication",
      "operatingSystem": "Web, Windows, macOS, Linux",
      "author": {"@id": "https://przemyslawfilipiak.com/#person"},
      "url": "https://frinter.app"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://przemyslawfilipiak.com/#frinterflow",
      "name": "FrinterFlow",
      "description": "Local voice dictation CLI using faster-whisper. Zero cloud, zero subscription, works offline.",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Windows, macOS, Linux",
      "author": {"@id": "https://przemyslawfilipiak.com/#person"},
      "url": "https://pypi.org/project/frinterflow/"
    }
  ]
}
```

### E2: Blog Listing — `src/pages/blog/index.astro`

Zmień istniejący JSON-LD na:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": "https://przemyslawfilipiak.com/blog/#webpage",
      "url": "https://przemyslawfilipiak.com/blog",
      "name": "Blog — Przemysław Filipiak",
      "description": "Essays on AI development, deep work, and building in public.",
      "isPartOf": {"@id": "https://przemyslawfilipiak.com/#website"},
      "author": {"@id": "https://przemyslawfilipiak.com/#person"},
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com"},
          {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://przemyslawfilipiak.com/blog"}
        ]
      }
    }
  ]
}
```

### E3: Artykuły — `src/components/layouts/BlogPost.astro`

Zastąp istniejący BlogPosting schema w pełny @graph z BreadcrumbList:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": "https://przemyslawfilipiak.com/blog/{slug}/#article",
      "headline": "{title}",
      "description": "{description}",
      "datePublished": "{publishedAt.toISOString()}",
      "dateModified": "{updatedAt?.toISOString() || publishedAt.toISOString()}",
      "author": {"@id": "https://przemyslawfilipiak.com/#person"},
      "publisher": {"@id": "https://przemyslawfilipiak.com/#person"},
      "url": "https://przemyslawfilipiak.com/blog/{slug}",
      "isPartOf": {"@id": "https://przemyslawfilipiak.com/#website"},
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://przemyslawfilipiak.com/blog/{slug}/#webpage"
      },
      "image": "https://przemyslawfilipiak.com/og-image.png",
      "inLanguage": "en-US",
      "keywords": "{tags.join(', ')}"
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com"},
        {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://przemyslawfilipiak.com/blog"},
        {"@type": "ListItem", "position": 3, "name": "{title}", "item": "https://przemyslawfilipiak.com/blog/{slug}"}
      ]
    }
  ]
}
```

---

## BLOK F — BlogPost.astro: OG Meta dla Artykułów

**Plik:** `src/components/layouts/BlogPost.astro`

Zaktualizuj przekazywanie props do `<Base>`:
```astro
<Base
  title={`${title} — Przemysław Filipiak`}
  description={description || undefined}
  canonical={canonicalUrl}
  ogType="article"
  articlePublishedAt={publishedAt?.toISOString()}
  articleModifiedAt={updatedAt?.toISOString()}
>
```

---

## BLOK G — Sitemap: Rozszerzenie i Weryfikacja

**Plik:** `src/pages/sitemap.xml.ts`

### G1: Dodaj /blog do sitemap jako SSR endpoint (bez zmian potrzebnych)
Sitemap jest już dobry — jest dynamicznym API route, zawsze zaciąga z DB.

### G2: Poprawki w sitemap
- Usunąć `changefreq` i `priority` — Google je ignoruje od 2022
- Dodać `<image:image>` dla stron z obrazkami (opcjonalne, ale dobre)
- `lastmod` dla homepage = BUILD_DATE lub data ostatniego artykułu

```ts
// Zmień statyczne URL:
const staticUrls = [
  { loc: 'https://przemyslawfilipiak.com', lastmod: new Date().toISOString().split('T')[0] },
  { loc: 'https://przemyslawfilipiak.com/blog', lastmod: new Date().toISOString().split('T')[0] },
];

// Zmień artykuły (usuń changefreq i priority):
const articleUrls = publishedArticles.map(a => ({
  loc: `https://przemyslawfilipiak.com/blog/${a.slug}`,
  lastmod: a.updatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
}));

// Uproszczony XML (bez changefreq/priority):
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>`;
```

---

## BLOK H — HTML Semantyczny i Accessibility

**Status po audycie:**

| Element | Stan | Ocena |
|---|---|---|
| `<main>` tag | `Landing.astro` ma `<main>`, `BlogPost.astro` ma `<main>` | ✅ OK |
| `<h1>` na homepage | `Hero.astro` — `<h1 class="visually-hidden">Przemysław Filipiak</h1>` | ✅ OK |
| `<h1>` na artykule | `BlogPost.astro` — `<h1 class="article-title">` | ✅ OK |
| `<h1>` na /blog | `blog/index.astro` — `<h1 class="blog-list-title">/blog</h1>` | ✅ OK |
| Nav aria-label | `Nav.astro` — `<nav class="nav" aria-label="Main navigation">` | ✅ OK |
| aria-expanded na toggle | Nav.astro — toggle JS ustawia aria-expanded | ✅ OK |
| Contact form | — | Do sprawdzenia |
| `<main aria-label>` | Landing.astro — `<main>` bez aria-label | ⚠️ Dodaj |

### H1: Dodaj `aria-label` do `<main>` w `Landing.astro`:
```html
<main aria-label="Main content">
```

### H2: Dodaj `aria-label` do `<main>` w `BlogPost.astro`:
```html
<main class="blog-main" aria-label="Article content">
```

### H3: Dodaj `aria-label` do `<main>` w `blog/index.astro`:
```html
<main class="blog-list-main" aria-label="Blog posts">
```

---

## BLOK I — Performance / Core Web Vitals

**Po audycie kodu:**

| Metryka | Stan | Ocena |
|---|---|---|
| Font preload | Base.astro — 4 fonty preloaded z crossorigin | ✅ OK |
| font-display | Wymaga weryfikacji w global.css | ⚠️ Sprawdzić |
| LCP element | ASCII art hero — renderowany CSS text, nie obraz | ✅ Bezpieczny |
| JS defer | Hero typewriter i animations — DOMContentLoaded | ✅ OK |
| Images | Brak obrazków na stronach publicznych | ✅ OK |
| SSG TTFB | Po przejściu na hybrid — statyczny HTML, CDN cache | 🎯 Cel |

### I1: Sprawdź `font-display: swap` w `src/styles/global.css`
```css
@font-face {
  font-family: 'CourierPrime';
  font-display: swap; /* <-- to musi być! */
  src: url('/fonts/CourierPrime-Regular.woff2') format('woff2');
}
```

### I2: Po buildzie — zmierz PageSpeed Insights
- Target: LCP < 2.5s, CLS < 0.1
- Statyczny HTML z CDN powinien dać TTFB < 200ms

---

## BLOK J — llms.txt (GEO — AI Crawlers)

**Plik:** `public/llms.txt`

Brakuje:
- `Sitemap:` link
- `Last-Updated:` data
- Link do `llms-full.txt`

**Dodaj na początku pliku:**
```markdown
---
Sitemap: https://przemyslawfilipiak.com/sitemap.xml
Full-Context: https://przemyslawfilipiak.com/llms-full.txt
Last-Updated: 2026-03-14
---
```

**Plik:** `public/llms-full.txt`

Dodaj na końcu:
```markdown
## Resources
- Sitemap: https://przemyslawfilipiak.com/sitemap.xml
- RSS Feed: https://przemyslawfilipiak.com/rss.xml
- llms.txt: https://przemyslawfilipiak.com/llms.txt

Last-Updated: 2026-03-14
```

---

## BLOK K — RSS Feed: Weryfikacja i Ulepszenia

**Plik:** `src/pages/rss.xml.ts`

RSS jest już dobry. Opcjonalne ulepszenia:
- Dodaj `<managingEditor>` 
- Dodaj `<webMaster>` 
- Zweryfikuj że `<content:encoded>` zawiera pełny HTML artykułu (tak jest)

---

## Plan Implementacji — Kolejność Priorytetów

```
SPRINT 1 — Krytyczne (wpływ na crawlability, TTFB):
  A1  → astro.config.mjs: output: 'hybrid'
  B1  → index.astro: export const prerender = true
  B3  → blog/[slug].astro: getStaticPaths() + prerender = true
  Test: npm run build → sprawdź dist/index.html i dist/blog/[slug]/index.html

SPRINT 2 — Ważne (Rich Results, Social Sharing):
  D1-D4 → Base.astro: Twitter Cards + pełny OG + rel="me" + rel="sitemap" + JSON-LD @graph
  E1    → index.astro: JSON-LD WebPage + @graph (merge person+website+software)
  E2    → blog/index.astro: JSON-LD CollectionPage z BreadcrumbList
  E3    → BlogPost.astro: JSON-LD BlogPosting z BreadcrumbList + @id
  F1    → BlogPost.astro: ogType="article" + articlePublishedAt props

SPRINT 3 — Bezpieczeństwo SEO i Crawlery:
  C1    → robots.txt: Disallow /admin /api + brakujące boty
  G1-G2 → sitemap.xml.ts: uproszczone (bez changefreq/priority)
  J1    → llms.txt: dodaj Sitemap + Last-Updated + Full-Context link
  J2    → llms-full.txt: dodaj Resources section + Last-Updated

SPRINT 4 — Accessibility i Performance:
  H1-H3 → aria-label na <main> tagach
  I1    → global.css: font-display: swap weryfikacja
  I2    → Po deploy: PageSpeed Insights audit
```

---

## Mapa Plików do Zmiany

| Plik | Sprint | Zmiany |
|---|---|---|
| `astro.config.mjs` | 1 | `output: 'hybrid'` |
| `src/pages/index.astro` | 1, 2 | `prerender = true`, JSON-LD @graph (WebPage + SoftwareApplications) |
| `src/pages/blog/[slug].astro` | 1, 2 | `getStaticPaths()`, `prerender = true` |
| `src/components/layouts/Base.astro` | 2 | Rozszerzony Props, Twitter Cards, OG pełny, rel="me", link sitemap, RSS link, JSON-LD Person+WebSite @graph |
| `src/components/layouts/BlogPost.astro` | 2 | ogType="article", article:published_time, JSON-LD BlogPosting @graph z BreadcrumbList |
| `src/pages/blog/index.astro` | 2 | JSON-LD CollectionPage z @graph i BreadcrumbList |
| `public/robots.txt` | 3 | Disallow /admin /api, brakujące boty (Bingbot, YandexBot, Slurp, MistralAI) |
| `src/pages/sitemap.xml.ts` | 3 | Uproszczony bez changefreq/priority |
| `public/llms.txt` | 3 | Sitemap link, Full-Context link, Last-Updated |
| `public/llms-full.txt` | 3 | Resources section, Last-Updated |
| `src/components/layouts/Landing.astro` | 4 | `aria-label="Main content"` na `<main>` |
| `src/pages/blog/index.astro` | 4 | `aria-label="Blog posts"` na `<main>` |
| `src/components/layouts/BlogPost.astro` | 4 | `aria-label="Article content"` na `<main>` |
| `src/styles/global.css` | 4 | Weryfikacja `font-display: swap` |

---

## Co NIE Zmienia Się

- Treść komponentów (`Hero.astro`, `About.astro`, `Projects.astro`, `Contact.astro`) — bez zmian
- Wygląd i stylowanie — bez zmian
- Struktura bazy danych i migracje — bez zmian
- Admin panel logika — bez zmian
- Slugi artykułów — NIGDY nie są zmieniane
- `BlogPreview.astro` — bez zmian (zadziała podczas buildu)

---

## Weryfikacja Po Wdrożeniu

1. **Lokalny build test:** `npm run build` → sprawdź `dist/index.html` i `dist/blog/[slug]/index.html`
2. **Google Search Console:** Submit sitemap → sprawdź Coverage report
3. **Rich Results Test:** [search.google.com/test/rich-results](https://search.google.com/test/rich-results) → wklej URL homepage i artykułu
4. **PageSpeed Insights:** Sprawdź LCP, CLS, TTFB po deployu
5. **OpenGraph Debugger:** [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug) → weryfikuj og:image
6. **Twitter Card Validator:** [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator) → weryfikuj card
7. **Schema Validator:** [validator.schema.org](https://validator.schema.org) → wklej URL, sprawdź JSON-LD errors
