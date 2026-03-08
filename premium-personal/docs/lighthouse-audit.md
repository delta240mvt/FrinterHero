# Lighthouse Audit Documentation

## Optimization Strategies Applied

### Performance (Target: 100)
- ASCII hero is pure `<pre>` text — zero image requests, instant LCP
- No render-blocking scripts in `<head>`
- All scripts are deferred or loaded via `DOMContentLoaded`
- Critical fonts preloaded with `<link rel="preload">`
- Self-hosted WOFF2 fonts with `font-display: swap`
- No external CDN requests
- CSS variables minimize runtime calculations
- Minimal JavaScript (vanilla only)

### Accessibility (Target: 100)
- Semantic HTML: `<nav>`, `<main>`, `<article>`, `<section>`, `<header>`, `<footer>`
- ARIA labels on canvas elements: `role="img" aria-label="..."`
- Color contrast: dark bg #1e293b + white text = 15.1:1 ratio (AAA)
- Navigation has `aria-label="Main navigation"`
- Form inputs have associated `<label>` elements
- Skip-to-content not needed (single-page structure)

### Best Practices (Target: 100)
- HTTPS enabled via Cloudflare Pages (auto-issued cert)
- No deprecated APIs
- No console errors in production
- Images have explicit width/height (prevents CLS)
- Meta charset UTF-8 present

### SEO (Target: 100)
- Meta title and description on all pages
- Canonical URLs set
- robots.txt allows all crawlers
- sitemap.xml dynamically generated
- JSON-LD Person schema in Base layout
- JSON-LD BlogPosting schema on article pages
- OpenGraph + Twitter Card meta tags
- Mobile viewport meta tag

## Running Lighthouse Audit

1. Build the project: `npm run build`
2. Start preview server: `npm run preview`
3. Open Chrome DevTools → Lighthouse tab
4. Run for both Mobile and Desktop
5. Document scores below

## Audit Results (fill in after running)

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
| `/` (landing) | TBD | TBD | TBD | TBD |
| `/blog` (listing) | TBD | TBD | TBD | TBD |
| `/blog/[slug]` | TBD | TBD | TBD | TBD |
| `/admin/login` | TBD | TBD | TBD | TBD |
