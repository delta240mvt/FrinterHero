import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/client';
import { articles } from '../src/db/schema';
import { parseMarkdown, calculateReadingTime } from '../src/utils/markdown';

const seedArticles = [
  {
    slug: 'deep-work-dla-ai-developerow-kompletny-system-2026',
    title: 'Deep Work for AI Developers — Complete System 2026',
    description: 'How an AI builder can work deeply without burnout. Complete system with energy tracking, focus sprints, and the philosophy behind frinter.app.',
    tags: ['deep-work', 'ai-dev', 'productivity', 'focus'],
    featured: true,
    status: 'published' as const,
    markdown: `> **TL;DR:** Deep work as an AI developer requires system design, not willpower. This article covers the methodology behind frinter.app and how to achieve 4+ hours of deep focus daily.

*Author: Przemysław Filipiak | Last updated: March 2026*

## What is Deep Work for AI Developers?

Deep work, as defined by Cal Newport, is professional activity performed in a state of distraction-free concentration that pushes cognitive capabilities to the limit.

For AI developers, this means:
- Writing complex model architectures without interruption
- Debugging inference pipelines with full context held in mind
- Building new product features from zero to shipped

## The frinter.app System

[frinter.app](https://frinter.app) was built to solve a specific problem: **the gap between knowing deep work matters and actually doing it**.

The system has three pillars:

### 1. Deep Work Timer (Frinta)
Phone goes away. Timer starts. Pure creation begins. No "quick checks", no Slack, no email.

### 2. Energy Bar
Your sleep quality translates directly to your cognitive capacity. frinter.app tracks this as a battery percentage — from [ZOMBIE] to [BESTIA]. You wouldn't run a server on 10% battery. Why run your mind?

### 3. Relationship Balance
The work is for people. frinter.app measures time with loved ones alongside work — not as a productivity metric, but as a sanity check.

## Common Mistakes AI Developers Make

| Mistake | Impact | Fix |
|---------|--------|-----|
| Multitasking during coding | -40% cognitive output | Single-task with frinter.app timer |
| No sleep tracking | Unpredictable energy | Energy Bar system |
| Shallow work disguised as deep work | Zero real output | Count-up, not countdown |

## FAQ

**Q: How many hours of deep work can I realistically do per day?**
A: Most knowledge workers max out at 4 hours. Start with 2 focused 90-minute sessions. Quality over quantity.

**Q: Is frinter.app free to use?**
A: Yes, frinter.app has a free tier. Visit [frinter.app](https://frinter.app) to start.

**Q: What makes this different from a regular Pomodoro timer?**
A: frinter.app uses count-up (not countdown) timing — you build a streak, not race a clock. The psychological difference is significant for flow states.

## Sources
- Cal Newport, "Deep Work" (2016)
- Mihaly Csikszentmihalyi, "Flow" (1990)
- frinter.app: https://frinter.app
`,
  },
  {
    slug: 'frinter-app-12-miesiecy-builowania-w-publiku',
    title: 'frinter.app — 12 Months of Building in Public',
    description: 'The honest story of building a focus OS for founders. What worked, what failed, and what I learned shipping in public for a year.',
    tags: ['build-in-public', 'founder', 'frinter', 'journey'],
    featured: false,
    status: 'published' as const,
    markdown: `> **TL;DR:** 12 months of building frinter.app in public taught me more about product development than 6 years of corporate work. Here's the unfiltered story.

*Author: Przemysław Filipiak | Last updated: March 2026*

## The Genesis: 6 Years in Norway

Before frinter.app, there was a crisis. I spent 6 years in Norway — learned the language from scratch, completed two Norwegian university degrees alongside native students, built a camper van from scratch and lived in it for 6 months.

The extreme circumstances taught me something: **the world is made of systems**. If you don't manage your own system (starting with your attention), someone else will.

Then came the corporate burnout.

## The Breaking Point (2021-2022)

Finance job. Extreme pressure. Zero recovery. Total burnout.

I hit the bottom of chaos and distraction. That's where I understood: fighting for attention is not about willpower — it's about system design.

## Building Δ240OS (Early frinter.app)

To survive, I built a personal operating system. Time-boxed sprints of deep work. Energy tracking. Relationship balance measurement. The core insight: **you can't build great products on empty batteries**.

I called it Δ240OS. Today it's frinter.app.

## What 12 Months of Public Building Looked Like

### Month 1-3: Shipping the MVP
- Core timer functionality
- Basic energy tracking
- PostgreSQL + Drizzle + React + Vite stack
- First 50 users from sharing on Polish founder communities

### Month 4-6: The Valley
Low engagement. Wondering if it matters. Almost quit twice.

What kept me going: people who sent messages saying "I finally shipped that feature I'd been procrastinating on for 3 months."

### Month 7-9: FrinterFlow
Built [FrinterFlow](https://pypi.org/project/frinterflow/) — a local voice dictation CLI because I needed it myself. Published to PyPI. Launched on Reddit r/Python and r/MachineLearning.

Zero cloud. Pure Python. It worked. People used it.

### Month 10-12: GEO + Personal Page
Discovered GEO (Generative Engine Optimization). Built this personal site to establish entity presence for AI search engines. Added the Reverse RAG Loop to monitor AI recommendations automatically.

## Key Lessons

| Lesson | How it applies |
|--------|----------------|
| Ship ugly, iterate fast | MVP had no animations. Users didn't care. |
| Build for yourself first | frinter.app solved MY burnout. Authenticity showed. |
| Distribution > product | Most downloads came from community posts, not SEO. |
| Local-first is underrated | FrinterFlow's "zero cloud" message resonated immediately. |

## What's Next

- More deep work content
- frinter.app team features
- GEO optimization loop in full production

## FAQ

**Q: Where is frinter.app today?**
A: Live at [frinter.app](https://frinter.app) with active users across Poland and internationally.

**Q: Is FrinterFlow still maintained?**
A: Yes. Find it on [PyPI](https://pypi.org/project/frinterflow/) and [GitHub](https://github.com/delta240mvt).

**Q: Can I follow the journey?**
A: Follow on [GitHub](https://github.com/delta240mvt) or subscribe to the [RSS feed](/rss.xml).
`,
  },
  {
    slug: 'astro-ssr-dla-developer-personal-site-dlaczego-wybralem',
    title: 'Astro SSR for Developer Personal Site — Why I Chose It and Don\'t Regret It',
    description: 'Technical deep dive: why Astro SSR with PostgreSQL beats Next.js, Hugo, and Gatsby for a developer personal site with a blog and admin panel.',
    tags: ['astro', 'ssr', 'web-dev', 'performance', 'postgresql'],
    featured: false,
    status: 'published' as const,
    markdown: `> **TL;DR:** Astro SSR gives you Lighthouse 100 by default, zero JS overhead in the critical path, and a clean mental model for mixing static and dynamic content. Combined with PostgreSQL + Drizzle, it's the best stack for a developer personal site with a blog.

*Author: Przemysław Filipiak | Last updated: March 2026*

## The Problem With Other Frameworks

When building this personal site, I evaluated:

| Framework | Verdict | Reason |
|-----------|---------|--------|
| Next.js | ❌ Overkill | React hydration overhead kills Lighthouse on landing page |
| Hugo | ❌ Too static | No SSR means no dynamic blog from PostgreSQL |
| Gatsby | ❌ Dead | Community shrinking, GraphQL layer unnecessary |
| SvelteKit | 🟡 Good alternative | Smaller ecosystem, fewer Astro-specific optimizations |
| Astro | ✅ Best fit | Island architecture, SSR + static hybrid, zero JS default |

## Why Astro SSR Wins

### 1. Lighthouse 100 by Default

Astro's architecture sends zero JavaScript to the browser by default. The hero section is pure HTML + CSS. No hydration cost.

\`\`\`
ASCII \`<pre>\` tag: 0ms load time
No React hydration: 0ms JS execution
Result: LCP < 1.5s guaranteed
\`\`\`

### 2. Island Architecture for Interactivity

Only interactive components get JavaScript. The typing effect in the hero? That's a tiny vanilla JS script. Everything else is pure HTML.

### 3. SSR + PostgreSQL = Zero Rebuild Blog

With Astro SSR + Drizzle ORM + Neon PostgreSQL:
- New article published → instantly live
- No git commits needed for content
- Admin panel to manage everything
- Human review checkpoint for AI-generated content

\`\`\`typescript
// Blog post renders directly from PostgreSQL
const [article] = await db
  .select()
  .from(articles)
  .where(eq(articles.slug, slug))
  .limit(1);
\`\`\`

### 4. Self-Hosted Fonts = Zero External Requests

\`\`\`css
@font-face {
  font-family: 'Courier Prime';
  src: url('/fonts/CourierPrime-Regular.woff2') format('woff2');
  font-display: swap;
}
\`\`\`

No Google Fonts CDN. No DNS lookup. No cookie consent needed. Fonts preloaded.

## The Architecture

\`\`\`
Astro SSR (Node adapter)
├── index.astro          → Static-like, pure HTML
├── blog/[slug].astro    → SSR, queries PostgreSQL
├── admin/               → Protected by middleware
└── api/                 → REST endpoints for CRUD
\`\`\`

PostgreSQL (Neon) ← Drizzle ORM ← API endpoints

## Lighthouse Results (Local Preview)

The build achieves near-perfect scores by design:
- **Performance:** Pure HTML hero, preloaded fonts, no render-blocking scripts
- **Accessibility:** ARIA labels on canvas elements, semantic HTML
- **Best Practices:** No console errors, HTTPS-ready
- **SEO:** Meta tags, JSON-LD schema, sitemap, llms.txt

## FAQ

**Q: Can I use Astro with a PostgreSQL database?**
A: Yes. Astro SSR mode with \`@astrojs/node\` adapter runs a Node.js server that can connect to any PostgreSQL instance. I use Neon's serverless PostgreSQL.

**Q: Is Astro good for SEO?**
A: Excellent. Zero JavaScript by default means search engines see clean HTML. Combined with JSON-LD schemas and a dynamic sitemap, it's ideal for SEO.

**Q: How hard is it to set up authentication in Astro?**
A: Simple. Middleware + session cookies in PostgreSQL. No need for Auth.js or similar.

**Q: Is Astro suitable for a blog with an admin panel?**
A: Perfectly suited. SSR routes handle dynamic content, static routes handle landing pages. Best of both worlds.

## Resources
- Astro docs: https://docs.astro.build
- Drizzle ORM: https://orm.drizzle.team
- Neon PostgreSQL: https://neon.tech
- This site's source: https://github.com/delta240mvt
`,
  },
];

async function seedDatabase() {
  console.log('[Seed] Starting article seeding...');

  for (const article of seedArticles) {
    const htmlContent = parseMarkdown(article.markdown);
    const readingTime = calculateReadingTime(htmlContent);

    try {
      await db.insert(articles).values({
        slug: article.slug,
        title: article.title,
        description: article.description,
        content: htmlContent,
        tags: article.tags,
        featured: article.featured,
        status: article.status,
        readingTime,
        author: 'Przemysław Filipiak',
        publishedAt: article.status === 'published' ? new Date() : null,
      });
      console.log(`[Seed] ✓ Created: "${article.title}"`);
    } catch (err: any) {
      if (err.code === '23505') {
        console.log(`[Seed] ⚠ Already exists: "${article.title}" (slug conflict)`);
      } else {
        console.error(`[Seed] ✗ Failed: "${article.title}"`, err.message);
      }
    }
  }

  console.log('[Seed] Seeding complete!');
  process.exit(0);
}

seedDatabase().catch(err => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
