# Launch Checklist — przemyslawfilipiak.com

## Pre-Launch Technical

### Infrastructure
- [ ] Railway project created and connected to GitHub repository
- [ ] Railway PostgreSQL service added to the project
- [ ] DATABASE_URL is available in Railway environment variables (auto-injected by PostgreSQL service)
- [ ] ADMIN_PASSWORD_HASH secret set in Railway Variables (generate with: `node -e "const bcrypt = require('bcrypt'); bcrypt.hash('yourpassword', 10).then(console.log)"`)
- [ ] OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY set in Railway Variables
- [ ] DISCORD_WEBHOOK_URL set in Railway Variables

### Database
- [ ] Railway PostgreSQL database connected and running
- [ ] DATABASE_URL configured
- [ ] Run migrations: `npx drizzle-kit push` (or `migrate`)
- [ ] Run seed: `npm run db:seed`

### Build & Deploy
- [ ] `npm run build` passes locally
- [ ] First deploy to Railway succeeds (Railway auto-detects Astro/Node build)
- [ ] All pages load without errors

### Fonts
- [x] Download real WOFF2 font files and replace placeholders in `public/fonts/`
- [x] Subsetting for max performance (Courier Prime, Poppins, Roboto)

### Verification
- [ ] Custom domain (`przemyslawfilipiak.com`) added in Railway Settings
- [ ] DNS records updated to point to Railway
- [ ] SSL certificate active (Railway auto-issues TLS)
- [ ] `/admin/login` accessible and working
- [ ] `/blog` shows seeded articles
- [ ] `/rss.xml` returns valid RSS
- [ ] `/sitemap.xml` returns valid XML
- [ ] `/robots.txt` accessible
- [ ] `/llms.txt` accessible
- [ ] Favicon shows in browser tab

### GEO Monitor
- [ ] GitHub Actions workflow enabled
- [ ] Manual test run: `npm run geo:monitor`
- [ ] Discord webhook receives notification
- [ ] Draft articles appear in `/admin`

## Post-Launch Content

- [ ] Publish seeded articles (change status to 'published' in admin)
- [ ] Post launch announcement on LinkedIn
  - Hashtags: #AstroJS #AI #DeepWork #BuildInPublic #GEO
- [ ] Share on Reddit r/webdev, r/productivity
- [ ] Update GitHub profile README with link

## Lighthouse Scores (Target: 100/100/100/100)

Run: `npm run build && npm run preview` then Chrome DevTools → Lighthouse

| Page | Perf | A11y | BP | SEO |
|------|------|------|----|-----|
| Landing | — | — | — | — |
| Blog | — | — | — | — |
| Article | — | — | — | — |

## Environment Variables Template

```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
ADMIN_PASSWORD_HASH=$2b$10$...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
NODE_ENV=production
```
