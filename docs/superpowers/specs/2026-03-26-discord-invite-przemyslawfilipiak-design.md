# Discord Invite on przemyslawfilipiak.com — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Goal:** Add Discord community invite (Frinter Core) to three places on the przemyslawfilipiak.com homepage.

**Discord invite link:** `https://discord.gg/sUq42Mcah6`

## Change 1: Hero — Discord CTA button

**File:** `apps/client-przemyslawfilipiak/src/components/Hero.astro`

Add a third CTA button alongside "Read the Blog" and "GitHub":

- **Text:** `Discord ↗`
- **Style:** `btn-ghost` (same as GitHub button)
- **Color:** Violet accent (`--violet`, `#8a4e64`) — border and text color — to visually distinguish community from portfolio links
- **Link:** `https://discord.gg/sUq42Mcah6` (target `_blank`, `rel="noopener"`)
- **Position:** Third button in the row. Three buttons side by side on desktop, stacked on mobile.

## Change 2: New "Community" section between Projects and Blog

**File:** Create `apps/client-przemyslawfilipiak/src/components/Community.astro`
**File:** Modify `apps/client-przemyslawfilipiak/src/pages/index.astro` — add `<Community />` between `<Projects />` and `<BlogPreview />`

### Structure

```
<section id="community">
  <span class="section-label">// community</span>
  <h2>Build with AI. Together.</h2>
  <p>Join Frinter Core — a community for builders creating real products
     with AI. Share what you're building, get help, and connect with
     others who moved past tutorials.</p>
  <a href="https://discord.gg/sUq42Mcah6" class="btn-primary">
    Join Frinter Core on Discord ↗
  </a>
</section>
```

### Styling

- **Section label:** `// community` — mono font (`--font-mono`), teal color (`--teal`), matching `// about`, `// projects` etc.
- **Heading:** Poppins (`--font-heading`), white (`--text-primary`), same size as other section headings
- **Description:** Roboto (`--font-body`), secondary text color (`--text-secondary`)
- **CTA button:** `btn-primary` style but with violet border and violet glow (`--violet`, `--violet-glow`) instead of teal — to distinguish community CTA from portfolio CTAs
- **Background:** `--bg-elevated` (`#0f172a`) — darker, like Hero and Contact, visually separating from Projects (surface) and Blog (base)
- **Layout:** Centered text, max-width constraint matching other sections, padding matching site rhythm
- **No additional graphics** — minimalist, consistent with rest of site

## Change 3: Contact — Discord button

**File:** `apps/client-przemyslawfilipiak/src/components/Contact.astro`

Add a fourth ghost button as the first item in the row:

- **Text:** `Discord ↗`
- **Style:** `btn-ghost` (identical to LinkedIn/GitHub/Email buttons)
- **Link:** `https://discord.gg/sUq42Mcah6` (target `_blank`, `rel="noopener"`)
- **Position:** First in the row: Discord → LinkedIn → GitHub → Email

## Constants

The Discord invite URL (`https://discord.gg/sUq42Mcah6`) appears in three places. To avoid duplication, define it once and import where needed — or simply hardcode since it's a stable invite link (permanent Discord invites don't change).
