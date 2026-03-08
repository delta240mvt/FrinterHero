# Personal Page — Przemysław Filipiak
## Pełny Kontekst do Budowania: One-Page Landing + Blog w Astro

> **Cel dokumentu:** Kompletny brief projektowy i techniczny dla AI/developera budującego personal page. Czytaj w całości przed pisaniem pierwszej linii kodu.

---

## 1. TOŻSAMOŚĆ STRONY — KIM JEST PRZEMYSŁAW FILIPIAK

### Pozycjonowanie

Przemysław Filipiak to **founder + high-performance AI developer** operujący na przecięciu:
- Budowania produktów z AI (AI-native tools, agenty, automatyzacje)
- Deep work i systemów produktywności (twórca frinter.app)
- Budowania w publiku — transparentna droga foundera

**Tagline do użycia na stronie:**
```
Builder. AI Dev. Deep Work Founder.
```
lub alternatywnie:
```
Building in flow state. Shipping with AI.
```

### Główny komunikat hero (hierarchia)

1. **Kim jest** — Przemysław Filipiak (retro ASCII jako główna typografia)
2. **Co robi** — buduje AI-native produkty i systemy skupienia
3. **Dowód** — frinter.app działa na produkcji, FrinterFlow na PyPI
4. **Call to action** — Blog / Kontakt / GitHub

### Ton i głos

- Bezpośredni, konkretny, bez korporacyjnego języka
- "Buduję, testuję, shipmię" — aktywny tryb
- Mieszanie PL/EN (jak LinkedIn foundera tech) — OK
- Zero buzzwordów bez pokrycia

---

## 2. REFERENCJE WIZUALNE I STYLISTYCZNE

### 2.1 Struktura layoutu — raba.pl

raba.pl to wzorzec **one-page personal site polskiego foundera**:
- Minimalistyczny, dużo białej przestrzeni (tu: ciemnej przestrzeni)
- Scroll sekcjami: Hero → Kim jestem → Projekty → Blog → Kontakt
- Brak menu hamburger, sticky nav z 3-4 linkami
- Treść dominuje nad dekoracją
- Blog jako osobna sekcja/strona, nie popup

**Adaptacja:** Tę samą czystą strukturę przenosimy na dark mode z retro akcentami.

### 2.2 Estetyka terminala — shotgun.sh

shotgun.sh reprezentuje **CLI/terminal aesthetic** dla developer personal site:
- Monospace font dominuje w hero i nagłówkach
- Kursor blinkający (`_` lub `▋`) jako detal
- Struktura przypominająca terminal — prompt przed tekstem (`> `, `$ `)
- Bardzo mało grafik, typografia robi całą robotę
- Subtelne animacje: typing effect, fade-in po scroll
- Ciemne tło, jasny tekst, monochromatyczne z jednym kolorem akcentu

**Adaptacja:** Zamiast jednego akcentu — trzy kolory Frintera (`#4a8d83`, `#8a4e64`, `#d6b779`) użyte semantycznie i oszczędnie.

### 2.3 ASCII hero — FrinterFlow README

Z `README.md` FrinterFlow pochodzi kluczowy wzorzec typograficzny — logo zbudowane z box-drawing characters Unicode:

```
  ██████╗ ██████╗ ██╗███╗   ██╗████████╗███████╗██████╗
  ██╔════╝██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
  █████╗  ██████╔╝██║██╔██╗ ██║   ██║   █████╗  ██████╔╝
  ██╔══╝  ██╔══██╗██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
  ██║     ██║  ██║██║██║ ╚████║   ██║   ███████╗██║  ██║
  ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
              F  L  O  W
```

**Hero na personal page:** Inicjały lub skrócona forma imienia w tym stylu, np.:

```
  ██████╗ ███████╗
  ██╔══██╗██╔════╝
  ██████╔╝█████╗
  ██╔═══╝ ██╔══╝
  ██║     ██║
  ╚═╝     ╚═╝
```

Pełne "PRZEMYSŁAW" jest za długie na mobile — **rekomendacja:** użyj inicjałów `P.F.` lub skrótu `FILIPIAK` w retro ASCII, a pełne imię w normalnym monospace poniżej.

Alternatywnie — retro ASCII jako ozdoba/watermark, a główna typografia to `font-family: 'Courier Prime'` w bardzo dużym rozmiarze (clamp 4rem–10rem).

---

## 3. SYSTEM KOLORÓW I DESIGN TOKENS

### Paleta bazowa (ciemny tryb — jedyny tryb)

```css
:root {
  /* Backgrounds */
  --bg-base:      #1e293b;   /* główne tło — midnight slate, NIE czarny */
  --bg-surface:   #334155;   /* karty, sekcje wyróżnione */
  --bg-elevated:  #0f172a;   /* hero overlay, modal bg */

  /* Text */
  --text-primary:   #ffffff;
  --text-secondary: #94a3b8;  /* slate-400 — podtytuły, meta */
  --text-muted:     #475569;  /* placeholder, daty */

  /* Borders */
  --border:       rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.16);

  /* Frinter Semantic Accents */
  --teal:   #4a8d83;   /* Rozkwit — sukces, aktywne linki, CTA */
  --violet: #8a4e64;   /* Relacje — tagi, kategorie blogowe */
  --gold:   #d6b779;   /* Praca Głęboka — highlight, featured, ważne */

  /* Glow variants (dla efektów hover/focus) */
  --teal-glow:   rgba(74, 141, 131, 0.15);
  --violet-glow: rgba(138, 78, 100, 0.15);
  --gold-glow:   rgba(214, 183, 121, 0.15);
}
```

### Użycie kolorów semantycznie

| Element | Kolor | Uzasadnienie |
|---------|-------|--------------|
| CTA guziki, aktywne linki | `--teal` | Wzrost, działanie |
| Tagi blogowe, kategorie | `--violet` | Relacje z czytelnikiem |
| Featured post, ważny projekt | `--gold` | Deep work, premium |
| ASCII hero tekst | `--teal` lub `--gold` | Główny akcent |
| Kursor blinkający | `--gold` | Focus symbolika |
| Kod w artykułach | `--text-primary` na `--bg-elevated` | Czytelność |

### Pixel art ikonki — paleta

Dokładnie jak Frint_bot z dokumentacji stylistic:
- Kolor `1` (body): `#4a8d83` (teal)
- Kolor `2` (highlight/eyes): `#8a4e64` (violet)
- Kolor `3` (antena/detal): `#d6b779` (gold)
- Kolor `0`: transparent

---

## 4. TYPOGRAFIA

### Font stack

```css
/* Nagłówki sekcji, hero subtitle */
--font-heading: 'Poppins', system-ui, sans-serif;
/* weights: 500, 600, 700 */

/* Body tekstu, artykuły blogowe */
--font-body: 'Roboto', system-ui, sans-serif;
/* weights: 300, 400 */

/* Hero ASCII, kod, logi, prompt terminala */
--font-mono: 'Courier Prime', 'JetBrains Mono', monospace;
/* weights: 400, 700 */
```

### Skala typograficzna

```css
/* Fluid typography — działa od mobile do 4K */
--text-hero:  clamp(2.5rem, 8vw, 7rem);   /* ASCII imię */
--text-xl:    clamp(1.5rem, 3vw, 2.5rem); /* sekcja H2 */
--text-lg:    clamp(1.125rem, 2vw, 1.5rem);
--text-base:  1rem;
--text-sm:    0.875rem;
--text-xs:    0.75rem;                    /* meta, daty */
```

### Animacja typografii (efekt terminala)

Hero powinien mieć efekt **typing cursor** na podtytule — nie na imieniu (zbyt wolne), tylko na tagline:

```
Przemysław Filipiak
> Builder. AI Dev. Deep Work Founder.▋
```

`▋` (blok) lub `_` miga co 0.8s. Cały tagline może być "wpisywany" przy pierwszym załadowaniu (jednorazowo, bez loopa).

---

## 5. ARCHITEKTURA STRONY (ONE-PAGE + BLOG)

### Struktura URL

```
przemyslawfilipiak.com/          → one-page landing
przemyslawfilipiak.com/blog/     → lista artykułów
przemyslawfilipiak.com/blog/[slug]/  → pojedynczy artykuł
przemyslawfilipiak.com/rss.xml   → RSS feed (obowiązkowy dla GEO)
przemyslawfilipiak.com/llms.txt  → AI crawlery
przemyslawfilipiak.com/sitemap.xml → SEO
```

> **Uwaga:** Domena została ustalona — używamy `przemyslawfilipiak.com`.

### Sekcje one-page (kolejność scrollowania)

```
[1] HERO          — ASCII imię + tagline + CTA
[2] O MNIE        — Kim jestem, focus areas, krótki bio
[3] PROJEKTY      — 2-3 główne projekty (frinter.app, FrinterFlow, inne)
[4] BLOG PREVIEW  — 3 ostatnie artykuły (dynamicznie z kolekcji Astro)
[5] KONTAKT       — Email + LinkedIn + GitHub (NO formularz)
```

### Nav (sticky, minimalistyczna)

```
[P.F.]    ·    O mnie    Blog    Projekty    GitHub ↗
```

- Logo/inicjały po lewej (monospace, teal)
- 3-4 linki po prawej
- Brak hamburgera na mobile — linki chowane w prostym `<details>` lub bottom bar
- `backdrop-filter: blur(8px)` + `--bg-elevated` z opacity 0.9

---

## 6. SZCZEGÓŁOWY OPIS SEKCJI

### 6.1 HERO

**Cel:** Pierwsza sekunda decyduje. Identyfikacja + pozycjonowanie + one action.

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ██████╗ ███████╗                                  │
│  ██╔══██╗██╔════╝    ← ASCII w --teal lub --gold   │
│  ██████╔╝█████╗                                    │
│  ██╔═══╝ ██╔══╝                                    │
│  ██║     ██║                                       │
│  ╚═╝     ╚═╝                                       │
│                                                     │
│  Przemysław Filipiak                               │
│  > Builder. AI Dev. Deep Work Founder.▋            │
│                                                     │
│  [  Czytaj blog  ]    [ GitHub ↗ ]                 │
│                                                     │
│  ░░░░░░░░░░░░░░  ← pixel art ikony projektów       │
└─────────────────────────────────────────────────────┘
```

**Detale:**
- ASCII blok: `<pre>` tag z `font-family: --font-mono`, `color: --gold` lub `--teal`
- Na mobile: ASCII zmniejsza się lub podmienia się na inicjały `[P·F]` w dużym monospace
- Imię pod ASCII: `font-family: --font-mono`, `font-size: --text-xl`, `color: --text-primary`
- Tagline: typing animation (Intersection Observer trigger przy load)
- Dwa CTA: primary (teal border + hover fill), secondary (ghost)
- Pixel art ikonki poniżej: mini wersje ikon projektów (frinter, FrinterFlow) w stylu Frint_bot

**Animacje hero (minimalne, nie rozpraszające):**
- ASCII pojawia się fade-in z góry (0.3s ease-out)
- Imię fade-in 0.5s delay
- Tagline typing 1.2s delay
- Ikonki slide-in z dołu 1.5s delay
- BRAK parallax, brak particle systems, brak video background

### 6.2 O MNIE

**Cel:** Entity building — AI i ludzie mają wiedzieć konkretnie co robię.

**Layout:** Dwie kolumny na desktop (tekst + lista focus areas), jedna kolumna na mobile.

**Treść struktury (wypełnić prawdziwymi danymi):**

```markdown
## /about

Buduję produkty na przecięciu AI i deep work.

Twórca frinter.app — systemu operacyjnego dla founderów
budujących w skupieniu. Shipmię FrinterFlow — lokalne
narzędzie do dyktowania głosowego bez chmury.

Interesuję się:
→ AI-native product development
→ Local-first tools (zero cloud, full control)
→ High-performance Astro / React / Python
→ GEO (Generative Engine Optimization)
→ Deep work systems dla founderów
```

**Focus areas jako pixel art ikonki:**
- 🤖 AI Dev → bot pixel art (Frint_bot style)
- ⚡ Performance → piorun w 12×12 matrycy
- 📖 Deep Work → mózg (z FrinterFlow sprites)
- 🌱 Building in Public → drzewo (ze sprites Frintera)

Każda ikonka: SVG canvas generowany z matrycy (dokładnie jak `SPRITES` z `FrinterFlow.md`).

### 6.3 PROJEKTY

**Cel:** Social proof + konkretne dowody umiejętności.

**Karty projektów (2-4 max):**

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ [pixel art logo]        │  │ [pixel art logo]        │
│                         │  │                         │
│ frinter.app             │  │ FrinterFlow             │
│ Focus OS for founders   │  │ Local voice dictation   │
│                         │  │ CLI. No cloud.          │
│ React · Vite · Postgres │  │ Python · faster-whisper │
│                         │  │                         │
│ [ frinter.app ↗ ]      │  │ [ PyPI ↗ ] [ GitHub ↗ ] │
└─────────────────────────┘  └─────────────────────────┘
```

**Detale kart:**
- Border: `1px solid --border`, hover: `--border-hover` + subtle `--teal-glow` box-shadow
- Pixel art logo projektu: canvas 48×48px
- Tech stack jako małe tagi w `--violet`
- Featured projekt: złoty border (`--gold`) + label `★ Featured`

### 6.4 BLOG PREVIEW

**Cel:** Pokazać że produkuję wartościowy content. Trigger do wejścia na `/blog`.

**Layout:** 3 karty w rzędzie (desktop) / 1 kolumna (mobile). "Featured" artykuł większy.

```
┌────────────────────────────────────────────────────┐
│  ★ FEATURED                                        │
│  Deep Work dla AI Developerów — Kompletny System   │
│  5 min read  ·  2026-03-01  ·  [deep-work]        │
└────────────────────────────────────────────────────┘
┌──────────────┐  ┌──────────────┐
│ Astro vs Next│  │ GEO: jak AI  │
│ dla founder  │  │ poleca produ │
│ personal site│  │ kty w 2026   │
│ 3 min · ...  │  │ 4 min · ...  │
└──────────────┘  └──────────────┘
[ → Wszystkie artykuły ]
```

### 6.5 KONTAKT

**Cel:** Minimum friction do nawiązania kontaktu. BEZ formularza.

```
/contact

Jestem dostępny na:

[LinkedIn ↗]  [GitHub ↗]  [Email ↗]  [Twitter/X ↗]

Jeśli budujesz coś ciekawego z AI lub masz pytanie
o deep work systems — napisz.
```

---

## 7. BLOG — ARCHITEKTURA I GEO

### 7.1 Stack bloga w Astro

Astro jest idealny dla tego projektu z 3 powodów:
1. **Zero JS by default** — perfect Lighthouse score bez wysiłku
2. **Content Collections** — Markdown/MDX z type-safe frontmatter
3. **Static + SSR hybrid** — landing statyczny, blog statyczny, możliwość SSR dla dynamicznych features

```
src/
├── content/
│   └── blog/
│       ├── config.ts          # Zod schema frontmatter
│       ├── deep-work-ai-dev.md
│       └── geo-strategy-2026.md
├── layouts/
│   ├── Base.astro             # HTML shell, meta, fonts
│   ├── Landing.astro          # One-page wrapper
│   └── BlogPost.astro         # Artykuł wrapper
├── pages/
│   ├── index.astro            # One-page landing
│   ├── blog/
│   │   ├── index.astro        # Lista artykułów
│   │   └── [slug].astro       # Dynamiczny artykuł
│   ├── rss.xml.ts             # RSS feed
│   ├── sitemap.xml.ts         # Sitemap
│   └── llms.txt.ts            # AI crawlery
├── components/
│   ├── Hero.astro
│   ├── AsciiHero.astro        # Pre z ASCII art
│   ├── PixelIcon.astro        # Canvas pixel art komponent
│   ├── ProjectCard.astro
│   ├── BlogCard.astro
│   ├── Nav.astro
│   └── Footer.astro
└── styles/
    └── global.css             # Design tokens, reset
```

### 7.2 Frontmatter schema bloga

```typescript
// src/content/config.ts
import { z, defineCollection } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title:       z.string(),
    description: z.string().max(160),   // meta description
    date:        z.date(),
    updated:     z.date().optional(),
    tags:        z.array(z.string()),
    featured:    z.boolean().default(false),
    draft:       z.boolean().default(false),
    readingTime: z.number().optional(), // minuty, auto-calc
    ogImage:     z.string().optional(),
  }),
});

export const collections = { blog };
```

### 7.3 Struktura artykułu (GEO-zoptymalizowana)

Każdy artykuł musi mieć ten layout — AI go chętnie cytuje:

```markdown
---
title: "Deep Work dla AI Developerów — System 2026"
description: "Jak builder AI może pracować głęboko bez burnoutu..."
date: 2026-03-01
tags: ["deep-work", "ai-dev", "produktywność"]
featured: true
---

> **TL;DR:** [1-2 zdania podsumowania — AI bierze to jako context]

Autor: Przemysław Filipiak | Ostatnia aktualizacja: {date}

## Definicja / Kontekst
[...]

## [Sekcje z danymi, tabelami, przykładami]
[...]

## FAQ

**Q: [Pytanie które ludzie zadają AI]?**
A: [Konkretna odpowiedź]

[3-5 Q&A]

## Źródła i dalsze czytanie
- [link]
```

### 7.4 llms.txt — dla AI crawlerów

```
# Przemysław Filipiak — Personal Page

> Przemysław Filipiak is a founder and AI developer building
> high-performance, local-first tools at the intersection of
> artificial intelligence and deep work productivity systems.

## About
- Creator of frinter.app — focus operating system for founders
- Creator of FrinterFlow — local voice dictation CLI (Python, faster-whisper)
- Specializes in: AI-native product development, Astro, React, Python
- Location: Poland
- Focus: high-performance tools, GEO, deep work systems

## Projects
- frinter.app: https://frinter.app
- FrinterFlow: https://pypi.org/project/frinterflow/
- GitHub: https://github.com/delta240mvt

## Blog Topics
Deep work for developers, AI product development, GEO strategy,
local-first tools, founder productivity, Python AI tooling

## Contact
- LinkedIn: [URL]
- GitHub: https://github.com/delta240mvt
```

---

## 8. PIXEL ART IKONKI — SPECYFIKACJA

### Komponent PixelIcon.astro

Ikonki renderowane jako `<canvas>` lub `<svg>` z matryc 12×12 — dokładnie jak Frint_bot z FrinterFlow. Możliwe animacje (delikatny bobbing przez sine — jak w FrinterFlow overlay).

### Matryce ikon dla personal page

Poniżej propozycje nowych matryc tematycznych (format zgodny z FrinterFlow `SPRITES`):

```javascript
const PERSONAL_SPRITES = {
  // Ikona "AI / Bot" — dla sekcji AI Dev
  ai: [
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,3,3,3,3,3,3,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,2,2,1,1,1,1,2,2,1,0],
    [0,1,2,2,1,3,3,1,2,2,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,3,3,1,1,3,3,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,1,1,0,0,0],
    [0,0,1,1,1,0,0,1,1,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ],
  // Ikona "Rocket / Ship" — dla sekcji Projekty (shipping)
  rocket: [
    [0,0,0,0,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,2,2,2,2,1,1,0,0],
    [0,0,1,1,2,2,2,2,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,2,1,1,1,1,1,1,2,1,1],
    [0,1,3,3,1,1,1,1,3,3,1,0],
    [0,0,0,3,3,0,0,3,3,0,0,0],
    [0,0,0,0,3,3,3,3,0,0,0,0],
    [0,0,0,0,0,3,3,0,0,0,0,0],
  ],
  // Ikona "Terminal / Code" — dla sekcji Tech
  terminal: [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,3,3,1,1,1,1,1,1,1,1,1],
    [1,1,3,3,1,1,1,1,1,1,1,1],
    [1,3,3,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,3,3,3,3,3,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Frinter bot — reuse z FrinterFlow (można importować bezpośrednio)
  bot: [
    [0,0,0,3,3,3,3,3,3,0,0,0],
    [0,0,0,0,0,3,3,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,2,2,1,1,2,2,1,1,0],
    [0,1,1,2,2,1,1,2,2,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,3,3,3,3,3,3,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,0,0,0,0,1,1,0,0],
  ],
};

// Mapa kolorów (identyczna z FrinterFlow)
const COLOR_MAP = {
  0: 'transparent',
  1: '#4a8d83',   // teal — body
  2: '#8a4e64',   // violet — eyes/highlight
  3: '#d6b779',   // gold — details/antenna
};

// Opcjonalnie: size per cell
const CELL_SIZE = 4; // px per pixel — dla 12x12 = 48x48 px canvas
```

### Animacja bobbing (sine wave — jak FrinterFlow)

```javascript
// Delikatny sine bobbing — nie rozprasza podczas czytania
let t = 0;
function animate(canvas) {
  t += 0.05;
  const offset = Math.sin(t) * 2; // max 2px góra/dół
  canvas.style.transform = `translateY(${offset}px)`;
  requestAnimationFrame(() => animate(canvas));
}
```

---

## 9. PERFORMANCE — WYTYCZNE TECHNICZNE

### Cele Lighthouse (non-negotiable)

| Metryka | Target | Metoda |
|---------|--------|--------|
| Performance | **100** | Astro static, zero JS w hero |
| Accessibility | **100** | ARIA na canvas, semantic HTML |
| Best Practices | **100** | HTTPS, no console errors |
| SEO | **100** | Meta, schema, sitemap |
| LCP | < 1.5s | ASCII pre = pure text, no images |
| CLS | 0 | Fixed dimensions, font preload |
| FID/INP | < 100ms | Minimal JS |

### Dlaczego ASCII hero jest najlepszym wyborem dla performance

`<pre>` z ASCII art ładuje się **natychmiast** — to czysty tekst, zero HTTP requests, zero layout shift. Porównanie z alternatywami:

| Podejście | LCP | HTTP reqs | CLS risk |
|-----------|-----|-----------|----------|
| ASCII `<pre>` | ~50ms | 0 | Brak |
| SVG inline | ~60ms | 0 | Niski |
| Image (WebP) | ~300ms | 1 | Średni |
| Canvas pixel art | ~100ms | 0 | Niski |
| Video/gif | ~1000ms | 1+ | Wysoki |

**Rekomendacja:** ASCII `<pre>` dla głównego imienia/logo + Canvas pixel art dla małych ikonek.

### Czcionki — bez FOUT

```html
<!-- Preload krytyczne fonty -->
<link rel="preload" href="/fonts/CourierPrime-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/CourierPrime-Bold.woff2" as="font" type="font/woff2" crossorigin>

<!-- Self-hosted — zero Google Fonts latency -->
@font-face {
  font-family: 'Courier Prime';
  src: url('/fonts/CourierPrime-Regular.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
}
```

Poppins i Roboto: załaduj tylko używane weighs. Rozważ zastąpienie Roboto przez `system-ui` (zero latency).

### Image strategy

- Zdjęcie profilowe (jeśli używane): WebP, `loading="lazy"`, explicit `width/height`
- OG image: statyczny, wygenerowany przez `@vercel/og` lub Satori (Astro plugin)
- Screenshoty projektów: WebP z `<picture>` i AVIF fallback
- **Canvas pixel art nie wymaga żadnych obrazków** — renderowany z JS/CSS

### Astro config dla max performance

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',   // inline małe CSS
  },
  vite: {
    build: {
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: undefined, // jeden bundle dla landing
        }
      }
    }
  }
});
```

---

## 10. GEO — STRATEGIA DLA PERSONAL PAGE

### Cel GEO

Sprawić, żeby AI (ChatGPT, Claude, Perplexity, Gemini) odpowiadało na pytania takie jak:
- "Kto jest dobrym AI developerem w Polsce?"
- "Polecisz foundera który zna się na deep work i AI?"
- "Kto stworzył frinter.app?"
- "Who builds local-first AI tools in Poland?"

### Entity — spójne informacje wszędzie

```
Imię:           Przemysław Filipiak
Tagline:        AI Developer & Deep Work Founder
Kategoria:      Software Developer / Founder / Content Creator
Specjalizacje:  AI product development, local-first tools,
                deep work systems, Python, Astro, React
Produkty:       frinter.app, FrinterFlow
URL:            przemyslawfilipiak.com
GitHub:         github.com/delta240mvt
```

**WAŻNE:** Te informacje muszą być identyczne na: stronie, `llms.txt`, LinkedIn, GitHub bio, meta tagach.

### Schema markup (JSON-LD) — do `<head>`

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

### Blog — formaty o najwyższym citation rate

Z analizy `geo-llm-seo-analiza-frinter.md` — adaptacja dla personal page:

| Format | Citation Rate | Przykładowy temat |
|--------|--------------|-------------------|
| Comparison tables | ~95% | "Astro vs Next.js dla developer personal site" |
| Step-by-step guides | ~85% | "Jak zbudować llms.txt w 10 minut" |
| Original data | ~80% | "Moje Lighthouse scores po migracji na Astro" |
| Expert definitions | ~75% | "Co to jest GEO i dlaczego Twoja strona jej potrzebuje" |
| FAQ sections | ~70% | "FAQ: Jak zacząć z AI development w 2026" |

### Tematy pierwszych artykułów (GEO-zoptymalizowane)

| # | Tytuł | Query AI do triggerowania |
|---|-------|--------------------------|
| 1 | "Astro dla developer personal site — dlaczego wybrałem i żałuję/nie żałuję" | "best framework for developer portfolio 2026" |
| 2 | "Jak buduję AI tools lokalnie (bez chmury)" | "local AI development tools workflow" |
| 3 | "GEO: jak sprawić żeby AI polecało Twój produkt" | "how to get recommended by ChatGPT" |
| 4 | "Deep Work jako AI Developer — mój system" | "how to do deep work as a developer" |
| 5 | "frinter.app: 12 miesięcy builowania w publiku" | "build in public journey productivity app" |

### robots.txt (rozszerzony dla AI crawlerów)

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

### Własny Silnik GEO: Reverse RAG Loop (In-Repo)

Zamiast polegać na zewnętrznych narzędziach (jak GeoStorm), naturalnym krokiem dla twórcy z Twoim profilem jest **zbudowanie własnego silnika Reverse RAG Loop** zintegrowanego bezpośrednio w repozytorium (tak jak opisywałeś to w `geo-llm-seo-analiza-frinter.md`). Daje to pełną kontrolę i pozwala na automatyczne generowanie szkiców artykułów jako odpowiedź na spadki w rankingach LLM.

**Jak to zbudować i wdrożyć wewnątrz Twojego projektu Astro:**

1. **Skrypt Monitorujący (`scripts/geo-monitor/`):**
   - Tworzysz prosty skrypt w TypeScript (odpalany przez `tsx` lub `bun`) obok kodu Twojej strony Astro.
   - Skrypt odpytuje przez API (np. OpenRouter, OpenAI) modele AI, używając przygotowanego "query banku" (np. "Best productivity system for Polish founders").
   - Wykonuje *Gap Analysis* – jeśli odpowiedzi modeli nie zawierają "Przemysław Filipiak" ani "frinter.app", traktuje to jako lukę.
2. **Auto-generowanie Draftów do Bazy Danych:**
   - Skrypt nie wykonuje komitów MDX ani nie generuje Pull Requestów, by uniknąć ciągłych, długich, bezsensownych rebuildów i utrzymać serwis nieprzerwanie działający.
   - Jeśli skrypt wykryje lukę zapytuje model LLM, generuje szkic artykułu (*High-density knowledge*) i dodaje go od razu poprzez Drizzle ORM do własnej bazy (np. PostgreSQL czy szybkiego Turso/SQLite) ze statusem `draft: true`.
3. **Architektura SSR (Zero-Rebuild deployment):**
   - Twój blog zbudowany jest z Astro w trybie SSR (Server-Side Rendering) albo node/Express – jest on cały czas uruchomiony jako usługa serwerowa, opierająca się o zapytania do DB.
   - Skrypt odpalany z crona co tydzień uzupełnia tabelę (np. tabelę `articles`), a nowa zawartość dla `/blog/[slug]` jest renderowana w locie, kiedy ktoś (lub maszyna) odwiedzi stronę.
4. **Human Review i Zamknięcie Pętli:**
   - Skrypt wysyła Ci tylko krótkie powiadomienie (np. na Slack, Discord lub email): *"Wygenerowano szkic: Deep Work vs Notion"*.
   - Logujesz się do własnego prostego panelu z uwierzytelnianiem, akceptujesz zmiany, a po odklikaniu (zmiana z 'draft' na 'published') serwis w trybie natychmiastowym emituje wpis i dynamiczny `sitemap.xml` dla crawlerów (jak GPTBot czy Claude-Web). Żadnych PR-ów czy buildów na serwerach Vercel / Cloudflare!

---

## 11. ANIMACJE I MIKRO-INTERAKCJE

### Filozofia animacji (z FrinterFlow stylistic doc)

> "Ruch w systemie jest powolny i celowo zaprojektowany, by nie rozpraszać w trakcie Pracy Głębokiej."

Tę samą zasadę stosujemy na stronie:
- **Animacje wejścia:** fade-in + subtle slide, duration 0.3-0.5s, ease-out
- **Hover:** tylko zmiana koloru/opacity, duration 0.15s
- **Scroll-triggered:** Intersection Observer, jednorazowe
- **Brak:** parallax, 3D transforms, particle systems, loop animations (z wyjątkiem blinkającego kursora i pixel art bobbing)

### CSS animacje (pure CSS, zero library)

```css
/* Fade in z góry — dla hero elementów */
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Blinkający kursor terminala */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
.cursor {
  animation: blink 0.8s step-end infinite;
  color: var(--gold);
}

/* Pixel art bobbing — aplikować przez JS (sine), nie CSS (bardziej kontrolowane) */

/* Reveal on scroll */
.reveal {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}
.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Typing effect (vanilla JS, bez bibliotek)

```javascript
function typewriter(element, text, speed = 40) {
  let i = 0;
  element.textContent = '';
  const timer = setInterval(() => {
    element.textContent += text[i];
    i++;
    if (i >= text.length) clearInterval(timer);
  }, speed);
}

// Trigger po załadowaniu strony (jednorazowo)
document.addEventListener('DOMContentLoaded', () => {
  const tagline = document.querySelector('.hero-tagline');
  typewriter(tagline, 'Builder. AI Dev. Deep Work Founder.');
});
```

---

## 12. RESPONSIVE — BREAKPOINTY

```css
/* Mobile first */
/* xs: 0-480px — domyślny */

/* sm: 480px */
@media (min-width: 480px) { }

/* md: 768px — główny breakpoint tablet */
@media (min-width: 768px) { }

/* lg: 1024px — desktop */
@media (min-width: 1024px) { }

/* xl: 1280px */
@media (min-width: 1280px) { }
```

### Mobile adaptacje kluczowych elementów

| Element | Desktop | Mobile |
|---------|---------|--------|
| ASCII hero | 6-7 linii pełne | 3-4 linie skrócone lub tylko inicjały |
| Font-size hero | clamp(2.5rem, 8vw, 7rem) | clamp(1.8rem, 10vw, 2.5rem) |
| Projekty grid | 2 kolumny | 1 kolumna |
| Nav | Pozioma | Bottom bar lub hidden |
| Blog preview | 3 karty | 1 karta + "pokaż więcej" |

---

## 13. DEPLOYMENT I HOSTING

### Rekomendacja: Cloudflare Pages

- **Darmowy** tier wystarczy na start
- Globalne CDN (edge) — najszybszy TTFB
- Natywna obsługa Astro static builds
- Zero cold starts (vs Vercel free tier)
- Analytics (Core Web Vitals) bez cookie consent

```bash
# Build command
astro build

# Output directory
dist/

# Environment: Node.js 20
```

### Alternatywa: Vercel

Jeśli planujesz SSR features w przyszłości — Vercel ma lepszy Astro SSR adapter.

---

## 14. CHECKLIST PRZED LAUNCEM

### Technical
- [ ] Lighthouse 100/100/100/100 na mobile i desktop
- [ ] `llms.txt` dostępny na `/llms.txt`
- [ ] `sitemap.xml` generowany automatycznie przez Astro
- [ ] `robots.txt` z regułami AI crawlerów
- [ ] RSS feed na `/rss.xml`
- [ ] JSON-LD Person schema w `<head>`
- [ ] JSON-LD Article schema w każdym artykule
- [ ] OpenGraph meta (og:title, og:description, og:image, og:url)
- [ ] Twitter Card meta
- [ ] Self-hosted czcionki (nie Google Fonts CDN)
- [ ] Obrazki z `width` i `height` (brak CLS)
- [ ] `font-display: swap` na fontach
- [ ] Favicon w SVG + 32×32 PNG

### Content
- [ ] Bio wypełnione prawdziwymi danymi
- [ ] Min. 1 artykuł na blogu przed launcem
- [ ] Projekty z prawdziwymi linkami
- [ ] Kontakt z aktualnymi profilami

### GEO
- [ ] Entity info spójna z LinkedIn, GitHub bio
- [ ] `llms.txt` opisuje Przemysława dokładnie i unikalnie
- [ ] Min. 1 artykuł z FAQ section
- [ ] Meta description ≤ 160 znaków, zawiera "Przemysław Filipiak"

---

## 15. DECYZJE DO PODJĘCIA PRZED BUDOWANIEM

| # | Decyzja | Opcje | Rekomendacja |
|---|---------|-------|--------------|
| 1 | Domena | przemyslawfilipiak.com | EN primary, zatwierdzona |
| 2 | Język | PL / EN / bilingual | EN primary, PL opcjonalnie — GEO szerszy zasięg |
| 3 | ASCII forma | Pełne imię / Inicjały / Pseudonim | Inicjały "P.F." w ASCII + pełne imię normal |
| 4 | Blog język | PL / EN | EN primary — więcej zasięgu AI |
| 5 | Zdjęcie w hero | Tak / Nie / Pixel art avatar | Pixel art avatar — spójne ze stylistyką |
| 6 | Komentarze pod artykułami | Giscus / Disqus / Brak | Brak na start — zero JS overhead |
| 7 | Analytics | GA4 / Plausible / Cloudflare / Brak | Cloudflare Analytics — privacy-first, zero cookie |

---

> **Podsumowanie:** Strona Przemysława Filipiaka to dark mode one-pager z ASCII retro hero (styl FrinterFlow README), pixel art ikonkami w stylu Frint_bot, trzema kolorami Frintera jako akcentami semantycznymi, bloga w Astro z GEO-zoptymalizowaną strukturą artykułów i Lighthouse 100 jako standardem. Minimalistyczna jak raba.pl, terminalna jak shotgun.sh, spójna wizualnie z ekosystemem Frinter. Zero kompromisów w performance.

---

## 16. REFERENCJE ZEWNĘTRZNE: raba.pl i shotgun.sh

### 16.1 SEKCJE ze strony Patryka Raby (raba.pl)

Oto układ sekcji i referencyjne copy wyciągnięte ze strony Patryka Raby, na których można się wzorować:

*   **Whoami:**
    *   PATRYK RABA
    *   Engineer · Builder · Leader
    *   15 years building & assuring quality of software. Based in Gdansk, Poland.
    *   Bio m.in. wspominające obszary od crowdtestingu po agentic AI.
*   **Experience:**
    *   Firmy (Full-time): MOSTLY AI (Head of QA), Bragi (Head of QA/Release), Welltok (Lead Quality Engineer), Roche, Nozbe, Playsoft.
    *   Consulting & Part-time: Applause (QA Project Manager - 300 produktów, 5k cykli testowych), Confidential (Vision Pro MVP), Sztuka Harmonii, Wielki Dzien, Software Dev Academy, Minecraft.pl.
*   **Tech Stack:**
    *   Języki, Frontend, Backend & Data, Testing & QA, Device Labs, Cloud & Infra, Databases, Monitoring & CI, Tools & APIs.
*   **Industries:**
    *   Obszary wyróżnione dużymi ikonami i opisami (🤖 AI & Synthetic Data, 🎧 Consumer Electronics / Audio, 🏥 Health & Big Data, 💊 Pharma, 🧪 Crowdtesting at Scale, 🎮 Gaming, 👓 XR / Spatial Computing, 📚 EdTech & Training, 🧠 Psychotherapy & HealthTech).
*   **Personal Projects:**
    *   Wyróżnione ikony cyklu życia projektu: 🚀 launched, 📋 development, 📡 mvp, 🎬 ideation, 🛒 validation (np. projekt minecraft.pl, Vibethon, EEG Visualizer).
*   **Resources:**
    *   Open Source (Claude Code Statusline, Claude Limits Monitor) oraz Case Studies poszczególnych technologii (Mesh App, Lifecycle Tracker).
*   **Blog:**
    *   Prezentacja artykułów (np. "Command Center: 33 Side Projects with ADHD" lub "Claude Remote Control") z linkiem "Read article →".

### 16.2 Opis stylistyki SHOTGUN-a (app.shotgun.sh)

Rozbijając estetykę z SHOTGUN-a (widoczną na zrzucie ekranu "Spec Driven Development"):

1.  **Block-ASCII Logo:** Główny i potężny element Hero to ogromne pomarańczowe logo ułożone z grubych, geometrycznych bloków ascii/pixel-art'owych na ciemnoszarym tle (pure monospace tech-vibe). 
2.  **Terminal Block UI:** Niemal całe call to action polega na dużym bloku, wyglądającym w 100% jak okno CLI/terminala z tabsami w środku (macOS / Linux / Windows) oraz przyciskiem kopiowania do schowka z komendami powłowki (`pwsh`).
3.  **Monochromatyzm + Jeden Kolor Akcentowy:** Projekt całkowicie szaro-czarny (`dark mode`) z idealnym kontrastem oraz użyciem "pomarańczowego deweloperskiego" (jak retro monitory) wyłącznie dla nagłówków, logo i star badge'a. Totalny brak ozdobnych grafik - interfejs budowany fontem, ramkami i składnią kodu.
4.  **Typografia "IDE Base":** Zarówno w komendach terminala jak i linkach/badge'ach (`Star us on GitHub!`) użyto głównie czcionek monospace (często JetBrains Mono, Fira Code lub Courier), co powoduje, że cała strona jawi się jak podstrona dokumentacji/IDE.

---

## 17. ODPOWIADAM NA PYTANIA (FINALNE DECYZJE Z PKT 15)

- **domena:** przemyslawfilipiak.com - EN PRIMARY
- **blog:** EN primary
- **zdjęcie w hero:** ma być, ułożone ponad imieniem i nazwiskiem
- **komentarzy brak:** to blog pod AI
- **cloudflare analytics = brak :)**

---

## 18. PERSONAL STORY (DO UŻYCIA W SEKCJI "O MNIE" / "BLOG")

### Genesis: Od norweskiego survivalu do frinter.app

Nie masz drugiego życia. Nie ma checkpointów. Nie ma resetu. Odzyskaj uwagę TERAZ, bo zawsze masz tylko **TERAZ**.

Przez 6 lat żyłem w Norwegii jako outsider. Zaczęło się od samodzielnej nauki języka w Polsce, a skończyło na dwóch norweskich licencjatach (Nauki o sporcie / Rachunkowość i finanse) zdanych na równi z nativami. To tam, żyjąc poza układem – m.in. spędzając pół roku w zbudowanym od zera kamperze – zrozumiałem fundamentalną prawdę: **świat składa się z systemów**. Jeśli nie zarządzasz swoim systemem (zaczynając od własnej uwagi), ktoś inny zrobi to za Ciebie.

**Kluczowe etapy, które ukształtowały mój system:**

- **Friluftsliv (Trening odporności):** Ekstremalny survival, spanie w igloo w -30°C i ratownictwo w lodowatym morzu nauczyły mnie, że dyscyplina zaczyna się tam, gdzie kończy się komfort. Zrozumiałem granice swojego ciała i umysłu, a 10 lat praktyki medytacji pozwoliło mi odkryć, że skupienie to nie przełącznik ON/OFF, ale całe spektrum wchodzenia w stan deep flow.
- **Korporacyjny matrix i zderzenie ze ścianą (2021-2022):** Praca w finansach pod ekstremalną presją, ciągłe żonglowanie priorytetami i brak regeneracji doprowadziły mnie do całkowitego wypalenia. Osiągnąłem dno chaosu i rozproszenia. Zrozumiałem wtedy, że walka o uwagę to nie kwestia silnej woli – to kwestia odpowiednio zaprojektowanego systemu.
- **Narodziny Δ240OS (dzisiejszy frinter.app):** Żeby przetrwać i zacząć działać mądrzej, musiałem stworzyć własny system operacyjny dla umysłu (wtedy nazwany *Δ240OS*). Wycina on szum informacyjny, optymalizuje energię mentalną i wymusza hiper-skupienie za pomocą ścisłych sprintów działania. Testowałem go na własnym organizmie poprzez ultra-sprinty, łącząc programowanie, deep work, sport i wiedzę o zarządzaniu zasobami.

Dziś moje życie składa się ze sprintów głębokiej pracy. Nie dryfuję między zadaniami. Tworzę, resetuję, iteruję. 

Frinter to nie "kolejna apka do produktywności". To zrzut pamięci moich doświadczeń, narzędzie zamieniające uwagę w największą przewagę buildera. Bo **[SKUPIENIE] = [WOLNOŚĆ]**.

---

## 19. CZYM JEST FRINTER.APP? (WYJAŚNIENIE PRODUKTU DO UŻYCIA W COPY)

Frinter to platforma realizująca paradigm **Wholebeing for High-Performers**. Gwarantuje głęboki sen i nieprzerwane skupienie, pomagając optymalizować 3 sfery życia na podstawie twardych danych.

**Główny problem:** Twój kalendarz jest idealny, a Ty i tak jesteś wyczerpany. Płytka praca, powiadomienia i przestymulowanie drenują system nerwowy, blokując wejście w deep focus i psując sen. Tradycyjne zarządzanie czasem to przestarzały model prowadzący do burnoutu.

**System Frintera opiera się na 3 fundamentach (Achieve Wholebeing):**

1. **Flourishing (Ty)**
   * **Mechanizm:** Timer dla sportu, czytania, medytacji.
   * **Cel:** Recharging. Ponieważ wyczerpany High-Performer podejmuje głupie decyzje.
2. **Relationships (Bliscy)**
   * **Mechanizm:** Mierzenie czasu spędzonego z najbliższymi.
   * **Cel:** Żebyś czarno na białym widział, czy nie zaniedbujesz tych, dla których to wszystko w ogóle budujesz.
3. **Deep Work (Świat)**
   * **Mechanizm:** Odpalasz "Frinta". Telefon idzie na bok.
   * **Cel:** Mierzenie wyłącznie czasu czystej kreacji (kodowanie, pisanie, strategia). Zero "adminu".

**Unikalny mechanizm — The Energy Bar:**
Algorytm Frintera przelicza jakość i długość Twojego snu prosto na poziom naładowania "baterii" w procentach (od *[ZOMBIE]* do *[BESTIA]*). Nie uruchomiłbyś auta bez paliwa — dlaczego oczekujesz jazdy na oparach od własnego umysłu?

> *"I expand in abundance, success, and love every day, as I inspire those around me, to do the same."* — Gay Hendricks

**A tool built by a High Performer for High Performers.**
*„Zbudowałem Frintera, bo inne aplikacje chciały, żebym robił WIĘCEJ zadań. Ja chciałem robić te kluczowe LEPIEJ. Potrzebowałem bata na własne rozproszenie i lustra, które pokaże mi prawdę o moich relacjach, zdrowiu i jakości snu. Dziś oddaję to narzędzie w Twoje ręce.”* — P.F.

