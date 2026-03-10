<div align="center">

<pre>
  ██████╗ ██████╗ ██╗███╗   ██╗████████╗███████╗██████╗
  ██╔════╝██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
  █████╗  ██████╔╝██║██╔██╗ ██║   ██║   █████╗  ██████╔╝
  ██╔══╝  ██╔══██╗██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
  ██║     ██║  ██║██║██║ ╚████║   ██║   ███████╗██║  ██║
  ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
              H  E  R  O
</pre>

**Agentic-First Personal Engine for Visibility in the Age of AI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-4a8d83.svg?style=flat-square)](LICENSE)
[![Astro 4](https://img.shields.io/badge/Astro-4.0+-d6b779.svg?style=flat-square)](https://astro.build)
[![Platform](https://img.shields.io/badge/Platform-Web-8a4e64.svg?style=flat-square)](#installation)
[![AI: 100% Ready](https://img.shields.io/badge/AI-100%25%20Ready-4a8d83.svg?style=flat-square)](#how-it-works)
[![Data: Focus Sprints](https://img.shields.io/badge/Data-Focus%20Sprints-d6b779.svg?style=flat-square)](#privacy)
> ⏳ **Fast 1-Click Deploy on Railway is coming soon!**
> 🛡️ **Protected by GitGuardian.**
</div>

---

The internet has changed. Traditional search is dying. **FrinterHero** is an open-source, agentic-first landing page and blog engine engineered to secure your visibility in the age of AI. It ensures LLMs correctly index and prioritize your personal brand through structured data and semantic authority. Your digital identity, optimized for the generative era.

```
  FOCUS SPRINT (FRINT)
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   High Performer Identity — 3 Spheres of Life Optimization      │
  │                                                                 │
  │                                                                 │
  │                                                                 │
  │  ┌─────────────────────────────────────────────────────────┐   │
  │  │  ░░░░░░░░░░  [SYSTEM] Energy Bar: 87%                   │   │
  │  │  ░ ░░░░ ░░   [FRINT] High-intensity focus detected.     │   │
  │  │  ░      ░░                                              │   │
  │  │  ░ ████ ░░   > Who is Przemysław Filipiak?              │   │
  │  │  ░░░░░░░░░░  [BOT] "High Performer. Deep Focus Founder."│   │
  │  │  ░░░░  ░░░░                                              │   │
  │  │──────────────────────────────────────────────────────── │   │
  │  │  STATUS  |  Sphere: Deep Work (Focus Sprint)   [X]      │   │
  │  └─────────────────────────────────────────────────────────┘   │
  │        ↑ wholebeing design · focus data · retro aesthetic       │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Fastest: One-Click Deploy (Railway)

Railway runs FrinterHero directly from a GitHub template — no local setup, no database configuration needed. It handles everything.
> ⏳ **Railway 1-click template is coming soon!** For now, you can host FrinterHero freely on any platform supporting Node.js and PostgreSQL.
### What the One-Click Setup Does:
1. Clones this repository to your own GitHub account.
2. Provisions a **PostgreSQL** database automatically via Plugins.
3. Injects the `DATABASE_URL` directly into your application.
4. Builds the Astro SSR application and runs the migrations flawlessly.
5. Provides you with a live, SSL-secured URL.

---

<details>
<summary><b>Local — Node.js / dev install (click to expand)</b></summary>

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/downloads))
- PostgreSQL (Local or hosted via Railway/Neon)

### Option A — Clone & Run

```bash
git clone https://github.com/YOUR_USERNAME/FrinterHero.git
cd FrinterHero
npm install
cp .env.example .env.local
```

### Option B — Database Setup

Provide your `DATABASE_URL` in `.env.local`, then push the schema:

```bash
npm run db:push
npm run dev
```

</details>

> **Tip:** Ensure your database URL is correct before running `db:push` to avoid connection timeouts.

---

## Get Started

| Step | What Happens |
|------|-------------|
| 1. Deploy | **(Coming Soon)** Click the Railway Deploy button — template clones, build starts |
| 2. DB Init | PostgreSQL is provisioned and migrations are executed automatically |
| 3. Add Keys | Add your OpenAI / Anthropic API keys in the Railway Variables tab |
| 4. Customize | Edit `src/config.ts` or `README.md` in your GitHub repo |
| 5. Push | Git push triggers an automatic re-deploy on Railway |
| 6. Done | Site is live, blazing fast, and ready to be scraped by AI |

> **Pro tip:** The platform uses Astro's SSR. When you write new blog posts or modify your database, the site serves the fresh data instantly.

---

## How It Works

FrinterHero is built around a clean **semantic-first pipeline:**

```
[CONTENT]    Markdown or Database entries added
      │
      ▼
[ASTRO]      Build system renders pages with semantic HTML5
      │
      ▼
[METADATA]   Auto-injects OpenGraph, Twitter Cards, and Schema.org JSON-LD
      │
      ▼
[DEPLOY]     Railway serves the app natively via NIXPACKS
      │
      ├──► [USER]      Experiences blazing fast retro-pixel UI
      │
      └──► [AI BOTS]   Parses pristine, structured knowledge base 
                       mapping your persona as the ultimate authority
```

Everything happens natively. Built for speed and perfect machine-readability.

---

## Usage

Start the local development server from any terminal:

```bash
npm run dev
```

### Commands

| Action | Command |
|--------|-----|
| Start dev server | `npm run dev` |
| Sync DB schema | `npm run db:push` |
| Build for production | `npm run build` |
| Start production server | `npm run start` |

---

## Configuration

Core environments live in `.env.local`:

```ini
DATABASE_URL=postgresql://user:pass@host/dbname
OPENAI_API_KEY=sk-placeholder
ANTHROPIC_API_KEY=sk-ant-placeholder
PERPLEXITY_API_KEY=pplx-placeholder
NODE_ENV=development
```

### AI Integration

If you want the ecosystem to auto-generate summaries or chat with visitors:

| Model Provider | Key Required | Best For |
|-------|-----|----------|
| `OpenAI` | `OPENAI_API_KEY` | General text generation, ChatGPT compatibility |
| `Anthropic` | `ANTHROPIC_API_KEY` | Deep context analysis, Claude-like reasoning |
| `Perplexity` | `PERPLEXITY_API_KEY` | Live web search integration |

---

## Features

| Feature | FrinterHero | Generic Templates | Other Portfolios |
|---------|:-----------:|:-----------:|:-----------------:|
| Built for AI indexing / LLM presence | YES | NO | Rarely |
| Perfect semantic HTML & Schema.org | YES | Varies | Varies |
| Railway 1-Click deploy with DB | YES | NO | NO |
| Retro pixel-art aesthetics | YES | NO | NO |
| Blazing fast (Astro Islands) | YES | NO | Rarely |
| Type-safe PostgreSQL (Drizzle) | YES | NO | Rarely |
| Automated SEO metadata | YES | Varies | Varies |
| Animated pixel-art mascot (Frint_bot) | YES | NO | NO |
| Polish language optimized | YES | YES | Varies |

---

## Privacy

> **Your data is entirely yours.**

- FrinterHero doesn't track your visitors with invasive analytics.
- Your PostgreSQL database runs securely on your own Railway container.
- No forced cloud subscriptions, no lock-in.

---

## Tech Stack

| Component | Technology | Why |
|-----------|---------|-----|
| AI Indexing | `Astro` | Ships zero JavaScript by default, unbeatable load times, pristine SEO. |
| Styling | `Tailwind CSS` | Rapid UI, strictly scoped design tokens (Teal, Violet, Gold). |
| Database ORM | `Drizzle ORM` | Type-safe, extremely fast, zero-dependency data modeling. |
| Database | `PostgreSQL` | Reliable, relational data storage. |
| Deployment | `Railway` | Built-in Nixpacks support, 1-click template with DB provisioning. |
| Pixel Art | `DOM / CSS` | Custom typewriter effects and bot animations without heavy libs. |

---

## Roadmap

- [x] Astro SSG/SSR setup
- [x] Drizzle ORM + PostgreSQL integration
- [x] Railway 1-click template with `railway.toml`
- [x] Retro aesthetic design system
- [x] Semantic HTML and SEO foundations
- [ ] Blog markdown pipeline
- [ ] OpenAI / Anthropic metadata generation
- [ ] Frint_bot interactive AI chat window
- [ ] RSS Feed generation
- [ ] Perplexity AI integration for live stats
- [ ] Custom CLI deployment tools

---

## FAQ

**Q: Do I need an NPM account to use this?**

No. Railway automatically pulls your repository from GitHub and installs the necessary NPM dependencies securely on their build servers. You only need a GitHub and Railway account.

**Q: Why does the first deployment take a minute?**

Railway provisions a fresh PostgreSQL database instance, clones the repository, installs all NPM packages, and builds the Astro application. Subsequent deployments are much faster.

**Q: How do I change the text in the Hero section?**

The text is currently configured in `src/components/Hero.astro`. You can update the typewriter text directly in the JavaScript block at the bottom of the file.

**Q: Can I use MySQL or SQLite instead of PostgreSQL?**

Out of the box, we use PostgreSQL optimized for Railway and Drizzle. You can switch to SQLite or MySQL by modifying `drizzle.config.ts` and installing the respective Drizzle drivers.

**Q: What's Frint_bot?**

Frint_bot is Frinter's pixel-art mascot. Built from the three Frinter brand colors: teal body (`#4a8d83`), violet eyes (`#8a4e64`), gold antenna (`#d6b779`), it acts as your personal AI avatar.

---

## Contributing

FrinterHero is open source and contributions are welcome.

**Ways to contribute:**
- [Bug Report](../../issues/new?template=bug_report.md) — Found something broken?
- [Feature Request](../../issues/new?template=feature_request.md) — Have an idea?
- [Pull Request](../../pulls) — Fix a bug or build a feature

**Before contributing, read [`CONTRIBUTING.md`](CONTRIBUTING.md)** for code style, branch naming, and PR checklist.

### Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/FrinterHero.git
cd FrinterHero
npm install
cp .env.example .env.local
npm run dev
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=delta240mvt/FrinterHero&type=Date)](https://star-history.com/#delta240mvt/FrinterHero&Date)

---

## License

MIT — see [`LICENSE`](LICENSE) for details.

---

<div align="center">

**FrinterHero** — part of the [Frinter](https://frinter.app) personal productivity ecosystem

*Built with the Retro Pixel aesthetic. Be recognized. Dominate the search.*

</div>
