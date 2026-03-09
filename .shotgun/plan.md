# Plan Wdrożenia: Personal Page Przemysława Filipiaka

**Status:** Projekt budowany od zera  
**Stack:** Astro SSR + PostgreSQL + Drizzle ORM + Cloudflare Pages  
**Domena:** przemyslawfilipiak.com (EN primary)  
**Cel:** One-page landing + SSR blog + admin panel + Reverse RAG Loop GEO

---

## ARCHITEKTURA OGÓLNA

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Astro SSR)                     │
│  ├─ src/pages/index.astro (one-page landing)               │
│  ├─ src/pages/blog/index.astro (lista artykułów)           │
│  ├─ src/pages/blog/[slug].astro (SSR artykuł z DB)         │
│  ├─ src/pages/admin/ (chronione, middleware)               │
│  ├─ src/pages/rss.xml.ts (dynamiczny RSS)                  │
│  ├─ src/pages/sitemap.xml.ts (dynamiczny sitemap)          │
│  └─ src/pages/llms.txt (static, bez ext)                   │
├─────────────────────────────────────────────────────────────┤
│                    Backend (Drizzle ORM)                    │
│  ├─ src/db/schema.ts (tabele: articles, geo_queries, ...)  │
│  ├─ src/db/client.ts (połączenie PostgreSQL)               │
│  ├─ src/api/ (endpointy dla admin, RSS, itp.)              │
│  └─ migrations/ (schema versioning)                         │
├─────────────────────────────────────────────────────────────┤
│              GEO Engine (scripts/ folder)                    │
│  ├─ scripts/geo-monitor.ts (weekly CRON job)               │
│  ├─ scripts/queries.json (query bank)                      │
│  └─ scripts/notifier.ts (Discord/email webhook)            │
├─────────────────────────────────────────────────────────────┤
│                  PostgreSQL Database                        │
│  ├─ articles (id, slug, title, content, status, ...)       │
│  ├─ geo_queries (query results, mention detection)         │
│  ├─ geo_runs (weekly run summary)                          │
│  └─ sessions (admin login state)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## STAGE 1: Fundamenty Projektu i Setup Bazy Danych

### Purpose
Konfiguracja Astro SSR, zainicjalizowanie PostgreSQL z Drizzle ORM, setup design tokens i fontów, przygotowanie środowiska dev i prod.

### Depends on
None

### Key Components

**1.1 – Init Astro SSR + Dependencies**
- Nowy folder: `premium-personal`
- `npm create astro@latest` z template `extras/with-ssr`
- Adapter: `@astrojs/node` (dev + prod) lub `@astrojs/cloudflare` (jeśli final deployment na CF Pages)
- Dependencies:
  ```json
  {
    "dependencies": {
      "astro": "^4.x",
      "drizzle-orm": "^0.x",
      "pg": "^8.x",
      "dotenv": "^16.x",
      "bcrypt": "^5.x",
      "feed": "^4.x"
    },
    "devDependencies": {
      "astro": "^4.x",
      "typescript": "^5.x",
      "tailwindcss": "^3.x",
      "@tailwindcss/typography": "^0.x",
      "drizzle-kit": "^0.x",
      "@astrojs/tailwind": "^5.x"
    }
  }
  ```

**1.2 – TypeScript Config**
- `tsconfig.json` → strict mode, `moduleResolution: "bundler"`
- Path aliases: `@/*` → `src/`
- Target: ES2020

**1.3 – Design Tokens (CSS Variables)**
- Plik: `src/styles/tokens.css`
- Kolory (personalpage.md, sekcja 3):
  ```css
  :root {
    /* Backgrounds */
    --bg-base: #1e293b;
    --bg-surface: #334155;
    --bg-elevated: #0f172a;
    
    /* Text */
    --text-primary: #ffffff;
    --text-secondary: #94a3b8;
    --text-muted: #475569;
    
    /* Borders */
    --border: rgba(255, 255, 255, 0.08);
    --border-hover: rgba(255, 255, 255, 0.16);
    
    /* Frinter Accents */
    --teal: #4a8d83;
    --violet: #8a4e64;
    --gold: #d6b779;
    --teal-glow: rgba(74, 141, 131, 0.15);
    --violet-glow: rgba(138, 78, 100, 0.15);
    --gold-glow: rgba(214, 183, 121, 0.15);
    
    /* Typography */
    --text-hero: clamp(2.5rem, 8vw, 7rem);
    --text-xl: clamp(1.5rem, 3vw, 2.5rem);
    --text-lg: clamp(1.125rem, 2vw, 1.5rem);
    --text-base: 1rem;
    --text-sm: 0.875rem;
    --text-xs: 0.75rem;
  }
  ```
- Tailwind config: `tailwind.config.mjs` — extend colors i fontSize z powyższych tokensów
- Global stylesheet: `src/styles/global.css` (reset, @font-face)

**1.4 – Self-Hosted Fonts**
- Folder: `public/fonts/`
- Pliki (WOFF2 format):
  - `CourierPrime-Regular.woff2`
  - `CourierPrime-Bold.woff2`
  - `Poppins-500.woff2`, `Poppins-600.woff2`, `Poppins-700.woff2`
  - `Roboto-300.woff2`, `Roboto-400.woff2`
- CSS:
  ```css
  @font-face {
    font-family: 'Courier Prime';
    src: url('/fonts/CourierPrime-Regular.woff2') format('woff2');
    font-display: swap;
    font-weight: 400;
  }
  @font-face {
    font-family: 'Poppins';
    src: url('/fonts/Poppins-600.woff2') format('woff2');
    font-display: swap;
    font-weight: 600;
  }
  ```
- Link preload w Base layout (Astro component)

**1.5 – PostgreSQL + Drizzle Setup**
- Database: **Neon PostgreSQL** (serverless, free tier, auto-scaling) REKOMENDACJA
  - Alternatywa: Cloudflare D1 (SQLite na edge, zero latency)
  - Decyzja: **Neon** — większa elastyczność, standard PostgreSQL, lepszy dla Drizzle
- Env vars (`.env.local`):
  ```
  DATABASE_URL=postgresql://user:pass@host/dbname
  ADMIN_PASSWORD_HASH=bcrypt_hash_here
  OPENROUTER_API_KEY=sk-or-...
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
  ```

**1.6 – Schema i Migracje**
- Plik: `src/db/schema.ts`
  ```typescript
  import { pgTable, serial, text, timestamp, boolean, integer, varchar } from 'drizzle-orm/pg-core';

  export const articles = pgTable('articles', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    content: text('content').notNull(),
    tags: text('tags').array().notNull().default([]),
    featured: boolean('featured').notNull().default(false),
    status: varchar('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    readingTime: integer('reading_time'),
    author: varchar('author', { length: 255 }).notNull().default('Przemysław Filipiak'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    publishedAt: timestamp('published_at'),
  });

  export const geoQueries = pgTable('geo_queries', {
    id: serial('id').primaryKey(),
    query: text('query').notNull(),
    model: varchar('model', { length: 50 }).notNull(), // 'openai', 'claude', 'perplexity'
    response: text('response'),
    hasMention: boolean('has_mention').notNull().default(false),
    gapDetected: boolean('gap_detected').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  });

  export const geoRuns = pgTable('geo_runs', {
    id: serial('id').primaryKey(),
    runAt: timestamp('run_at').notNull().defaultNow(),
    queriesCount: integer('queries_count').notNull(),
    gapsFound: integer('gaps_found').notNull(),
    draftsGenerated: integer('drafts_generated').notNull(),
  });

  export const sessions = pgTable('sessions', {
    id: serial('id').primaryKey(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  });
  ```
- Plik: `src/db/client.ts`
  ```typescript
  import { drizzle } from 'drizzle-orm/node-postgres';
  import { Pool } from 'pg';
  import * as schema from './schema';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  export const db = drizzle(pool, { schema });
  ```
- Plik: `drizzle.config.ts` (dla `drizzle-kit`)
  ```typescript
  import { defineConfig } from 'drizzle-kit';
  export default defineConfig({
    schema: './src/db/schema.ts',
    out: './migrations',
    driver: 'pg',
    dbCredentials: { connectionString: process.env.DATABASE_URL! },
  });
  ```
- Workflow migracji:
  ```bash
  npx drizzle-kit generate:pg
  npx drizzle-kit migrate
  ```

**1.7 – Astro Config**
- Plik: `astro.config.mjs`
  ```javascript
  import { defineConfig } from 'astro/config';
  import node from '@astrojs/node';
  import tailwind from '@astrojs/tailwind';
  
  export default defineConfig({
    output: 'server', // SSR mode
    adapter: node({ mode: 'standalone' }),
    integrations: [tailwind()],
    vite: {
      ssr: { noExternal: ['drizzle-orm'] }
    }
  });
  ```

**1.8 – Middleware Astro (dla /admin ochrony)**
- Plik: `src/middleware.ts`
  ```typescript
  import { defineMiddleware } from 'astro:middleware';
  import { db } from '@/db/client';
  import { sessions } from '@/db/schema';
  import { eq, gt } from 'drizzle-orm';

  export const onRequest = defineMiddleware(async (context, next) => {
    // Sprawdź czy route wymaga autentykacji
    if (context.url.pathname.startsWith('/admin')) {
      const token = context.cookies.get('session')?.value;
      if (!token) {
        return context.redirect('/admin/login');
      }
      
      // Waliduj token w DB
      const session = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1);
      
      if (!session.length || session[0].expiresAt < new Date()) {
        context.cookies.delete('session');
        return context.redirect('/admin/login');
      }
    }
    
    return next();
  });
  ```

**1.9 – Folder Structure**
```
premium-personal/
├── src/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   ├── [slug].astro
│   │   │   └── rss.xml.ts
│   │   ├── admin/
│   │   │   ├── index.astro (dashboard)
│   │   │   ├── login.astro (formularz logowania)
│   │   │   ├── article/
│   │   │   │   └── [id].astro (edytor artykułu)
│   │   │   └── geo/ (dashboard GEO)
│   │   ├── sitemap.xml.ts
│   │   ├── llms.txt.ts
│   │   └── rss.xml.ts
│   ├── api/ (endpointy dla admin, API)
│   │   ├── auth.ts (login endpoint)
│   │   ├── articles.ts (CRUD)
│   │   └── geo.ts (GEO results)
│   ├── components/
│   │   ├── layouts/
│   │   │   ├── Base.astro
│   │   │   ├── Landing.astro
│   │   │   └── BlogPost.astro
│   │   ├── Hero.astro
│   │   ├── AsciiHero.astro
│   │   ├── PixelIcon.astro
│   │   ├── Nav.astro
│   │   ├── BlogCard.astro
│   │   ├── ProjectCard.astro
│   │   └── Footer.astro
│   ├── styles/
│   │   ├── global.css
│   │   ├── tokens.css
│   │   └── animations.css
│   ├── utils/
│   │   ├── auth.ts (hashing, token generation)
│   │   └── slug.ts (slug generation)
│   └── middleware.ts
├── scripts/
│   ├── geo-monitor.ts (main CRON job)
│   ├── queries.json (query bank)
│   └── notifier.ts (Discord/email)
├── public/
│   ├── fonts/
│   ├── favicon.svg
│   ├── robots.txt
│   └── llms.txt (lub generated w Faza 6)
├── migrations/
├── .env.local (dev)
├── .env.prod (prod)
├── astro.config.mjs
├── tsconfig.json
├── tailwind.config.mjs
├── drizzle.config.ts
├── package.json
└── README.md
```

### Success Criteria
- ✅ Astro SSR działa lokalnie (`npm run dev`)
- ✅ PostgreSQL connected i accessible (Drizzle client testuje)
- ✅ Schema zaaplikowana (migracje przebiegły)
- ✅ Alle design tokens zdefiniowane i dostępne w Tailwind
- ✅ Self-hosted fonty preloadowane w Base layout
- ✅ Middleware blokuje /admin bez session
- ✅ Env vars załadowane i testowane

---

## STAGE 2: Frontend One-Page Landing + Komponenty

### Purpose
Zbudowanie responsywnego one-page landing z hero (ASCII + zdjęcie + typing effect), sekcjami, pixel art ikonkami i Lighthouse 100.

### Depends on
Stage 1

### Key Components

**2.1 – Base Layout (`src/components/layouts/Base.astro`)**
- HTML5 shell z preload font linkkami
- Meta tags: charset, viewport, theme-color
- Tailwind global stylesheet
- Favicon linkki

**2.2 – Landing Layout (`src/components/layouts/Landing.astro`)**
- Wrapper dla one-page
- Extends Base

**2.3 – Hero Component (`src/components/Hero.astro`)**
- Zdjęcie Przemysława (w Hero sekcji) — responsywne `<picture>` z WebP + JPEG fallback
- ASCII art retro (`<pre>` tag, font Courier Prime)
  ```
    ██████╗ ███████╗
    ██╔══██╗██╔════╝
    ██████╔╝█████╗
    ██╔═══╝ ██╔══╝
    ██║     ██║
    ╚═╝     ╚═╝
  ```
  - Kolor: `--gold` (#d6b779)
  - Animacja: fade-in z góry (0.3s)
  
- Imię pod ASCII: "Przemysław Filipiak" (font Courier Prime, `--text-xl`)
  - Animacja: fade-in 0.5s delay

- Tagline: "Builder. AI Dev. Deep Work Founder."
  - Typing effect: vanilla JS (patrz personalpage.md, sekcja 11)
  - Blinkający kursor: `▋` w `--gold`, blink 0.8s cycle
  - Animacja: pojawia się po 1.2s delay

- Two CTA buttons:
  - Primary: "Czytaj blog" (teal border + hover fill)
  - Secondary: "GitHub ↗" (ghost)

- Pixel art ikonki (2-3 na dole hero) — deleguj do PixelIcon.astro

- Responsive: na mobile ASCII skraca się do inicjałów `P·F` lub mniejszej wersji

**2.4 – PixelIcon Component (`src/components/PixelIcon.astro`)**
- Canvas-based rendering 12×12 pikseli
- Props: `name` ('ai', 'rocket', 'terminal', 'bot'), `size` (48, 64, itp.)
- Sprite matrix z personalpage.md, sekcja 8
- Color map: teal/violet/gold
- Animacja: optionalny sine bobbing (JS)

**2.5 – About Section (`src/components/About.astro`)**
- Heading: "/about"
- Bio tekst (z personalpage.md, sekcja 6.2)
- Focus areas: lista ikon + nazwy
  - 🤖 AI Development → PixelIcon `ai`
  - ⚡ Performance → PixelIcon lightning (lub custom)
  - 📖 Deep Work → PixelIcon (custom)
  - 🌱 Building in Public → PixelIcon (custom)

**2.6 – Projects Section (`src/components/Projects.astro`)**
- Heading: "/projects"
- ProjectCard component (2-3 karty w rzędzie / 1 na mobile)
- Dane hardcoded lub z JSON:
  ```json
  [
    {
      "name": "frinter.",
      "tagline": "Focus OS for founders",
      "description": "System operacyjny dla skupionego umysłu.",
      "stack": ["React", "Vite", "Postgres"],
      "links": [{ "label": "frinter.app", "url": "https://frinter.app" }],
      "featured": true
    },
    {
      "name": "FrinterFlow",
      "tagline": "Local voice dictation CLI",
      "description": "Dyktowanie bez chmury. Python. Szybko.",
      "stack": ["Python", "faster-whisper"],
      "links": [
        { "label": "PyPI", "url": "https://pypi.org/project/frinterflow/" },
        { "label": "GitHub", "url": "https://github.com/delta240mvt" }
      ],
      "featured": false
    }
  ]
  ```
- ProjectCard design:
  - Pixel art logo (48×48 canvas)
  - Tytuł + description
  - Tech stack (tagi w `--violet`)
  - Linki (CTA buttons)
  - Border hover effect (`--teal-glow` box-shadow)
  - Featured: złoty border + `★` label

**2.7 – Blog Preview Section (`src/components/BlogPreview.astro`)**
- Heading: "/blog"
- Query DB: `articles` where `status = 'published'` ORDER BY `publishedAt` DESC LIMIT 3
- BlogCard component dla każdego artykułu
- BlogCard design:
  - Title (h3)
  - Description (preview tekst)
  - Meta: reading time, publish date, tags
  - Border hover, fade transition
  - Featured: złoty background
- CTA: "[ → Wszystkie artykuły ]" link do `/blog`

**2.8 – Contact Section (`src/components/Contact.astro`)**
- Heading: "/contact"
- Tekst (z personalpage.md, sekcja 6.5)
- Linki jako listy:
  - LinkedIn
  - GitHub
  - Email (`mailto:...`)
  - Twitter/X
- Style: ghost buttons, hover effect

**2.9 – Nav Component (`src/components/Nav.astro`)**
- Sticky top, `backdrop-filter: blur(8px)` + semi-transparent bg
- Logo: `P·F` (monospace, `--teal`)
- Links: O mnie, Blog, Projekty, GitHub ↗
- Mobile: hamburger/details element lub bottom bar
- Active state detection (por. current pathname)

**2.10 – Footer (`src/components/Footer.astro`)**
- Copyright + current year
- Small links (Privacy, RSS, llms.txt)
- Built with Astro note

**2.11 – Animations (`src/styles/animations.css`)**
- `@keyframes fadeInDown`, `fadeInUp`, `blink`, `reveal`
- Scroll-triggered animations via Intersection Observer (vanilla JS)
- Obowiązkowy plik: `src/utils/animations.ts`
  ```typescript
  export function observeRevealElements() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
  ```

**2.12 – Main Page (`src/pages/index.astro`)**
```astro
---
import Base from '@/components/layouts/Base.astro';
import Landing from '@/components/layouts/Landing.astro';
import Hero from '@/components/Hero.astro';
import About from '@/components/About.astro';
import Projects from '@/components/Projects.astro';
import BlogPreview from '@/components/BlogPreview.astro';
import Contact from '@/components/Contact.astro';
---

<Base>
  <Landing>
    <Hero />
    <About />
    <Projects />
    <BlogPreview />
    <Contact />
  </Landing>
</Base>

<script>
  import { observeRevealElements } from '@/utils/animations';
  document.addEventListener('DOMContentLoaded', observeRevealElements);
</script>
```

**2.13 – Lighthouse Optimization**
- Zero render-blocking scripts (async/defer)
- Inline critical CSS dla hero
- Preload fonty
- Image optimization: width/height attributes (brak CLS)
- Minify CSS/HTML via Astro build
- CLS target: 0 (fixed image dimensions)
- LCP target: < 1.5s (ASCII pre = pure text, instant)
- INP target: < 100ms (minimal JS)

### Success Criteria
- ✅ Landing page responsywny (mobile, tablet, desktop)
- ✅ Lighthouse 100/100/100/100 na desktop i mobile
- ✅ Hero z zdjęciem, ASCII, typing effect, kursorem
- ✅ Pixel art ikonki renderują się poprawnie
- ✅ Alle sekcje widoczne i sczytane
- ✅ CLS = 0, LCP < 1.5s
- ✅ Żadnych externe images poza WebP/JPEG
- ✅ CSS variables zaaplikowane wszędzie

---

## STAGE 3: Blog SSR + Dynamic Content Feed

### Purpose
Setup SSR bloga z artykułami trzymanymi w PostgreSQL, dynamiczne generowanie RSS i sitemap, SEO optimizacja.

### Depends on
Stage 1, Stage 2

### Key Components

**3.1 – Blog Layout (`src/components/layouts/BlogPost.astro`)**
- Extends Base
- Article wrapper z typografią (Tailwind @apply)
- Sidebar (optional): recent posts, tags

**3.2 – Blog List Page (`src/pages/blog/index.astro`)**
- Query: `articles` where `status = 'published'` ORDER BY `publishedAt` DESC
- Pagination: 10 na stronę (params: `?page=1`)
- Filter po tagach: query param `?tag=deep-work`
- BlogCard dla każdego artykułu
- Meta: `<title>Blog — Przemysław Filipiak</title>`, `<meta name="description">`
- JSON-LD: `CollectionPage` schema

**3.3 – Dynamic Blog Post Page (`src/pages/blog/[slug].astro`)**
```astro
---
import BlogPost from '@/components/layouts/BlogPost.astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getStaticPaths() {
  // W SSR mode, to nie będzie używane, ale dla prerendering:
  const allArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.status, 'published'));
  
  return allArticles.map(article => ({
    params: { slug: article.slug },
    props: { article }
  }));
}

const { slug } = Astro.params;
const [article] = await db
  .select()
  .from(articles)
  .where(eq(articles.slug, slug))
  .limit(1);

if (!article) {
  return Astro.redirect('/404');
}
---

<BlogPost {article}>
  <article set:html={article.content} />
  <aside class="metadata">
    <time datetime={article.publishedAt?.toISOString()}>
      {new Intl.DateTimeFormat('pl-PL').format(article.publishedAt)}
    </time>
    <p>{article.readingTime} min read</p>
    <ul>
      {article.tags?.map(tag => <li><a href={`/blog?tag=${tag}`}>{tag}</a></li>)}
    </ul>
  </aside>
</BlogPost>

<script type="application/ld+json" set:html={JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": article.title,
  "description": article.description,
  "datePublished": article.publishedAt?.toISOString(),
  "dateModified": article.updatedAt?.toISOString(),
  "author": { "@type": "Person", "name": "Przemysław Filipiak" }
})} />
```

**3.4 – RSS Feed (`src/pages/rss.xml.ts`)**
```typescript
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Feed } from 'feed';

export async function GET() {
  const feed = new Feed({
    title: 'Blog — Przemysław Filipiak',
    description: 'Essays on AI development, deep work, and building in public',
    id: 'https://przemyslawfilipiak.com',
    link: 'https://przemyslawfilipiak.com',
    language: 'en',
    copyright: `© 2026 Przemysław Filipiak`
  });

  const posts = await db
    .select()
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(50);

  posts.forEach(post => {
    feed.addItem({
      title: post.title,
      id: `https://przemyslawfilipiak.com/blog/${post.slug}`,
      link: `https://przemyslawfilipiak.com/blog/${post.slug}`,
      description: post.description,
      content: post.content,
      author: [{ name: 'Przemysław Filipiak' }],
      date: post.publishedAt || post.createdAt
    });
  });

  return new Response(feed.rss2(), {
    headers: { 'Content-Type': 'application/rss+xml' }
  });
}
```

**3.5 – Sitemap (`src/pages/sitemap.xml.ts`)**
```typescript
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const publishedArticles = await db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(eq(articles.status, 'published'));

  const urls = [
    { loc: 'https://przemyslawfilipiak.com', lastmod: new Date().toISOString() },
    { loc: 'https://przemyslawfilipiak.com/blog', lastmod: new Date().toISOString() },
    ...publishedArticles.map(a => ({
      loc: `https://przemyslawfilipiak.com/blog/${a.slug}`,
      lastmod: a.updatedAt?.toISOString()
    }))
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>
`).join('')}
</urlset>`;

  return new Response(sitemap, { headers: { 'Content-Type': 'application/xml' } });
}
```

**3.6 – llms.txt (Static lub Generated)**
- Plik: `public/llms.txt` (static) lub `src/pages/llms.txt.ts` (dynamic)
- Zawartość (z geo-llm-seo-analiza-frinter.md):
  ```
  # Przemysław Filipiak — Personal Page

  Przemysław Filipiak is a founder and AI developer building
  high-performance, local-first tools at the intersection of
  artificial intelligence and deep work productivity systems.

  ## About
  - Creator of frinter.app — focus operating system for founders
  - Creator of FrinterFlow — local voice dictation CLI (Python, faster-whisper)
  - Specializes in: AI-native product development, Astro, React, Python, GEO
  - Location: Poland
  - Focus: high-performance tools, deep work systems, builder in public

  ## Projects
  - frinter.app: https://frinter.app
  - FrinterFlow: https://pypi.org/project/frinterflow/
  - GitHub: https://github.com/delta240mvt

  ## Blog Topics
  Deep work for developers, AI product development, local-first tools,
  founder productivity, Python AI tooling, Astro framework

  ## Contact
  - GitHub: https://github.com/delta240mvt
  - LinkedIn: [url]
  ```

**3.7 – Article Content Format (Markdown/HTML)**
- Stored jako HTML w DB (parsed z Markdown podczas tworzenia)
- Library do parzenia: `marked` lub `remark` (standalone)
- Atrybuty artykułu:
  - `title`, `slug`, `description`, `content` (HTML)
  - `tags` (array)
  - `featured` (boolean)
  - `readingTime` (obliczane: word count / 200)
  - `status` ('draft' | 'published' | 'archived')
  - `createdAt`, `updatedAt`, `publishedAt`

**3.8 – JSON-LD Schemas**
- `BlogPosting` schema dla artykułów
- `CollectionPage` schema dla listy blogów
- `FAQPage` schema jeśli artykuł ma FAQ sekcję
- Render jako `<script type="application/ld+json">` w Astro

### Success Criteria
- ✅ `/blog` listing działa, dynami z DB
- ✅ `/blog/[slug]` SSR artykuł z poprawnym meta/schema
- ✅ `/rss.xml` zwraca poprawny feed
- ✅ `/sitemap.xml` zawiera wszystkie published artykuły
- ✅ Pagination i tag filtering działają
- ✅ All JSON-LD schemas validate (schema.org)
- ✅ Artykuły mają `readingTime` obliczony
- ✅ Lighthouse na blog pages: 95+ (html + content może być ciężkie)

---

## STAGE 4: Admin Panel + CRM dla Human Checkpoint

### Purpose
Zbudowanie admin panelu do zarządzania artykułami (CRUD) i przeglądania wyników GEO, z logowaniem i session management.

### Depends on
Stage 1, Stage 3

### Key Components

**4.1 – Login Page (`src/pages/admin/login.astro`)**
- Form: email + password (lub tylko password jeśli single admin)
- Endpoint: `POST /api/auth` (patrz 4.5)
- Submit: fetch do endpointu, set `session` cookie (HTTP-only)
- Redirect na `/admin` jeśli success, error message jeśli fail
- Design: minimalistyczny, dark mode, spójny z landing

**4.2 – Admin Dashboard (`src/pages/admin/index.astro`)**
- Chronione middleware (patrz Stage 1.8)
- Sekcje:
  - **Articles Management:**
    - Tabela: [Draft | Published | Archived]
    - Kolumny: slug, title, status, createdAt, actions [Edit, Archive, Delete, Publish]
    - Pagination: 20 na stronę
    - Search by title
  
  - **GEO Stats (Recent Runs):**
    - Tabela z `geo_runs`: runAt, queriesCount, gapsFound, draftsGenerated
    - Last 10 runs
    - CTA: "View Details" → `/admin/geo/[run_id]`
  
  - **Quick Actions:**
    - [+ New Article] button → `/admin/article/new`
    - [Run GEO Monitor Now] button (trigger manual geo-monitor.ts)

**4.3 – Article Editor (`src/pages/admin/article/[id].astro` lub `/admin/article/new`)**
- Form fields:
  - Title (text input)
  - Slug (auto-generated / editable)
  - Description (textarea, max 160 chars)
  - Content (textarea z Markdown, large)
  - Tags (comma-separated input)
  - Featured (checkbox)
  - Status (select: draft, published, archived)
- Actions: [Save], [Publish], [Preview], [Delete]
- Preview mode: render content jako Markdown → HTML
- Autosave every 30s (draft to DB)
- Endpoint `PUT /api/articles/[id]` lub `POST /api/articles`

**4.4 – GEO Details Page (`src/pages/admin/geo/[runId].astro`)**
- Pobierz z DB: `geo_runs` + `geo_queries` gdzie `run_at` = run.runAt
- Tabela queries:
  - Kolumny: query, model, hasMention, gapDetected, createdAt
  - Filter: show only gaps (checkbox)
- Generated drafts: lista artykułów gdzie `createdAt` jest blisko run time i `status = 'draft'`
- CTA: "Publish Draft" → article editor

**4.5 – Auth Endpoint (`src/api/auth.ts` lub Astro endpoint)**
```typescript
import { defineMiddleware } from 'astro:middleware';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function POST({ request }) {
  const body = await request.json();
  const { password } = body;
  
  // Porównaj z hashiem z env
  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH!);
  
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
  }
  
  // Utwórz session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dni
  
  await db.insert(sessions).values({ token, expiresAt });
  
  // Zwróć cookie (Astro ustawi w response)
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7*24*60*60}`
    }
  });
}
```

**4.6 – Articles CRUD Endpoint (`src/api/articles.ts`)**
```typescript
// GET /api/articles?page=1&search=...
export async function GET({ url }) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'published';
  
  const offset = (page - 1) * 20;
  
  let query = db.select().from(articles);
  if (search) query = query.where(like(articles.title, `%${search}%`));
  if (status) query = query.where(eq(articles.status, status));
  
  const results = await query.limit(20).offset(offset);
  const total = await db.select({ count: count() }).from(articles);
  
  return new Response(JSON.stringify({ results, total: total[0].count }));
}

// POST /api/articles
export async function POST({ request }) {
  const body = await request.json();
  
  const result = await db.insert(articles).values({
    slug: generateSlug(body.title),
    title: body.title,
    description: body.description,
    content: body.content,
    tags: body.tags.split(',').map(t => t.trim()),
    featured: body.featured,
    status: body.status,
    readingTime: calculateReadingTime(body.content)
  });
  
  return new Response(JSON.stringify({ id: result[0] }), { status: 201 });
}

// PUT /api/articles/[id]
export async function PUT({ request, params }) {
  const body = await request.json();
  
  await db.update(articles)
    .set({
      ...body,
      updatedAt: new Date(),
      publishedAt: body.status === 'published' ? new Date() : null
    })
    .where(eq(articles.id, parseInt(params.id)));
  
  return new Response(JSON.stringify({ success: true }));
}

// DELETE /api/articles/[id]
export async function DELETE({ params }) {
  await db.delete(articles).where(eq(articles.id, parseInt(params.id)));
  return new Response(JSON.stringify({ success: true }));
}
```

**4.7 – Admin UI Components**
- ArticleTable.astro (tabela z artykułami, actions)
- ArticleForm.astro (form do edycji/tworzenia)
- GeoRunsTable.astro (tabela z GEO runs)
- GeoQueriesTable.astro (queries z danego runu)
- Modal.astro (confirm delete, itp.)

**4.8 – Logout**
- GET /admin/logout
- Clear `session` cookie
- Redirect na `/admin/login`

### Success Criteria
- ✅ Login chroni `/admin` routes
- ✅ Article CRUD działa (create, read, update, delete, publish)
- ✅ Artykuły saved w DB ze statusem `draft` domyślnie
- ✅ GEO dashboard pokazuje ostatnie runs
- ✅ Session token wygasa po 7 dniach
- ✅ Admin UI responsywny i intuicyjny
- ✅ Password hash w env (nie hardcoded)
- ✅ All endpoints require session token (middleware)

---

## STAGE 5: Silnik GEO — Reverse RAG Loop

### Purpose
Automatyczne monitorowanie czy AI poleca Przemysława + Frintera, wykrywanie gaps, generowanie draft artykułów, powiadomienia dla human checkpoint.

### Depends on
Stage 1 (DB), Stage 3 (blog infrastructure), Stage 4 (admin panel)

### Key Components

**5.1 – Query Bank (`scripts/queries.json`)**
```json
{
  "en": [
    "Best deep work app for founders 2026",
    "How to build focus operating system",
    "Productivity system with life balance tracking",
    "Alternative to Forest app for deep work",
    "Polish AI developer tools",
    "frinter.app review",
    "Best focus timer for entrepreneurs",
    "Founder productivity system comparison",
    "Local-first AI tools for developers",
    "How to implement deep work methodology"
  ],
  "pl": [
    "Najlepsza aplikacja do deep work dla founderów",
    "Jak robic prace gleboką bez burnoutu",
    "System produktywności z balansem życia",
    "Alternatywa dla Notion do planowania dnia",
    "Polskie narzędzia AI dla developerów",
    "Frinter.app opinie",
    "Najlepszy timer fokusowy dla przedsiębiorców",
    "Jak zbudować system skupienia"
  ]
}
```

**5.2 – Main Monitor Script (`scripts/geo-monitor.ts`)**
```typescript
import { db } from '../src/db/client';
import { articles, geoQueries, geoRuns } from '../src/db/schema';
import queries from './queries.json';
import { queryOpenAI, queryClaude, queryPerplexity } from './apis';
import { detectGap, generateDraft } from './analysis';
import { notifyDiscord } from './notifier';

async function runGeoMonitor() {
  console.log(`[GEO] Starting monitor run at ${new Date().toISOString()}`);
  
  const allQueries = [...queries.en, ...queries.pl];
  let totalGaps = 0;
  let draftsGenerated = 0;
  
  for (const query of allQueries) {
    const models = ['openai', 'claude', 'perplexity'];
    
    for (const model of models) {
      try {
        let response: string;
        
        if (model === 'openai') {
          response = await queryOpenAI(query);
        } else if (model === 'claude') {
          response = await queryClaude(query);
        } else {
          response = await queryPerplexity(query);
        }
        
        // Detektuj czy odpowiedź zawiera mentions Przemysława/Frintera
        const hasMention = detectMention(response);
        const gapDetected = !hasMention;
        
        // Zapisz do DB
        await db.insert(geoQueries).values({
          query,
          model,
          response,
          hasMention,
          gapDetected
        });
        
        if (gapDetected) {
          totalGaps++;
          
          // Generuj draft artykułu (LLM prompt)
          const draft = await generateDraft(query, response, model);
          
          // Zapisz draft to articles table
          await db.insert(articles).values({
            slug: generateSlugFromQuery(query),
            title: draft.title,
            description: draft.description,
            content: draft.content,
            tags: draft.tags,
            status: 'draft',
            createdAt: new Date()
          });
          
          draftsGenerated++;
        }
      } catch (error) {
        console.error(`[GEO] Error querying ${model}:`, error);
      }
    }
  }
  
  // Zapisz summary runu
  const runSummary = {
    runAt: new Date(),
    queriesCount: allQueries.length * 3, // 3 modele
    gapsFound: totalGaps,
    draftsGenerated
  };
  
  await db.insert(geoRuns).values(runSummary);
  
  // Powiadom
  await notifyDiscord(runSummary);
  
  console.log(`[GEO] Run complete. Gaps: ${totalGaps}, Drafts: ${draftsGenerated}`);
}

function detectMention(response: string): boolean {
  const keywords = ['Przemysław', 'filipiak', 'frinter', 'FrinterFlow'];
  return keywords.some(keyword => response.toLowerCase().includes(keyword.toLowerCase()));
}

if (require.main === module) {
  runGeoMonitor().catch(console.error);
}

export { runGeoMonitor };
```

**5.3 – API Query Wrappers (`scripts/apis.ts`)**

All three models routed via a single OpenRouter key (`OPENROUTER_API_KEY`).
OpenRouter is OpenAI-compatible — uses `openai` SDK with `baseURL: 'https://openrouter.ai/api/v1'`.

```typescript
import { OpenAI } from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

export async function queryOpenAI(query: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'openai/gpt-4-turbo',
    messages: [{ role: 'user', content: query }],
    max_tokens: 1000
  });
  return response.choices[0].message.content || '';
}

export async function queryClaude(query: string): Promise<string> {
  return query('anthropic/claude-sonnet-4-5', query);
}

export async function queryPerplexity(query: string): Promise<string> {
  return query('perplexity/llama-3.1-sonar-small-128k-online', query);
}

export async function queryGemini(query: string): Promise<string> {
  return query('google/gemini-2.0-flash-001', query);
}
```

**5.4 – Draft Generator (`scripts/analysis.ts`)**
```typescript
import { queryOpenAI } from './apis';

export async function generateDraft(
  query: string,
  gapResponse: string,
  model: string
): Promise<{ title: string; description: string; content: string; tags: string[] }> {
  const prompt = `
You are an expert content writer for high-performance founders.
The following query to AI did NOT mention "Przemysław Filipiak" or "frinter.app":

Query: "${query}"
AI Response excerpt: "${gapResponse.substring(0, 500)}..."

Generate a high-density knowledge article that would naturally include mention of frinter
(focus OS for founders) or Przemysław's deep work philosophy.

Return JSON with fields:
{
  "title": "Article Title",
  "description": "SEO description (max 160 chars)",
  "content": "Full Markdown content",
  "tags": ["tag1", "tag2"]
}
`;

  const response = await queryOpenAI(prompt);
  
  try {
    return JSON.parse(response);
  } catch {
    console.error('[GEO] Failed to parse draft JSON');
    return {
      title: `Response to: ${query}`,
      description: 'Generated article from GEO analysis',
      content: response,
      tags: ['generated', 'geo']
    };
  }
}

export function generateSlugFromQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .slice(0, 7)
    .join('-');
}
```

**5.5 – Notifier (`scripts/notifier.ts`)**
```typescript
interface RunSummary {
  runAt: Date;
  queriesCount: number;
  gapsFound: number;
  draftsGenerated: number;
}

export async function notifyDiscord(summary: RunSummary): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  const embed = {
    title: '🤖 GEO Monitor Run Complete',
    fields: [
      { name: 'Queries Run', value: summary.queriesCount.toString() },
      { name: 'Gaps Found', value: summary.gapsFound.toString() },
      { name: 'Drafts Generated', value: summary.draftsGenerated.toString() },
      { name: 'Run Time', value: summary.runAt.toISOString() }
    ],
    color: summary.draftsGenerated > 0 ? 16776960 : 7506394 // żółty / szary
  };

  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
}

export async function notifyEmail(summary: RunSummary): Promise<void> {
  // Nodemailer implementacja — opcjonalnie zamiast Discord
}
```

**5.6 – CRON Setup**
- **Opcja A: GitHub Actions (Recommended dla start)**
  - Plik: `.github/workflows/geo-monitor.yml`
  ```yaml
  name: GEO Monitor
  on:
    schedule:
      - cron: '0 9 * * 0' # Niedziela 9 AM UTC
  jobs:
    monitor:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: 18
        - run: npm ci
        - run: npx tsx scripts/geo-monitor.ts
          env:
            DATABASE_URL: ${{ secrets.DATABASE_URL }}
            OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
            DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
  ```

- **Opcja B: Cloudflare Workers Scheduled**
  - Trigger URL endpoint co tydzień (jeśli hostujesz na CF Pages + Edge Functions)

**5.7 – Package.json Scripts**
```json
{
  "scripts": {
    "geo:monitor": "tsx scripts/geo-monitor.ts",
    "geo:monitor:test": "OPENROUTER_API_KEY=test npm run geo:monitor"
  }
}
```

### Success Criteria
- ✅ Query bank zawiera min. 20 zapytań EN + 10 PL
- ✅ Script odpytuje 4 modele (GPT-4.1 Mini, Claude Sonnet 4.6, Perplexity, Gemini 3.1 Pro Preview)
- ✅ Gap detection działa (finds missing mentions)
- ✅ Draft articles generowane i saved w DB ze statusem `draft`
- ✅ GEO runs tracked w `geo_runs` tabeli
- ✅ Discord notifications wysyłane po każdym runie
- ✅ CRON job uruchamiany weekly (GitHub Actions)
- ✅ Wszystkie API keys w env vars
- ✅ Admin dashb widzi wygenerowane drafty do akceptacji

---

## STAGE 6: GEO Technical Foundations (SEO/Entity Building)

### Purpose
Upewnienie się, że AI crawlery mogą znaleźć i zrozumieć Przemysława + Frintera. Setup fundamentalnych plików SEO.

### Depends on
Stage 1 (mostly tech setup)

### Key Components

**6.1 – robots.txt**
- Plik: `public/robots.txt`
- Content (z personalpage.md + geo-llm-seo-analiza-frinter.md):
  ```
  User-agent: *
  Allow: /

  User-agent: GPTBot
  Allow: /

  User-agent: Claude-Web
  Allow: /

  User-agent: PerplexityBot
  Allow: /

  User-agent: Google-Extended
  Allow: /

  User-agent: CCBot
  Allow: /

  Sitemap: https://przemyslawfilipiak.com/sitemap.xml
  ```

**6.2 – llms.txt**
- Plik: `public/llms.txt` (static) lub `src/pages/llms.txt.ts` (dynamic)
- Content (z personalpage.md, sekcja 7.4):
  ```
  # Przemysław Filipiak — Personal Page

  > Przemysław Filipiak is a founder and AI developer building
  > high-performance, local-first tools at the intersection of
  > artificial intelligence and deep work productivity systems.

  ## About
  - Creator of frinter.app — focus operating system for founders
  - Creator of FrinterFlow — local voice dictation CLI (Python, faster-whisper)
  - Specializes in: AI-native product development, Astro, React, Python, GEO
  - Location: Poland
  - Focus: high-performance tools, deep work systems, builder in public

  ## Projects
  - frinter.app: https://frinter.app
  - FrinterFlow: https://pypi.org/project/frinterflow/
  - GitHub: https://github.com/delta240mvt

  ## Blog Topics
  Deep work for developers, AI product development, GEO strategy,
  local-first tools, founder productivity, Python AI tooling

  ## Contact
  - GitHub: https://github.com/delta240mvt
  - LinkedIn: [url]
  - Twitter/X: [url]
  - Email: [email]
  ```

**6.3 – JSON-LD Person Schema**
- Location: `src/components/layouts/Base.astro`
- Content:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Przemysław Filipiak",
    "jobTitle": "AI Developer & Founder",
    "description": "Polish founder and AI developer. Creator of frinter.app and FrinterFlow. Specializes in high-performance local-first AI tools and deep work systems.",
    "url": "https://przemyslawfilipiak.com",
    "sameAs": [
      "https://github.com/delta240mvt",
      "https://linkedin.com/in/[URL]",
      "https://twitter.com/[handle]"
    ],
    "knowsAbout": [
      "Artificial Intelligence",
      "Deep Work",
      "Astro Framework",
      "Python",
      "React",
      "Local-first Software",
      "Founder Productivity"
    ],
    "creator": [
      {
        "@type": "SoftwareApplication",
        "name": "frinter.",
        "url": "https://frinter.app"
      },
      {
        "@type": "SoftwareApplication",
        "name": "FrinterFlow",
        "url": "https://pypi.org/project/frinterflow/"
      }
    ]
  }
  ```

**6.4 – OpenGraph + Twitter Card Meta**
- Location: `src/components/layouts/Base.astro` (global) + każdy artykuł (dynamic)
- Global (landing):
  ```html
  <meta property="og:site_name" content="Przemysław Filipiak">
  <meta property="og:title" content="Builder. AI Dev. Deep Work Founder.">
  <meta property="og:description" content="Personal site of Przemysław Filipiak — founder of frinter.app and FrinterFlow.">
  <meta property="og:type" content="profile">
  <meta property="og:url" content="https://przemyslawfilipiak.com">
  <meta property="og:image" content="https://przemyslawfilipiak.com/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Przemysław Filipiak">
  <meta name="twitter:description" content="Builder. AI Dev. Deep Work Founder.">
  <meta name="twitter:image" content="https://przemyslawfilipiak.com/og-image.png">
  ```

**6.5 – Favicon + Icons**
- Pliki:
  - `public/favicon.svg` (SVG, best for scaling)
  - `public/favicon-32x32.png` (fallback)
  - `public/apple-touch-icon.png` (180x180, dla mobile)
- Links w Base:
  ```html
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32x32.png" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#0f172a">
  ```

**6.6 – Entity Consistency Checklist**
- Landing page bio ↔ llms.txt ↔ GitHub bio ↔ LinkedIn
- Wszystkie projekty wymienione w 3+ miejscach
- Tagline identyczne

### Success Criteria
- ✅ `robots.txt` zawiera AI crawlery (GPTBot, Claude-Web, etc.)
- ✅ `llms.txt` dostępny na `/llms.txt` i zawiera kompletny opis
- ✅ Person schema validate (schema.org validator)
- ✅ OG image rendered poprawnie w preview (Twitter, Discord, etc.)
- ✅ Favicon pojawia się w przeglądarce
- ✅ Entity info identyczne na wszystkich platformach
- ✅ All meta tags present w <head>

---

## STAGE 7: Launch, Content Seeding i Lighthouse Audit

### Purpose
Deployment na produkcję, publikacja initial contentu, Lighthouse validation, launch na platformach.

### Depends on
Wszystkie poprzednie stage'i (2-6)

### Key Components

**7.1 – Deployment Setup**
- Host: **Cloudflare Pages** (rekomendacja)
  - Gratis tier + custom domena
  - Astro SSR adapter: `@astrojs/cloudflare`
  - Zero cold starts
  - Analytics built-in
- DB: **Neon PostgreSQL**
  - Free tier: 0.5 GB storage, unlimited API calls
  - Connection pooling dla serverless
- Domain: **przemyslawfilipiak.com** (registrar: Namecheap, Cloudflare Registrar, etc.)

**7.2 – CI/CD Pipeline**
- GitHub Actions workflow (patrz Stage 5.6 dla GEO)
- Deploy na CF Pages:
  ```yaml
  name: Deploy
  on: [push]
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
        - run: npm ci
        - run: npm run build
        - uses: cloudflare/pages-action@v1
          with:
            accountId: ${{ secrets.CF_ACCOUNT_ID }}
            projectName: personal-page
            gitHubToken: ${{ secrets.GITHUB_TOKEN }}
            directory: dist
  ```

**7.3 – Initial Content (Min. 3 Articles)**
Napisane ręcznie, publikowane pre-launch (status: `published`):

1. **"Deep Work dla AI Developerów — Kompletny System 2026"**
   - Topics: focus techniques, Pomodoro vs count-up, frinter philosophy
   - Format: tutorial + personal story
   - Target: "how to do deep work as developer"

2. **"frinter.app — 12 Miesięcy Builowania w Publiku"**
   - Topics: journey, founding story, what learned
   - Format: build-in-public essay
   - Target: founder accountability, shipping

3. **"Astro SSR dla Personal Site — Dlaczego Wybrałem i Nie Żałuję"**
   - Topics: Astro benefits, performance, comparison w.s. Next.js, Hugo
   - Format: technical deep dive + opinion
   - Target: "best framework for developer portfolio", "Astro SSR"

Każdy artykuł ma: TL;DR, body, FAQ, sources, author bio, reading time.

**7.4 – Lighthouse Audit**
- Narzędzie: `npm install -g lighthouse` lub użyj Chrome DevTools
- Pages to audit:
  - `/` (landing)
  - `/blog` (listing)
  - `/blog/[slug]` (artykuł)
  - `/admin/login` (bez żadnych tajnych danych)
- Target: **100/100/100/100** na wszystkich
  - Performance: 100 (zero render-blocking scripts, LCP < 1.5s)
  - Accessibility: 100 (semantic HTML, ARIA na canvas)
  - Best Practices: 100 (HTTPS, no console errors)
  - SEO: 100 (meta tags, schema, mobile friendly)
- Raport: screenshot każdej strony z scoreboards

**7.5 – Pre-Launch Checklist**
- [ ] Domain pointed to Cloudflare NS
- [ ] SSL certificate auto-issued (CF)
- [ ] DATABASE_URL secret set w CF Pages
- [ ] All env vars loaded (test deploy)
- [ ] Cloudflare Analytics enabled
- [ ] /admin login works
- [ ] Blog rendering artykuły z DB
- [ ] RSS feed validates
- [ ] Sitemap.xml returns 200
- [ ] /llms.txt accessible
- [ ] All 3 seeded articles visible on /blog
- [ ] Lighthouse 100/100/100/100

**7.6 – Launch Checklist (Post-Deploy)**
- [ ] Test prod domain works
- [ ] Analytics tracking (Cloudflare)
- [ ] GEO monitor set to run weekly (GitHub Actions)
- [ ] Discord webhook tested (send test notification)
- [ ] Admin can create/edit/publish articles in prod
- [ ] Blog articles indexed by Google (few hours)
- [ ] OG image renders in Twitter/Discord preview
- [ ] Favicon visible

**7.7 – Content Seeding (Post-Launch)**
- [ ] Post initial 3 articles on LinkedIn (build in public)
- [ ] Share blog feed to Reddit r/productivity, r/founders
- [ ] Update GitHub README z link do site
- [ ] Tweet initial "launched personal site" post
- [ ] Setup Product Hunt listing (optional, later)

### Success Criteria
- ✅ Site live na промежuslawfilipiak.com
- ✅ Lighthouse 100/100/100/100 confirmed
- ✅ 3+ published articles visible
- ✅ GEO monitor running weekly
- ✅ Admin panel accessible i functional
- ✅ All env vars secured (no leaks)
- ✅ Analytics collecting data
- ✅ RSS feed valid
- ✅ Initial traffic from seed posts

---

## ARCHITEKTURA TECH DECISIONS

| Decision | Rekomendacja | Alternatywa | Uzasadnienie |
|----------|---------------|-------------|-------------|
| **Database** | Neon PostgreSQL | Cloudflare D1 | PostgreSQL = standard, Drizzle migrations, serverless scaling |
| **Hosting** | Cloudflare Pages | Vercel | CF Pages zero infra, edge analytics, darmowe custom domain |
| **ORM** | Drizzle ORM | Prisma | Drizzle lightweight, type-safe, obsługuje migrations |
| **CRON** | GitHub Actions | Cloudflare Workers | GA darmowy, łatwy setup, logs w GitHub |
| **Notifications** | Discord webhook | Email (Nodemailer) | Discord instant, klikalne linki, free tier |
| **Blog Storage** | PostgreSQL table | MDX w repo | DB = zero rebuilds, instant publish, HUMAN checkpoint |
| **Admin Auth** | Session cookie | JWT | Cookie HTTP-only safer, simpler refresh logic |
| **Font Delivery** | Self-hosted WOFF2 | Google Fonts | Self-hosted faster (no DNS lookup), no cookies, better control |

---

## ENV VARS TEMPLATE

```
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Admin Auth
ADMIN_PASSWORD_HASH=bcrypt_hash_of_password

# GEO Monitor APIs (via OpenRouter)
OPENROUTER_API_KEY=sk-or-...

# Notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Astro/Build
NODE_ENV=production
```

---

## DECYZJE DO PODJĘCIA PRZEZ PRZEMYSŁAWA

| # | Decyzja | Opcje | Default | Impact |
|---|---------|-------|---------|--------|
| 1 | **Baza danych** | Neon PostgreSQL vs Cloudflare D1 | **Neon** | Medium — D1 prostsze ale ograniczone, Neon skaluje |
| 2 | **CRON Trigger** | GitHub Actions vs Cloudflare Workers | **GA** | Low — oba działają, GA lepsze logs |
| 3 | **Notyfikacje** | Discord vs Email | **Discord** | Low — Discord szybciej zobaczy, email bardziej formal |
| 4 | **Admin Password** | Single password vs OAuth | **Single** | Medium — OAuth później, password teraz faster |
| 5 | **Blog Content Format** | Markdown (string) vs JSON-LD struktura | **Markdown** | Low — Markdown prosty do edycji, renderuj w API |
| 6 | **Analytics** | Cloudflare Analytics vs Fathom | **CF Analytics** | Low — CF built-in, Fathom privacy, obaj OK |
| 7 | **CDN Images** | Cloudflare Image Optimization vs self-serve | **CF Images** | Low — CF Images auto resize, self-serve wolniej |

---

## TIMELINE ESTIMATE (Bez time references!)

| Stage | Deps | Effort | Notes |
|-------|------|--------|-------|
| 1 | None | 2-3 dev days | Tech setup, migrations, env |
| 2 | 1 | 3-4 dev days | Components, animations, Lighthouse |
| 3 | 1, 2 | 1-2 dev days | SSR blog routes, RSS, sitemap |
| 4 | 1, 3 | 2-3 dev days | Admin CRUD, auth, sessions |
| 5 | 1, 3, 4 | 2-3 dev days | GEO script, API integrations, CRON |
| 6 | 1 | 0.5 dev day | robots.txt, llms.txt, schema |
| 7 | All | 1-2 dev days | Deploy, seeding, audit |

**Total:** ~12-18 developer days (solo). Stages bez zależności mogą być parallelizowane.

---

## CONTINUITY & NEXT STEPS

Po wdrożeniu (Stage 7):

1. **Weekly GEO Runs:** Automatic generation draft articles 
2. **Monthly Content:** 2-3 artykuły ręcznie + draft review z GEO
3. **Quarterly Audit:** Entity consistency, Lighthouse, analytics review
4. **Long-term:** Expands to Perplexity docs, Medium publication, newsletter (later)

---

**Ostatnia aktualizacja:** 2026-03-08  
**Status:** ✅ Plan gotowy do wdrożenia
