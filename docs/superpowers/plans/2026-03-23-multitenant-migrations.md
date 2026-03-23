# Multitenant Site Scope — Apply Pending Migrations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply pending migrations 0007–0009 to add `site_id` to Reddit, YouTube, Brand Clarity, and Social Hub tables in production.

**Architecture:** Schema and API code are already complete. Migrations 0007–0010 were written; 0010 is already applied. Tasks 1–3 run the three remaining SQL files directly against the production DB. Task 4 verifies state. Task 5 investigates the remaining blog issues (8 articles on wrong sites, missing pagination).

**Tech Stack:** PostgreSQL via `node-postgres`, drizzle-kit push, bash.

---

### Task 1: Run migration 0007 — Reddit + YouTube site_id

**Files:**
- Execute: `migrations/0007_intelligence_site_scope.sql` against `tramway.proxy.rlwy.net:31520`

- [ ] **Step 1: Run migration 0007**

```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
const sql = fs.readFileSync('./migrations/0007_intelligence_site_scope.sql', 'utf8');
pool.query(sql).then(() => { console.log('0007 done'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); process.exit(1); });
"
```

Expected: `0007 done`

- [ ] **Step 2: Verify Reddit/YT columns exist and data is assigned**

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
async function main() {
  const tables = ['reddit_targets','reddit_scrape_runs','yt_targets','yt_scrape_runs','yt_extracted_gaps'];
  for (const t of tables) {
    const r = await pool.query('SELECT COUNT(*) total, COUNT(*) FILTER (WHERE site_id IS NULL) nulls FROM ' + t);
    console.log(t + ':', r.rows[0]);
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: all tables show `nulls: 0`

- [ ] **Step 3: Commit**

```bash
git add migrations/0007_intelligence_site_scope.sql
git commit -m "chore(db): apply migration 0007 — reddit/yt site_id"
```

---

### Task 2: Run migration 0008 — Brand Clarity site_id

**Files:**
- Execute: `migrations/0008_bc_site_scope.sql`

- [ ] **Step 1: Run migration 0008**

```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
const sql = fs.readFileSync('./migrations/0008_bc_site_scope.sql', 'utf8');
pool.query(sql).then(() => { console.log('0008 done'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); process.exit(1); });
"
```

Expected: `0008 done`

- [ ] **Step 2: Verify BC columns**

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
async function main() {
  const tables = ['bc_projects','bc_extracted_pain_points','bc_settings','bc_iterations','bc_landing_page_variants','bc_pain_clusters'];
  for (const t of tables) {
    const r = await pool.query('SELECT COUNT(*) total, COUNT(*) FILTER (WHERE site_id IS NULL) nulls FROM ' + t);
    console.log(t + ':', r.rows[0]);
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: all nulls = 0

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(db): apply migration 0008 — brand clarity site_id"
```

---

### Task 3: Run migration 0009 — Social Hub site_id

**Files:**
- Execute: `migrations/0009_social_hub_site_scope.sql`

- [ ] **Step 1: Run migration 0009**

```bash
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
const sql = fs.readFileSync('./migrations/0009_social_hub_site_scope.sql', 'utf8');
pool.query(sql).then(() => { console.log('0009 done'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); process.exit(1); });
"
```

Expected: `0009 done`

- [ ] **Step 2: Verify SH columns**

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
async function main() {
  const tables = ['sh_settings','sh_social_accounts','sh_content_briefs','sh_templates'];
  for (const t of tables) {
    const r = await pool.query('SELECT COUNT(*) total, COUNT(*) FILTER (WHERE site_id IS NULL) nulls FROM ' + t);
    console.log(t + ':', r.rows[0]);
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: all nulls = 0

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(db): apply migration 0009 — social hub site_id"
```

---

### Task 4: Full DB audit — confirm complete tenant isolation

- [ ] **Step 1: Run full audit query**

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
async function main() {
  const tables = require('fs').readFileSync('/dev/stdin','utf8'); // dummy
  const allTables = ['articles','content_gaps','geo_runs','geo_queries','knowledge_entries','reddit_targets','reddit_scrape_runs','reddit_extracted_gaps','yt_targets','yt_scrape_runs','yt_extracted_gaps','bc_projects','bc_extracted_pain_points','bc_settings','sh_settings','sh_content_briefs','sh_templates'];
  for (const t of allTables) {
    const r = await pool.query('SELECT COUNT(*) FILTER (WHERE site_id IS NULL) nulls FROM ' + t);
    if (parseInt(r.rows[0].nulls) > 0) console.log('FAIL - nulls in', t, ':', r.rows[0].nulls);
    else console.log('OK', t);
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); });
"
```

Actually, use this simpler version:

```bash
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DATABASE_URL' });
const tables = ['articles','content_gaps','geo_runs','geo_queries','knowledge_entries','reddit_targets','reddit_scrape_runs','reddit_extracted_gaps','reddit_posts','yt_targets','yt_scrape_runs','yt_extracted_gaps','yt_comments','bc_projects','bc_extracted_pain_points','bc_settings','bc_iterations','sh_settings','sh_content_briefs','sh_templates'];
Promise.all(tables.map(async t => {
  const r = await pool.query('SELECT COUNT(*) FILTER (WHERE site_id IS NULL) n FROM ' + t);
  return [t, parseInt(r.rows[0].n)];
})).then(results => {
  results.forEach(([t,n]) => console.log(n > 0 ? 'FAIL' : 'OK  ', t, n > 0 ? '('+n+' nulls)' : ''));
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: all lines start with `OK`

---

### Task 5: Investigate blog issues — 8 articles + pagination

These two bugs likely have the same root cause.

- [ ] **Step 1: Test the articles API directly for each site**

```bash
# Replace API_URL with actual Railway API service URL (from API_BASE_URL env in Railway Dashboard)
curl "https://<API_URL>/v1/articles?siteSlug=focusequalsfreedom&status=published&limit=10" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('total:', j.pagination?.total, 'results:', j.results?.length)"

curl "https://<API_URL>/v1/articles?siteSlug=przemyslawfilipiak&status=published&limit=10" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('total:', j.pagination?.total, 'results:', j.results?.length)"
```

Expected:
- focusequalsfreedom: `total: 0 results: 0`
- przemyslawfilipiak: `total: 39 results: 10`

- [ ] **Step 2: If focusequalsfreedom returns non-zero**

The `SITE_SLUG` in the focusequalsfreedom/frinter Railway services is resolving to `przemyslawfilipiak`. Check Railway Dashboard → focusequalsfreedom service → Variables → confirm `SITE_SLUG=focusequalsfreedom` is set.

- [ ] **Step 3: If pagination is missing on przemyslawfilipiak**

With 39 articles and limit=10, totalPages should be 4. The blog page uses:
```typescript
totalCount = data.pagination?.total ?? posts.length;
```
If `data.pagination?.total` is `0` or `null`, it falls back to `posts.length` and pagination disappears.
Check: does the API actually return `pagination.total = 39` for the PF site?
