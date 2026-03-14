# SEO Agent Tasks — przemyslawfilipiak.com

> **Format:** Każdy task jest atomowy — agent wykonuje JEDEN task, weryfikuje sukces i kończy.
> **Repo root:** `c:\Users\delta\Desktop\FRINTER.APP + PERSONAL BRAND\FRINTER - CURSOR - 26.11.25\FrinterHero`
> **Kontekst pełny:** `docs/SEO/seo-rebuild-plan.md`
> **Branch docelowy:** `baza140326-fullseo`

---

## SPRINT 1 — SSG (Static Site Generation)

---

### TASK S1-A1
**Tytuł:** Zmień output mode na `hybrid` w konfiguracji Astro

**Plik:** `astro.config.mjs`

**Kontekst:**
Obecnie `output: 'server'` powoduje SSR dla wszystkich stron — Googlebot musi czekać na Node.js render.
Tryb `hybrid` pozwala oznaczać wybrane strony jako statyczne (`prerender = true`) przy zachowaniu SSR dla admin/api.

**Akcja:**
W pliku `astro.config.mjs` zmień linię 16:
```js
// PRZED:
output: 'server',

// PO:
output: 'hybrid',
```

**Warunek sukcesu:**
- Plik `astro.config.mjs` zawiera `output: 'hybrid'`
- `npm run build` nie rzuca błędów kompilacji związanych z output mode
- Adapter `@astrojs/node` pozostaje bez zmian

**Nie zmieniaj:**
- `adapter`, `server`, `integrations`, `vite` — bez zmian

---

### TASK S1-A2
**Tytuł:** Dodaj `prerender = true` do homepage

**Plik:** `src/pages/index.astro`

**Kontekst:**
Homepage jest SSR — każde żądanie renderuje Node.js. Po zmianie na hybrid mode musimy jawnie oznaczyć stronę główną jako statyczną.

**Akcja:**
Dodaj `export const prerender = true;` jako **pierwszą linię** w frontmatter (po `---`, przed importami):

```astro
---
export const prerender = true;

import Landing from '@/components/layouts/Landing.astro';
import Hero from '@/components/Hero.astro';
import About from '@/components/About.astro';
import Projects from '@/components/Projects.astro';
import BlogPreview from '@/components/BlogPreview.astro';
import Contact from '@/components/Contact.astro';
---
```

**Warunek sukcesu:**
- `src/pages/index.astro` zawiera `export const prerender = true;` w frontmatter
- Po `npm run build` istnieje plik `dist/index.html`
- `dist/index.html` zawiera statyczny HTML z treścią (nie jest pusty)

**Nie zmieniaj:**
- Importy, komponenty, JSON-LD schema, script — bez zmian

---

### TASK S1-A3
**Tytuł:** Dodaj `getStaticPaths()` i `prerender = true` do strony artykułu

**Plik:** `src/pages/blog/[slug].astro`

**Kontekst:**
To najważniejsza zmiana. Artykuły są teraz SSR — Googlebot dostaje JS-driven response.
`getStaticPaths()` mówi Astro: "podczas buildu odpytaj DB, pobierz wszystkie published slugi, wygeneruj statyczny HTML dla każdego".
Istniejące slugi NIE zmieniają się — ta sama logika, ten sam URL.

**Akcja:**
Zastąp **cały frontmatter** (linie 1–77, od `---` do `---`) następującym kodem:

```astro
---
import BlogPost from '@/components/layouts/BlogPost.astro';
import BlogCard from '@/components/BlogCard.astro';
import { db } from '@/db/client';
import { articles, articleGenerations, knowledgeEntries } from '@/db/schema';
import { eq, and, ne, sql, inArray } from 'drizzle-orm';

export const prerender = true;

export async function getStaticPaths() {
  try {
    const published = await db
      .select({ slug: articles.slug })
      .from(articles)
      .where(eq(articles.status, 'published'));

    return published.map(({ slug }) => ({ params: { slug } }));
  } catch {
    // DB unavailable during build — return empty array (no static pages)
    return [];
  }
}

const { slug } = Astro.params;

if (!slug) {
  return Astro.redirect('/404');
}

let article: any = null;
let relatedArticles: any[] = [];
let kbLinkedArticles: { slug: string; title: string }[] = [];

try {
  const [result] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
    .limit(1);

  article = result;

  if (article?.tags?.length > 0) {
    relatedArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          ne(articles.id, article.id),
          sql`${articles.tags} && ARRAY[${sql.join(article.tags.map((t: string) => sql`${t}`), sql`, `)}]::text[]`
        )
      )
      .limit(3);
  }

  // KB-based internal links
  const [gen] = await db
    .select({ kbEntriesUsed: articleGenerations.kbEntriesUsed })
    .from(articleGenerations)
    .where(eq(articleGenerations.articleId, article.id))
    .limit(1);

  if (gen?.kbEntriesUsed?.length > 0) {
    const kbEntries = await db
      .select({ sourceUrl: knowledgeEntries.sourceUrl, title: knowledgeEntries.title })
      .from(knowledgeEntries)
      .where(
        and(
          inArray(knowledgeEntries.id, gen.kbEntriesUsed),
          eq(knowledgeEntries.type, 'published_article')
        )
      );

    kbLinkedArticles = kbEntries
      .map(e => {
        const match = e.sourceUrl?.match(/\/blog\/([^/?#]+)/);
        return {
          slug: match ? match[1] : '',
          title: e.title
        };
      })
      .filter(a => a.slug && a.slug !== slug)
      .slice(0, 4);
  }
} catch {
  // DB error
}

if (!article) {
  return Astro.redirect('/404');
}
---
```

**Warunek sukcesu:**
- Plik zawiera `export const prerender = true;`
- Plik zawiera `export async function getStaticPaths()`
- Po `npm run build` (z dostępem do DB) istnieją pliki `dist/blog/[slug]/index.html` dla każdego opublikowanego artykułu
- Template (`<BlogPost>`, `<style>`) — bez zmian

**Nie zmieniaj:**
- Cały kod poniżej `---` (template HTML, style) — bez zmian

---

### TASK S1-A4
**Tytuł:** Weryfikacja buildu SSG

**Akcja (tylko weryfikacja, brak zmian kodu):**

1. Uruchom `npm run build` w katalogu głównym projektu
2. Sprawdź czy `dist/index.html` istnieje i zawiera HTML
3. Sprawdź czy `dist/blog/` zawiera podkatalogi z artykułami (jeśli DB dostępna)
4. Sprawdź czy `npm run build` zakończył się bez błędów (`exit code 0`)

**Warunek sukcesu:**
- `exit code: 0`
- `dist/index.html` istnieje
- Brak błędów `TypeError`, `Cannot read properties of undefined` w output

**Jeśli build fail:**
- Błąd `"Cannot use server-only"` → sprawdź czy w `index.astro` lub komponencie nie używa się `Astro.locals` lub `Astro.cookies` (nie powinno być)
- Błąd DB connection → normalne jeśli nie ma `.env.local` — `getStaticPaths()` ma try/catch, zwróci `[]`

---

## SPRINT 2 — Meta Tagi i JSON-LD

---

### TASK S2-B1
**Tytuł:** Rozszerz `Base.astro` — Props interface i Twitter Cards

**Plik:** `src/components/layouts/Base.astro`

**Kontekst:**
Brakuje: Twitter/X Card meta tagów, pełnych wymiarów og:image, `rel="me"` dla tożsamości, `link rel="sitemap"`, RSS autodiscovery, `ogType` i `article:published_time` dla artykułów.

**Akcja:**
Zastąp **cały frontmatter** (linie 1–17, od `---` do `---`):

```astro
---
import '@/styles/global.css';
import '@/styles/animations.css';

export interface Props {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  ogType?: string;
  articlePublishedAt?: string;
  articleModifiedAt?: string;
}

const {
  title = 'Przemysław Filipiak — High Performer. Deep Focus Founder. Wholebeing Maximizer.',
  description = 'Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder. Optimizing life through Focus Sprints (Frints) and WholeBeing performance systems.',
  ogImage = '/og-image.png',
  canonical = Astro.url.href,
  ogType = 'website',
  articlePublishedAt,
  articleModifiedAt,
} = Astro.props;

const ogImageAbsolute = ogImage.startsWith('http') ? ogImage : `https://przemyslawfilipiak.com${ogImage}`;
---
```

Następnie zastąp blok `<!-- OpenGraph -->` i `<meta name="robots">` (linie 45–54) nowym blokiem:

```html
    <!-- OpenGraph -->
    <meta property="og:site_name" content="Przemysław Filipiak" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content={ogType} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={ogImageAbsolute} />
    <meta property="og:image:alt" content={`${title} — Przemysław Filipiak`} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImageAbsolute} />
    <meta name="twitter:image:alt" content={`${title} — Przemysław Filipiak`} />

    <!-- Article meta (only when ogType='article') -->
    {articlePublishedAt && <meta property="article:published_time" content={articlePublishedAt} />}
    {articleModifiedAt && <meta property="article:modified_time" content={articleModifiedAt} />}
    {ogType === 'article' && <meta property="article:author" content="https://przemyslawfilipiak.com" />}

    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />

    <!-- Identity & Discovery -->
    <link rel="me" href="https://github.com/delta240mvt" />
    <link rel="me" href="https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <link rel="alternate" type="application/rss+xml" title="Przemysław Filipiak — Blog" href="/rss.xml" />
```

**Warunek sukcesu:**
- `Base.astro` zawiera `twitter:card`, `twitter:image`, `og:image:width`, `og:image:height`
- `Base.astro` zawiera `rel="me"` linki do GitHub i LinkedIn
- `Base.astro` zawiera `rel="sitemap"` i `rel="alternate"` (RSS)
- `Base.astro` Props interface zawiera `ogType`, `articlePublishedAt`, `articleModifiedAt`
- TypeScript nie rzuca błędów na nowe props

---

### TASK S2-B2
**Tytuł:** Zaktualizuj JSON-LD Person schema na pełny @graph (Person + WebSite)

**Plik:** `src/components/layouts/Base.astro`

**Kontekst:**
Aktualny JSON-LD w Base.astro zawiera tylko `Person` schema bez `@id` URI i bez powiązania z `WebSite`. Google wymaga `@id` do budowania Knowledge Graph. `WebSite` z `SearchAction` umożliwia Google Sitelinks Search Box.

**Akcja:**
Zastąp blok `<!-- JSON-LD Person Schema -->` (linie 56–86) nowym:

```astro
    <!-- JSON-LD: Person + WebSite @graph -->
    <script type="application/ld+json" set:html={JSON.stringify({
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
          "description": "Polish High Performer and Deep Focus Founder. Creator of frinter.app (WholeBeing system). Specializes in Focus Sprints (Frints) and life-sphere optimization through hard data.",
          "url": "https://przemyslawfilipiak.com",
          "image": "https://przemyslawfilipiak.com/og-image.png",
          "sameAs": [
            "https://github.com/delta240mvt",
            "https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/"
          ],
          "knowsAbout": [
            "Artificial Intelligence",
            "Generative Engine Optimization (GEO)",
            "Deep Work",
            "Astro Framework",
            "Python",
            "React",
            "Local-first Software",
            "High Performance Productivity"
          ],
          "knowsLanguage": [
            { "@type": "Language", "name": "Polish", "alternateName": "pl" },
            { "@type": "Language", "name": "English", "alternateName": "en" },
            { "@type": "Language", "name": "Norwegian", "alternateName": "no" }
          ],
          "nationality": { "@type": "Country", "name": "Poland" },
          "alumniOf": [
            { "@type": "EducationalOrganization", "name": "University in Norway (Degree 1)" },
            { "@type": "EducationalOrganization", "name": "University in Norway (Degree 2)" }
          ]
        },
        {
          "@type": "WebSite",
          "@id": "https://przemyslawfilipiak.com/#website",
          "name": "Przemysław Filipiak",
          "url": "https://przemyslawfilipiak.com",
          "description": "Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder",
          "author": { "@id": "https://przemyslawfilipiak.com/#person" },
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
    })} />
```

**Warunek sukcesu:**
- `Base.astro` zawiera JSON-LD z `@graph` array
- `@graph` zawiera obiekty `Person` z `@id: ".../#person"` i `WebSite` z `@id: ".../#website"`
- `Person.author` usunięte (moved do `WebSite.author`)
- Stary pojedynczy `Person` script tag zastąpiony nowym `@graph`

---

### TASK S2-B3
**Tytuł:** Zaktualizuj JSON-LD w homepage — pełny @graph (WebPage + SoftwareApplications)

**Plik:** `src/pages/index.astro`

**Kontekst:**
Homepage ma dwa osobne JSON-LD scripties (SoftwareApplication @graph w `index.astro` + Person w `Base.astro`). Należy scalić wszystko w jeden `@graph` w `index.astro`. `WebPage` łączy homepage z `#website` i `#person`.

**Akcja:**
Zastąp **cały blok** `<!-- GEO: Software Applications / Products Schema -->` (linie 18–48) nowym:

```astro
<!-- JSON-LD: WebPage + SoftwareApplications @graph for homepage -->
<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://przemyslawfilipiak.com/#webpage",
      "url": "https://przemyslawfilipiak.com/",
      "name": "Przemysław Filipiak — High Performer. Deep Focus Founder. Wholebeing Maximizer.",
      "isPartOf": { "@id": "https://przemyslawfilipiak.com/#website" },
      "about": { "@id": "https://przemyslawfilipiak.com/#person" },
      "description": "Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder. Optimizing life through Focus Sprints (Frints) and WholeBeing performance systems.",
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com" }
        ]
      }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://frinter.app/#software",
      "name": "frinter.app",
      "alternateName": "frinter.",
      "description": "A WholeBeing performance system for High Performers — measuring Focus Sprints (Frints), energy tracking, and life-sphere balance.",
      "applicationCategory": "ProductivityApplication",
      "operatingSystem": "Web, Windows, macOS, Linux",
      "author": { "@id": "https://przemyslawfilipiak.com/#person" },
      "url": "https://frinter.app"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://pypi.org/project/frinterflow/#software",
      "name": "FrinterFlow",
      "description": "Local voice dictation CLI using faster-whisper. zero cloud, zero subscription, works offline.",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Windows, macOS, Linux",
      "author": { "@id": "https://przemyslawfilipiak.com/#person" },
      "url": "https://pypi.org/project/frinterflow/"
    }
  ]
})} />
```

**Warunek sukcesu:**
- `index.astro` zawiera dokładnie JEDEN `<script type="application/ld+json">` block
- Zawiera `WebPage` z `@id: ".../#webpage"`, `isPartOf` i `about` referencjami
- `SoftwareApplication` obiekty mają `author: { "@id": ".../#person" }` (nie inline Person)
- Stary `@graph` z dwoma SoftwareApplications zastąpiony nowym

---

### TASK S2-B4
**Tytuł:** Zaktualizuj JSON-LD w blog listing — CollectionPage z BreadcrumbList

**Plik:** `src/pages/blog/index.astro`

**Kontekst:**
Blog listing ma podstawowy `CollectionPage` schema bez `@id`, bez BreadcrumbList i bez powiązania z `#website`. Google nie może zbudować hierarchii strony.

**Akcja:**
Zastąp blok `<script type="application/ld+json">` (linie 96–103) nowym:

```astro
<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": "https://przemyslawfilipiak.com/blog/#webpage",
      "url": "https://przemyslawfilipiak.com/blog",
      "name": "Blog — Przemysław Filipiak",
      "description": "Essays on AI development, deep work, and building in public. By Przemysław Filipiak.",
      "isPartOf": { "@id": "https://przemyslawfilipiak.com/#website" },
      "author": { "@id": "https://przemyslawfilipiak.com/#person" },
      "inLanguage": "en-US",
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://przemyslawfilipiak.com/blog" }
        ]
      }
    }
  ]
})} />
```

**Warunek sukcesu:**
- `blog/index.astro` zawiera `@graph` z `CollectionPage`
- `CollectionPage` ma `@id`, `isPartOf`, `author` jako `@id` referencje
- Zawiera `BreadcrumbList` z 2 poziomami (Home → Blog)

---

### TASK S2-B5
**Tytuł:** Zaktualizuj JSON-LD w BlogPost.astro — BlogPosting @graph z BreadcrumbList + przekazuj nowe OG props

**Plik:** `src/components/layouts/BlogPost.astro`

**Kontekst:**
`BlogPost.astro` ma dwa problemy:
1. JSON-LD `BlogPosting` bez `@id`, bez BreadcrumbList, bez powiązania z `#website`
2. Nie przekazuje `ogType="article"` ani `articlePublishedAt` do `Base.astro`

**Akcja — Krok 1:** Zaktualizuj `<Base>` tag (linia 35–39):

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

**Akcja — Krok 2:** Zastąp blok `<script type="application/ld+json">` (linie 83–110) nowym:

```astro
<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": `${canonicalUrl}#article`,
      "headline": title,
      "description": description,
      "datePublished": publishedAt?.toISOString(),
      "dateModified": updatedAt?.toISOString() || publishedAt?.toISOString(),
      "author": { "@id": "https://przemyslawfilipiak.com/#person" },
      "publisher": { "@id": "https://przemyslawfilipiak.com/#person" },
      "url": canonicalUrl,
      "isPartOf": { "@id": "https://przemyslawfilipiak.com/#website" },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `${canonicalUrl}#webpage`
      },
      "image": "https://przemyslawfilipiak.com/og-image.png",
      "inLanguage": "en-US",
      "keywords": tags.join(', ')
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://przemyslawfilipiak.com" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://przemyslawfilipiak.com/blog" },
        { "@type": "ListItem", "position": 3, "name": title, "item": canonicalUrl }
      ]
    }
  ]
})} />
```

**Warunek sukcesu:**
- `<Base>` tag zawiera `ogType="article"`, `articlePublishedAt`, `articleModifiedAt`
- JSON-LD `@graph` zawiera `BlogPosting` z `@id` i `BreadcrumbList` z 3 poziomami
- `author` i `publisher` są `@id` referencjami, nie inline Person

---

## SPRINT 3 — Infrastruktura SEO

---

### TASK S3-C1
**Tytuł:** Popraw `robots.txt` — Disallow /admin /api + brakujące crawlery

**Plik:** `public/robots.txt`

**Kontekst:**
Aktualny `robots.txt` nie blokuje `/admin` i `/api` dla crawlerów SEO. Brakuje Bingbot, YandexBot, Slurp, MistralAI.

**Akcja:**
Zastąp **cały plik** `public/robots.txt` następującą treścią:

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

**Warunek sukcesu:**
- Plik zawiera `Disallow: /admin` i `Disallow: /api` w globalnym bloku `User-agent: *`
- Plik zawiera `User-agent: Bingbot`, `User-agent: YandexBot`, `User-agent: Slurp`, `User-agent: MistralAI-bot`
- Plik zawiera `User-agent: Googlebot` z `Disallow: /admin` i `Disallow: /api`

---

### TASK S3-C2
**Tytuł:** Uproszcz sitemap.xml — usuń changefreq i priority

**Plik:** `src/pages/sitemap.xml.ts`

**Kontekst:**
Google od 2022 ignoruje `<changefreq>` i `<priority>`. Usunięcie upraszcza sitemap i eliminuje "noise" dla crawlerów. `<lastmod>` zostaje — Google go używa.

**Akcja:**
Zastąp **cały plik** `src/pages/sitemap.xml.ts`:

```ts
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  let publishedArticles: { slug: string; updatedAt: Date }[] = [];

  try {
    publishedArticles = await db
      .select({ slug: articles.slug, updatedAt: articles.updatedAt })
      .from(articles)
      .where(eq(articles.status, 'published'));
  } catch {
    // DB unavailable
  }

  const today = new Date().toISOString().split('T')[0];

  const staticUrls = [
    { loc: 'https://przemyslawfilipiak.com', lastmod: today },
    { loc: 'https://przemyslawfilipiak.com/blog', lastmod: today },
  ];

  const articleUrls = publishedArticles.map(a => ({
    loc: `https://przemyslawfilipiak.com/blog/${a.slug}`,
    lastmod: a.updatedAt?.toISOString().split('T')[0] || today,
  }));

  const allUrls = [...staticUrls, ...articleUrls];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
```

**Warunek sukcesu:**
- Plik nie zawiera `changefreq` ani `priority`
- `lastmod` format to `YYYY-MM-DD` (nie pełny ISO string)
- Sitemap zawiera `/` i `/blog` jako static URLs
- TypeScript kompiluje bez błędów

---

### TASK S3-C3
**Tytuł:** Zaktualizuj `llms.txt` — dodaj metadane dla AI crawlerów

**Plik:** `public/llms.txt`

**Kontekst:**
Standard `llms.txt` wymaga linku do sitemaps i daty aktualizacji. Brak tych elementów powoduje gorszą indeksację przez crawlery AI (Perplexity, Claude, GPT Search).

**Akcja:**
Dodaj następujące linie **na początku pliku**, przed linią `# Przemysław Filipiak`:

```markdown
---
Sitemap: https://przemyslawfilipiak.com/sitemap.xml
Full-Context: https://przemyslawfilipiak.com/llms-full.txt
Last-Updated: 2026-03-14
---

```

**Warunek sukcesu:**
- Plik `public/llms.txt` zaczyna się od sekcji `---` z `Sitemap:` i `Last-Updated:`
- Reszta pliku (istniejąca treść) pozostaje bez zmian
- Data `Last-Updated` to `2026-03-14`

---

### TASK S3-C4
**Tytuł:** Zaktualizuj `llms-full.txt` — dodaj sekcję Resources i metadane

**Plik:** `public/llms-full.txt`

**Kontekst:**
`llms-full.txt` jest pełnym kontekstem dla AI — brakuje linków do zasobów (sitemap, RSS) i daty aktualizacji.

**Akcja:**
Dodaj następujące linie **na końcu pliku** (po ostatniej istniejącej linii):

```markdown

## Resources
- Sitemap: https://przemyslawfilipiak.com/sitemap.xml
- RSS Feed: https://przemyslawfilipiak.com/rss.xml
- Structured context: https://przemyslawfilipiak.com/llms.txt

Last-Updated: 2026-03-14
```

**Warunek sukcesu:**
- Plik kończy się sekcją `## Resources` z linkami
- `Last-Updated: 2026-03-14` jest na końcu pliku
- Reszta pliku (istniejąca treść) pozostaje bez zmian

---

## SPRINT 4 — Accessibility i Performance

---

### TASK S4-D1
**Tytuł:** Dodaj `aria-label` do elementów `<main>` w layoutach

**Pliki:**
- `src/components/layouts/Landing.astro`
- `src/components/layouts/BlogPost.astro`
- `src/pages/blog/index.astro`

**Kontekst:**
`<main>` bez `aria-label` jest OK (jeden `<main>` per stronę spełnia WCAG), ale z aria-label Lighthouse daje extra punkty i screenreadery lepiej nawigują.

**Akcja w `Landing.astro`** (linia 15):
```html
<!-- PRZED: -->
<main>
<!-- PO: -->
<main aria-label="Main content">
```

**Akcja w `BlogPost.astro`** (linia 41):
```html
<!-- PRZED: -->
<main class="blog-main">
<!-- PO: -->
<main class="blog-main" aria-label="Article content">
```

**Akcja w `blog/index.astro`** (linia 50):
```html
<!-- PRZED: -->
<main class="blog-list-main">
<!-- PO: -->
<main class="blog-list-main" aria-label="Blog posts">
```

**Warunek sukcesu:**
- Wszystkie 3 pliki zawierają `aria-label` na `<main>` tagach
- CSS klasy (`.blog-main`, `.blog-list-main`) bez zmian

---

### TASK S4-D2
**Tytuł:** Weryfikacja `font-display: swap` w global.css

**Plik:** `src/styles/global.css`

**Kontekst:**
Fonty są preloadowane w `Base.astro`, ale jeśli `@font-face` nie ma `font-display: swap`, przeglądarka może pokazywać FOIT (Flash of Invisible Text) — negatywny wpływ na CLS i LCP.

**Akcja:**
Otwórz `src/styles/global.css` i odnajdź wszystkie bloki `@font-face`.

Dla każdego bloku `@font-face` sprawdź czy zawiera `font-display: swap;`. Jeśli brakuje — dodaj.

Przykład (jeśli brakuje):
```css
@font-face {
  font-family: 'CourierPrime';
  font-style: normal;
  font-weight: 400;
  font-display: swap;  /* ← to musi być */
  src: url('/fonts/CourierPrime-Regular.woff2') format('woff2');
}
```

**Warunek sukcesu:**
- Każdy blok `@font-face` w `global.css` zawiera `font-display: swap;`
- Jeśli nie ma żadnych bloków `@font-face` w pliku — task nie jest potrzebny (fonty ładowane inaczej), zanotuj to i zakończ

---

## SPRINT 5 — Favicon w Google SERP

> **Problem ze screenshotu:** Google pokazuje szarą globus-ikonę zamiast logo strony przy WSZYSTKICH wynikach z przemyslawfilipiak.com.
> **Diagnoza:**
> - Brakuje `public/favicon-192x192.png` — Google wymaga min. 48×48px PNG
> - Brakuje `public/apple-touch-icon.png` — deklarowany w HTML ale plik nie istnieje!
> - `site.webmanifest` ma tylko ikony 16×16 i 32×32 — Google ignoruje zbyt małe
> - Google cachuje favicon agresywnie — po naprawie czekaj 1–14 dni

---

### TASK S5-E1
**Tytuł:** Wygeneruj brakujące ikony PNG z istniejącego favicon.svg

**Kontekst:**
`public/favicon.svg` istnieje — pixel art logo PF na tle `#0f172a`.
Do wygenerowania: `favicon-192x192.png`, `apple-touch-icon.png` (180×180), `favicon-512x512.png`.

**Akcja — Opcja A (Node.js + sharp):**
```bash
node -e "
const sharp = require('sharp');
const fs = require('fs');
const svg = fs.readFileSync('./public/favicon.svg');
Promise.all([
  sharp(svg).resize(192,192).png().toFile('./public/favicon-192x192.png'),
  sharp(svg).resize(180,180).png().toFile('./public/apple-touch-icon.png'),
  sharp(svg).resize(512,512).png().toFile('./public/favicon-512x512.png'),
]).then(() => console.log('All icons generated OK')).catch(console.error);
"
```

**Akcja — Opcja B (svgexport przez npx):**
```bash
npx -y svgexport public/favicon.svg public/favicon-192x192.png 192:192
npx -y svgexport public/favicon.svg public/apple-touch-icon.png 180:180
npx -y svgexport public/favicon.svg public/favicon-512x512.png 512:512
```

**Akcja — Opcja C (Inkscape CLI):**
```bash
inkscape --export-type=png --export-width=192 --export-filename=public/favicon-192x192.png public/favicon.svg
inkscape --export-type=png --export-width=180 --export-filename=public/apple-touch-icon.png public/favicon.svg
inkscape --export-type=png --export-width=512 --export-filename=public/favicon-512x512.png public/favicon.svg
```

**Warunek sukcesu:**
- `public/favicon-192x192.png` istnieje, rozmiar > 500 bajtów
- `public/apple-touch-icon.png` istnieje, rozmiar > 500 bajtów
- `public/favicon-512x512.png` istnieje, rozmiar > 500 bajtów

**Nie zmieniaj:** `public/favicon.svg`, `public/favicon.ico`, `public/favicon-16x16.png`, `public/favicon-32x32.png`

---

### TASK S5-E2
**Tytuł:** Zaktualizuj deklaracje favicon w `Base.astro` — primary icon 192×192

**Plik:** `src/components/layouts/Base.astro`

**Kontekst:**
Google szuka `<link rel="icon">` z rozmiarem ≥ 48×48px. Aktualnie head deklaruje ikony 16px i 32px — za małe. Ikona 192×192 musi być **pierwszą** lub najwyżej priorytetową deklaracją.

**Poszukaj w pliku blok:**
```html
    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
    <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <link rel="manifest" href="/site.webmanifest" />
```

**Zastąp go:**
```html
    <!-- Favicon — Google SERP wymaga PNG min 48x48px jako primary -->
    <link rel="icon" href="/favicon-192x192.png" type="image/png" sizes="192x192" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <link rel="manifest" href="/site.webmanifest" />
```

**Warunek sukcesu:**
- `Base.astro` zawiera `<link rel="icon" href="/favicon-192x192.png" type="image/png" sizes="192x192">` jako **pierwsza** deklaracja favicon
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` jest obecny
- Stare linki favicon-16x16.png i favicon-32x32.png jako oddzielne `<link>` usunięte

---

### TASK S5-E3
**Tytuł:** Zaktualizuj `site.webmanifest` — ikony 192×192 i 512×512

**Plik:** `public/site.webmanifest`

**Kontekst:**
Google używa ikon z webmanifest jako fallback dla favicon w SERP. Aktualny manifest ma tylko rozmiary 16×16 i 32×32 — Google wymaga min. 192×192 z `"purpose": "any maskable"`.

**Zastąp cały plik:**
```json
{
  "name": "Przemysław Filipiak",
  "short_name": "PFilipiak",
  "description": "High Performer. Deep Focus Founder. WholeBeing Maximizer.",
  "start_url": "/",
  "display": "browser",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    {
      "src": "/favicon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/favicon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/apple-touch-icon.png",
      "sizes": "180x180",
      "type": "image/png"
    }
  ]
}
```

**Warunek sukcesu:**
- `site.webmanifest` zawiera ikonę o rozmiarze `"192x192"` z `"purpose": "any maskable"`
- `site.webmanifest` zawiera ikonę o rozmiarze `"512x512"` z `"purpose": "any maskable"`
- JSON parsuje bez błędów (`JSON.parse(content)`)

---

### TASK S5-E4 (Informacyjny — po deployu)
**Tytuł:** Weryfikacja favicon w Google SERP

**Akcja manualna po deployu (agent nie wykonuje zmian kodu):**

```
1. Sprawdź dostępność nowych plików:
   https://przemyslawfilipiak.com/favicon-192x192.png → status 200
   https://przemyslawfilipiak.com/apple-touch-icon.png → status 200
   https://przemyslawfilipiak.com/site.webmanifest → status 200

2. Google Search Console — przyspiesz indeksację:
   https://search.google.com/search-console/
   → "URL Inspection" → wpisz: https://przemyslawfilipiak.com
   → "Request Indexing" — Google odwiedzi stronę i odświeży favicon

3. Czas oczekiwania:
   Google cachuje favicon agresywnie.
   Favicon może pojawić się w SERP po 1–14 dniach od deployu.
   Nie da się wymusić natychmiastowej zmiany.

4. Weryfikacja favicon testu:
   https://realfavicongenerator.net/favicon_checker → wpisz URL
```

---

## SPRINT 6 — Railway Nightly Rebuild (nowe artykuły co noc)

> **Flow:**
> Admin publikuje artykuł → status='published' w DB
> → 03:00 UTC każdej nocy GitHub Actions triggeruje Railway Deploy Hook
> → Railway uruchamia `npm run build`
> → Astro `getStaticPaths()` odpytuje DB → generuje dist/blog/[nowy-slug]/index.html
> → Deploy gotowy ~03:05 UTC — nowe artykuły live na stronie

---

### TASK S6-F1
**Tytuł:** Skonfiguruj Railway Deploy Hook i GitHub Actions nightly workflow

**Akcja — KROK 1: Wygeneruj Deploy Hook w Railway Dashboard (manualnie w przeglądarce):**
```
1. https://railway.app/dashboard
2. Wybierz projekt FrinterHero → kliknij serwis web/node
3. Zakładka "Settings" → znajdź sekcję "Deploy Hooks" lub "Webhooks"
4. Kliknij "Generate Deploy Hook" / "Create Deploy Hook"
5. Skopiuj wygenerowany URL (format: https://backboard.railway.app/webhooks/deploy/[TOKEN])
   ⚠️ NIE commituj tego URL do repozytorium! Traktuj jak hasło.
```

**Akcja — KROK 2: Dodaj Secret do GitHub (manualnie w przeglądarce):**
```
1. https://github.com/delta240mvt/FrinterHero/settings/secrets/actions
2. Kliknij "New repository secret"
3. Name: RAILWAY_DEPLOY_HOOK_URL
4. Value: [wklej URL z KROKU 1]
5. Kliknij "Add secret"
```

**Akcja — KROK 3: Utwórz plik workflow:**

Utwórz plik `.github/workflows/nightly-rebuild.yml` z zawartością:

```yaml
name: Nightly Rebuild — SSG new articles

on:
  schedule:
    # Każdej nocy o 03:00 UTC (04:00 CET / 05:00 CEST)
    - cron: '0 3 * * *'
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for manual trigger'
        required: false
        default: 'manual'

jobs:
  trigger-railway-rebuild:
    name: Trigger Railway Deploy
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Trigger Railway Deploy Hook
        run: |
          HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${{ secrets.RAILWAY_DEPLOY_HOOK_URL }}" \
            -H "Content-Type: application/json" \
            --max-time 30)

          echo "Railway responded with HTTP $HTTP_CODE"

          if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
            echo "ERROR: Deploy hook returned HTTP $HTTP_CODE"
            exit 1
          fi

      - name: Log success
        run: |
          echo "✅ Nightly rebuild triggered at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
          echo "Railway will now: npm run build → getStaticPaths() → new articles as static HTML"
```

**Warunek sukcesu:**
- Plik `.github/workflows/nightly-rebuild.yml` istnieje w repo
- Zawiera `cron: '0 3 * * *'` i `workflow_dispatch`
- GitHub Secret `RAILWAY_DEPLOY_HOOK_URL` ustawiony (Settings → Secrets → Actions)
- **Test manualny:** GitHub → Actions → "Nightly Rebuild" → "Run workflow" → zielony check

---

### TASK S6-F2 (Informacyjny — Railway konfiguracja)
**Tytuł:** Weryfikacja że Railway może buildować z dostępem do DB

**Kontekst:**
Aby `getStaticPaths()` w `blog/[slug].astro` zadziałał podczas Railway build, zmienne środowiskowe DB muszą być dostępne w czasie buildu (nie tylko runtime).

**Sprawdź w Railway Dashboard:**
```
1. https://railway.app/dashboard → projekt → serwis Web
2. Zakładka "Variables"
3. Sprawdź czy istnieje: DATABASE_URL (lub odpowiednik)
4. Jeśli DATABASE_URL nie jest ustawiony jako Build Variable:
   - Kliknij zmienną → upewnij się że jest dostępna podczas Build phase
   - Railway domyślnie przekazuje Variables do build — powinno działać

5. Sprawdź zakładkę "Settings" → "Build Command":
   Powinno być: npm run build
   (lub puste — Railway wykrywa automatycznie z package.json)
```

**Warunek sukcesu:**
- `DATABASE_URL` (lub `POSTGRES_URL`) dostępny w Railway Variables
- Build Command to `npm run build` (lub automatyczny)
- Brak specjalnych restrykcji dla build-time DB access

---

### TASK S6-F3 (Informacyjny)
**Tytuł:** Monitorowanie nocnych rebuildów po wdrożeniu

**Kontekst (dokumentacja dla operatora — agent nie wykonuje zmian):**

```
GDZIE SPRAWDZIĆ STATUS NOCNYCH REBUILDÓW:

GitHub Actions:
  https://github.com/delta240mvt/FrinterHero/actions/workflows/nightly-rebuild.yml
  → Zielony check = webhook do Railway wysłany OK
  → Czerwony X = coś poszło nie tak (sprawdź logi kroku "Trigger Railway Deploy Hook")

Railway Deployments:
  https://railway.app/dashboard → projekt → "Deployments"
  → Szukaj deploy z czasem 03:00-03:10 UTC
  → Status "Success" + rozmiar dist/ powinien rosnąć z każdym nowym artykułem

Weryfikacja nowych artykułów:
  Po opublikowaniu artykułu w admin panelu wieczorem →
  Rano sprawdź: https://przemyslawfilipiak.com/blog/[slug-nowego-artykulu]
  → Status 200 + treść = sukces

HARMONOGRAM:
  03:00 UTC = GitHub Actions triggeruje webhook
  03:00–03:03 UTC = Railway bootuje i startuje build
  03:03–03:08 UTC = npm run build + getStaticPaths() + generowanie HTML
  03:08 UTC = nowe artykuły live

TROUBLESHOOTING:
  - Jeśli GitHub check zielony ale artykuł nie pojawia się:
    → Sprawdź Railway build logs → czy getStaticPaths() zwróciło slug nowego artykułu?
    → Sprawdź czy artykuł ma status='published' w DB (nie 'draft')
  - Jeśli HTTP 404 przy webhook:
    → Deploy Hook mógł wygasnąć — wygeneruj nowy w Railway Dashboard
    → Zaktualizuj GitHub Secret RAILWAY_DEPLOY_HOOK_URL
```

---

## TASK KOŃCOWY FIN-1 — Sprint 1–4

**Tytuł:** Commit zmian SEO (Sprint 1–4) na branch `baza140326-fullseo`

**Akcja:**
```bash
git add astro.config.mjs src/pages/index.astro src/pages/blog/index.astro src/pages/blog/[slug].astro src/pages/sitemap.xml.ts src/components/layouts/Base.astro src/components/layouts/BlogPost.astro src/components/layouts/Landing.astro public/robots.txt public/llms.txt public/llms-full.txt
git commit -m "feat(seo): full SEO compliance — hybrid SSG, JSON-LD @graph, Twitter Cards, robots.txt, sitemap, llms.txt

Sprint 1: astro.config.mjs output:hybrid, index.astro prerender=true, blog/[slug].astro getStaticPaths()
Sprint 2: Base.astro Twitter Cards + OG extended + rel=me + rel=sitemap + JSON-LD Person+WebSite @graph
          index.astro JSON-LD WebPage+SoftwareApplications @graph
          blog/index.astro JSON-LD CollectionPage+BreadcrumbList @graph
          BlogPost.astro JSON-LD BlogPosting+BreadcrumbList @graph, ogType=article
Sprint 3: robots.txt Disallow /admin /api + Bingbot/YandexBot/Slurp/MistralAI
          sitemap.xml.ts cleanup (remove changefreq/priority, date-only lastmod)
          llms.txt + llms-full.txt: Sitemap link + Last-Updated + Resources
Sprint 4: aria-label on <main> elements, font-display:swap"

git push origin baza140326-fullseo
```

---

## TASK KOŃCOWY FIN-2 — Sprint 5–6

**Tytuł:** Commit favicon + Railway nightly rebuild na branch `baza140326-fullseo`

**Akcja:**
```bash
git add public/favicon-192x192.png public/apple-touch-icon.png public/favicon-512x512.png public/site.webmanifest src/components/layouts/Base.astro .github/workflows/nightly-rebuild.yml
git commit -m "feat(seo+infra): favicon Google SERP fix + nightly Railway rebuild automation

Sprint 5 (favicon):
- public/favicon-192x192.png + favicon-512x512.png + apple-touch-icon.png (generated from SVG)
- Base.astro: favicon-192x192.png as primary <link rel=icon> (Google needs min 48px)
- site.webmanifest: 192x192 + 512x512 icons with purpose:any maskable

Sprint 6 (nightly rebuild):
- .github/workflows/nightly-rebuild.yml: cron 03:00 UTC via Railway Deploy Hook
  getStaticPaths() => new published articles generated as static HTML every night"

git push origin baza140326-fullseo
```

**Warunek sukcesu:**
- `git push` exit code 0
- `.github/workflows/nightly-rebuild.yml` widoczny na GitHubie
- **przypomnienie:** Secret `RAILWAY_DEPLOY_HOOK_URL` NIE jest w pliku — tylko w GitHub Secrets

---

## Checklist Weryfikacji — KOMPLETNA

```
SPRINT 1 — SSG
□ S1-A1  astro.config.mjs → output: 'hybrid'
□ S1-A2  index.astro → export const prerender = true
□ S1-A3  blog/[slug].astro → getStaticPaths() + prerender = true
□ S1-A4  npm run build → dist/index.html istnieje, exit code 0

SPRINT 2 — Meta Tagi i JSON-LD
□ S2-B1  Base.astro → Twitter Cards + ogType props + rel="me" + rel="sitemap" + RSS link
□ S2-B2  Base.astro → JSON-LD @graph (Person @id + WebSite @id + SearchAction)
□ S2-B3  index.astro → JSON-LD @graph (WebPage + SoftwareApplications z @id)
□ S2-B4  blog/index.astro → JSON-LD @graph (CollectionPage + BreadcrumbList)
□ S2-B5  BlogPost.astro → ogType="article" + JSON-LD @graph (BlogPosting + BreadcrumbList)

SPRINT 3 — Infrastruktura SEO
□ S3-C1  robots.txt → Disallow /admin /api + nowe crawlery (Bing, Yandex, Mistral)
□ S3-C2  sitemap.xml.ts → bez changefreq/priority, date-only lastmod
□ S3-C3  llms.txt → Sitemap + Full-Context + Last-Updated header
□ S3-C4  llms-full.txt → Resources section + Last-Updated

SPRINT 4 — Accessibility i Performance
□ S4-D1  aria-label na <main> w Landing, BlogPost, blog/index
□ S4-D2  font-display: swap w global.css

SPRINT 5 — Favicon Google SERP
□ S5-E1  public/favicon-192x192.png + apple-touch-icon.png + favicon-512x512.png wygenerowane
□ S5-E2  Base.astro → favicon-192x192.png jako PIERWSZA deklaracja <link rel="icon">
□ S5-E3  site.webmanifest → ikony 192x192 + 512x512 z purpose:any maskable
□ S5-E4  (po deployu) sprawdź dostępność PNG, zgłoś w GSC "Request Indexing"

SPRINT 6 — Railway Nightly Rebuild
□ S6-F1a Railway Deploy Hook wygenerowany (manualnie w Railway Dashboard)
□ S6-F1b GitHub Secret RAILWAY_DEPLOY_HOOK_URL ustawiony (Settings → Secrets → Actions)
□ S6-F1c .github/workflows/nightly-rebuild.yml → cron 03:00 UTC + Railway webhook
□ S6-F1d Test manualny: GitHub Actions → "Run workflow" → Railway deploy OK
□ S6-F2  Railway Variables: DATABASE_URL dostępny w build phase

COMMIT
□ FIN-1  git commit + push Sprint 1–4 → baza140326-fullseo
□ FIN-2  git commit + push Sprint 5–6 → baza140326-fullseo (bez RAILWAY_DEPLOY_HOOK_URL w kodzie!)
```
