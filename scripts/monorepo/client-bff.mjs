import http from 'node:http';

const mode = process.argv[2] ?? 'start';
const siteSlug = process.argv[3] ?? 'focusequalsfreedom';
const port = Number.parseInt(process.env.PORT ?? '4321', 10);
const host = process.env.HOST ?? '0.0.0.0';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const legacyAppUrl = process.env.LEGACY_APP_URL ?? '';

const FALLBACK_SITE_CONFIG = {
  przemyslawfilipiak: {
    slug: 'przemyslawfilipiak',
    displayName: 'Przemyslaw Filipiak',
    primaryDomain: 'przemyslawfilipiak.com',
    brandConfig: {
      siteName: 'Przemyslaw Filipiak',
      shortName: 'P·F',
      personName: 'Przemyslaw Filipiak',
      accent: '#b7791f',
      tagline: 'High performer. Deep focus founder.',
      description: 'Personal site about deep work, AI building, and wholebeing performance systems.',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://przemyslawfilipiak.com',
    },
    llmContext: 'Primary legacy site for the existing monolith.',
  },
  focusequalsfreedom: {
    slug: 'focusequalsfreedom',
    displayName: 'Focus Equals Freedom',
    primaryDomain: 'focusequalsfreedom.com',
    brandConfig: {
      siteName: 'Focus Equals Freedom',
      shortName: 'FEF',
      personName: 'Focus Equals Freedom',
      accent: '#0f766e',
      tagline: 'Systems for deep work, clarity, and sustainable execution.',
      description: 'Essays and operating principles for founders who want focus without burnout.',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://focusequalsfreedom.com',
    },
    llmContext: 'Bootstrap tenant for future client2 extraction.',
  },
  frinter: {
    slug: 'frinter',
    displayName: 'Frinter',
    primaryDomain: 'frinter.app',
    brandConfig: {
      siteName: 'Frinter',
      shortName: 'FR',
      personName: 'Frinter',
      accent: '#1d4ed8',
      tagline: 'A focus operating system for builders and high performers.',
      description: 'Product narrative, articles, and operating system thinking for deep work builders.',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://frinter.app',
    },
    llmContext: 'Bootstrap tenant for future client3 extraction.',
  },
};

let siteConfigCache = null;
let siteConfigCacheAt = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fallbackSiteConfig() {
  return FALLBACK_SITE_CONFIG[siteSlug] ?? {
    slug: siteSlug,
    displayName: siteSlug,
    primaryDomain: `${siteSlug}.local`,
    brandConfig: {
      siteName: siteSlug,
      shortName: siteSlug.slice(0, 2).toUpperCase(),
      personName: siteSlug,
      accent: '#334155',
      tagline: `Public shell for ${siteSlug}`,
      description: `Distributed client runtime for ${siteSlug}.`,
    },
    seoConfig: {
      canonicalBaseUrl: `https://${siteSlug}.local`,
    },
    llmContext: `Distributed client runtime for ${siteSlug}.`,
  };
}

async function getSiteConfig() {
  const now = Date.now();
  if (siteConfigCache && now - siteConfigCacheAt < 60_000) return siteConfigCache;

  try {
    const response = await apiFetch(`/v1/sites/${siteSlug}/public-config`);
    if (response.ok) {
      siteConfigCache = await response.json();
      siteConfigCacheAt = now;
      return siteConfigCache;
    }
  } catch {}

  siteConfigCache = fallbackSiteConfig();
  siteConfigCacheAt = now;
  return siteConfigCache;
}

function siteContext(config) {
  const fallback = fallbackSiteConfig();
  const brand = config?.brandConfig ?? {};
  const seo = config?.seoConfig ?? {};
  return {
    slug: config?.slug ?? fallback.slug,
    label: config?.displayName ?? fallback.displayName,
    siteName: brand.siteName ?? config?.displayName ?? fallback.brandConfig.siteName,
    shortName: brand.shortName ?? fallback.brandConfig.shortName,
    personName: brand.personName ?? fallback.brandConfig.personName,
    accent: brand.accent ?? fallback.brandConfig.accent,
    tagline: brand.tagline ?? fallback.brandConfig.tagline,
    description: brand.description ?? fallback.brandConfig.description,
    canonicalBaseUrl: seo.canonicalBaseUrl ?? fallback.seoConfig.canonicalBaseUrl,
    primaryDomain: config?.primaryDomain ?? fallback.primaryDomain,
    llmContext: config?.llmContext ?? fallback.llmContext,
  };
}

function html(site, title, body, { description = site.description, canonicalPath = '/', ogType = 'website' } = {}) {
  const canonicalUrl = new URL(canonicalPath, site.canonicalBaseUrl).toString();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="${escapeHtml(ogType)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}"><meta property="og:site_name" content="${escapeHtml(site.siteName)}"><style>
  :root{--accent:${site.accent};--bg:#f5f1e8;--ink:#1f2937;--panel:#fffdf8;--line:#ddd6c8}
  *{box-sizing:border-box}body{margin:0;font-family:Georgia,serif;background:radial-gradient(circle at top,#fffef8, var(--bg));color:var(--ink)}
  a{color:inherit;text-decoration:none} .wrap{max-width:1100px;margin:0 auto;padding:24px}
  .nav{display:flex;justify-content:space-between;align-items:center;padding:16px 0}.brand{font-size:24px;font-weight:700;letter-spacing:.04em}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 16px 50px rgba(0,0,0,.05)}
  .grid{display:grid;gap:16px}.grid.cols-3{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
  .card{background:white;border:1px solid var(--line);border-radius:16px;padding:18px}.kpi{font-size:32px;font-weight:700;color:var(--accent)}
  .list{display:grid;gap:12px}.item{padding:16px;border:1px solid var(--line);border-radius:14px;background:white}
  .muted{color:#6b7280}.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:#f1f5f9;font-size:12px}
  .btn{display:inline-block;border:none;background:var(--accent);color:white;padding:12px 18px;border-radius:999px;cursor:pointer}
  .btn.secondary{background:#e5e7eb;color:#111827}.actions{display:flex;gap:10px;flex-wrap:wrap}
  input,textarea{width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:white}.form{display:grid;gap:14px;max-width:420px}
  table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280}.hero{display:grid;gap:16px;padding:56px 0}.prose{line-height:1.7}.prose p{margin:0 0 1em}.prose pre{white-space:pre-wrap;font-family:inherit}.meta{font-size:14px;color:#6b7280}.footer{padding:28px 0;color:#6b7280}
  </style></head><body>${body}</body></html>`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function apiFetch(pathname, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

function toHtmlFromMarkdown(markdown) {
  const safe = escapeHtml(markdown ?? '');
  return safe
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('#')) return `<p><strong>${trimmed.replace(/^#+\s*/, '')}</strong></p>`;
      if (trimmed.startsWith('>')) return `<p><em>${trimmed.replace(/^>\s*/, '')}</em></p>`;
      if (trimmed.startsWith('- ')) {
        const items = trimmed.split('\n').map((line) => `<li>${line.replace(/^- /, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${trimmed.replaceAll('\n', '<br>')}</p>`;
    })
    .join('');
}

async function legacyFetch(req, pathnameOverride) {
  if (!legacyAppUrl) return null;
  const url = new URL(pathnameOverride ?? req.url ?? '/', legacyAppUrl);
  const raw = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '') ? await readBody(req) : '';
  return fetch(url, {
    method: req.method ?? 'GET',
    headers: {
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
    },
    body: raw || undefined,
    redirect: 'manual',
  });
}

async function proxyLegacy(req, res, pathnameOverride) {
  const response = await legacyFetch(req, pathnameOverride);
  if (!response) return false;
  const payload = await response.text();
  const headers = {
    'content-type': response.headers.get('content-type') ?? 'text/html; charset=utf-8',
  };
  const setCookie = response.headers.get('set-cookie');
  const location = response.headers.get('location');
  if (setCookie) headers['set-cookie'] = setCookie;
  if (location) headers.location = location;
  res.writeHead(response.status, headers);
  res.end(payload);
  return true;
}

async function requireSession(req, res) {
  const response = await apiFetch('/v1/auth/me', { cookie: req.headers.cookie ?? '' });
  if (!response.ok) {
    res.writeHead(302, { Location: '/admin/login' });
    res.end();
    return null;
  }
  return response.json();
}

function sendHtml(res, status, markup) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(markup);
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

function jobLinesFromSnapshot(job) {
  const lines = [];
  const createdTs = job?.createdAt ? Date.parse(job.createdAt) : Date.now();
  const startedTs = job?.startedAt ? Date.parse(job.startedAt) : createdTs;
  const progressLogs = Array.isArray(job?.progress?.logs)
    ? job.progress.logs
        .filter((entry) => entry && typeof entry.line === 'string')
        .map((entry) => ({
          line: entry.line,
          ts: typeof entry.ts === 'number' ? entry.ts : startedTs,
        }))
    : [];
  if (job) {
    lines.push({ line: `[JOB] Created ${job.topic} job #${job.id}`, ts: createdTs });
    if (job.status === 'pending' || job.status === 'running') {
      lines.push({ line: '[JOB] Running in distributed worker...', ts: startedTs });
    }
    lines.push(...progressLogs);
    if (job.error) {
      lines.push({ line: `[JOB] ${job.error}`, ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() });
    }
    if (job.result?.domainResult?.article_id) {
      lines.push({ line: `[JOB] Draft created: article #${job.result.domainResult.article_id}`, ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() });
    }
    if (job.status === 'cancelled') {
      lines.push({ line: '[JOB] Cancelled manually', ts: job.finishedAt ? Date.parse(job.finishedAt) : Date.now() });
    }
  }
  return lines;
}

function publicNav(site) {
  return `<div class="wrap"><div class="nav"><a class="brand" href="/">${escapeHtml(site.siteName)}</a><div class="actions"><a class="pill" href="/blog">Blog</a><a class="pill" href="/llms.txt">llms.txt</a><a class="pill" href="/admin/login">Admin</a></div></div></div>`;
}

function adminNav(site) {
  return `<div class="wrap"><div class="nav"><a class="brand" href="/">${escapeHtml(site.shortName)}</a><div class="actions"><a class="pill" href="/admin">Dashboard</a><a class="pill" href="/admin/articles">Articles</a><a class="pill" href="/admin/knowledge-base">Knowledge Base</a><a class="pill" href="/admin/content-gaps">Content Gaps</a><a class="pill" href="/api/logout">Logout</a></div></div></div>`;
}

function footer(site) {
  return `<div class="wrap"><div class="footer">Distributed client runtime for ${escapeHtml(site.siteName)} on ${escapeHtml(site.primaryDomain)}.</div></div>`;
}

function loginPage(site, error) {
  return html(site, `${site.siteName} Login`, `${publicNav(site)}<div class="wrap"><div class="panel"><h1>Admin Login</h1><p class="muted">Session is terminated on this client domain and proxied to central API.</p>${error ? '<p style="color:#b91c1c">Invalid password.</p>' : ''}<form method="post" action="/api/auth" class="form"><input type="password" name="password" placeholder="Admin password" required><button class="btn" type="submit">Login</button></form></div></div>${footer(site)}`, { canonicalPath: '/admin/login' });
}

function landingPage(site, articles) {
  const highlights = (articles ?? []).slice(0, 3).map((article) => `<div class="item"><div class="meta">${article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Draft'}</div><h3><a href="/blog/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h3><p class="muted">${escapeHtml(article.description ?? '')}</p></div>`).join('');
  return html(site, `${site.siteName} - ${site.tagline}`, `${publicNav(site)}<div class="wrap"><section class="hero"><span class="pill">${escapeHtml(site.primaryDomain)}</span><h1>${escapeHtml(site.siteName)}</h1><p class="prose">${escapeHtml(site.tagline)}</p><p class="muted">${escapeHtml(site.description)}</p><div class="actions"><a class="btn" href="/blog">Read the blog</a><a class="btn secondary" href="/admin/login">Open admin</a></div></section><section class="panel"><h2>Latest articles</h2><div class="list">${highlights || '<div class="item muted">No published articles yet.</div>'}</div></section></div>${footer(site)}`);
}

function blogIndexPage(site, data) {
  const rows = (data.results ?? []).map((item) => `<div class="item"><div class="meta">${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : 'Draft'} · ${item.readingTime ?? 0} min</div><h2><a href="/blog/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.description ?? '')}</p><a class="pill" href="/blog/${encodeURIComponent(item.slug)}">Read article</a></div>`).join('');
  return html(site, `${site.siteName} Blog`, `${publicNav(site)}<div class="wrap"><div class="panel"><h1>Blog</h1><div class="list">${rows || '<div class="item muted">No published articles</div>'}</div></div></div>${footer(site)}`, { canonicalPath: '/blog' });
}

function blogArticlePage(site, article) {
  return html(site, `${article.title} | ${site.siteName}`, `${publicNav(site)}<div class="wrap"><article class="panel"><div class="meta">${article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Draft'} · ${article.readingTime ?? 0} min</div><h1>${escapeHtml(article.title)}</h1><p class="muted">${escapeHtml(article.description ?? '')}</p><div class="prose">${toHtmlFromMarkdown(article.content ?? '')}</div></article></div>${footer(site)}`, { canonicalPath: `/blog/${encodeURIComponent(article.slug)}`, description: article.description ?? site.description, ogType: 'article' });
}

function dashboardPage(site, stats) {
  return html(site, `${site.siteName} Admin`, `${adminNav(site)}<div class="wrap grid"><div class="panel"><h1>Distributed Admin Shell</h1><p class="muted">This client is now a BFF runtime that talks to central API.</p></div><div class="grid cols-3"><div class="card"><div class="muted">Articles</div><div class="kpi">${stats.articles?.total ?? 0}</div></div><div class="card"><div class="muted">Open Gaps</div><div class="kpi">${stats.contentGaps?.open ?? 0}</div></div><div class="card"><div class="muted">KB Entries</div><div class="kpi">${stats.knowledgeBase?.total ?? 0}</div></div></div></div>${footer(site)}`, { canonicalPath: '/admin' });
}

function articlePage(site, data) {
  const rows = (data.results ?? []).map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.slug)}</td><td>${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}</td></tr>`).join('');
  return html(site, `${site.siteName} Articles`, `${adminNav(site)}<div class="wrap"><div class="panel"><h1>Articles</h1><table><thead><tr><th>Title</th><th>Status</th><th>Slug</th><th>Updated</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No articles</td></tr>'}</tbody></table></div></div>${footer(site)}`, { canonicalPath: '/admin/articles' });
}

function kbPage(site, data) {
  const rows = (data.entries ?? []).map((item) => `<div class="item"><div class="actions"><span class="pill">${escapeHtml(item.type)}</span><span class="pill">Score ${item.importanceScore ?? 0}</span></div><h3>${escapeHtml(item.title)}</h3><p class="muted">${escapeHtml((item.content ?? '').slice(0, 220))}</p></div>`).join('');
  return html(site, `${site.siteName} Knowledge Base`, `${adminNav(site)}<div class="wrap"><div class="panel"><h1>Knowledge Base</h1><div class="list">${rows || '<div class="item muted">No entries</div>'}</div></div></div>${footer(site)}`, { canonicalPath: '/admin/knowledge-base' });
}

function gapsPage(site, data) {
  const rows = (data.items ?? []).map((item) => `<div class="item"><div class="actions"><span class="pill">${escapeHtml(item.status)}</span><span class="pill">Confidence ${item.confidenceScore}</span></div><h3>${escapeHtml(item.gapTitle)}</h3><p>${escapeHtml(item.gapDescription)}</p><p class="muted">${escapeHtml(item.suggestedAngle ?? 'No proposal yet')}</p></div>`).join('');
  return html(site, `${site.siteName} Content Gaps`, `${adminNav(site)}<div class="wrap grid"><div class="grid cols-3"><div class="card"><div class="muted">New</div><div class="kpi">${data.stats?.totalNew ?? 0}</div></div><div class="card"><div class="muted">In Progress</div><div class="kpi">${data.stats?.totalInProgress ?? 0}</div></div><div class="card"><div class="muted">Archived</div><div class="kpi">${data.stats?.totalArchived ?? 0}</div></div></div><div class="panel"><h1>Content Gaps</h1><div class="list">${rows || '<div class="item muted">No gaps</div>'}</div></div></div>${footer(site)}`, { canonicalPath: '/admin/content-gaps' });
}

function sendText(res, status, payload, contentType = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': contentType, ...headers });
  res.end(payload);
}

function xmlEscape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function robotsTxt(site) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.canonicalBaseUrl}/sitemap.xml\nSitemap: ${site.canonicalBaseUrl}/rss.xml\n`;
}

function llmsTxt(site) {
  return `Sitemap: ${site.canonicalBaseUrl}/sitemap.xml\nFull-Context: ${site.canonicalBaseUrl}/llms-full.txt\n\n# ${site.siteName}\n\n- Primary domain: ${site.primaryDomain}\n- Canonical base URL: ${site.canonicalBaseUrl}\n- Tagline: ${site.tagline}\n- Description: ${site.description}\n- Admin login: ${site.canonicalBaseUrl}/admin/login\n`;
}

function llmsFullTxt(site) {
  return `# Full Context: ${site.siteName}\n\n${site.description}\n\n## Brand Identity\n- Site name: ${site.siteName}\n- Display label: ${site.label}\n- Domain: ${site.primaryDomain}\n- Canonical URL: ${site.canonicalBaseUrl}\n\n## Operating context\n${site.llmContext}\n\n## Structured endpoints\n- llms.txt: ${site.canonicalBaseUrl}/llms.txt\n- RSS: ${site.canonicalBaseUrl}/rss.xml\n- Sitemap: ${site.canonicalBaseUrl}/sitemap.xml\n`;
}

function webmanifest(site) {
  return JSON.stringify({
    name: site.siteName,
    short_name: site.shortName,
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f1e8',
    theme_color: site.accent,
    description: site.description,
  });
}

function sitemapXml(site, articles) {
  const today = new Date().toISOString();
  const urls = [
    `${site.canonicalBaseUrl}/`,
    `${site.canonicalBaseUrl}/blog`,
    `${site.canonicalBaseUrl}/admin/login`,
    ...articles.map((article) => `${site.canonicalBaseUrl}/blog/${article.slug}`),
  ];
  const body = urls.map((loc) => `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function rssXml(site, articles) {
  const items = articles.map((article) => `    <item>\n      <title>${xmlEscape(article.title)}</title>\n      <link>${xmlEscape(`${site.canonicalBaseUrl}/blog/${article.slug}`)}</link>\n      <guid>${xmlEscape(`${site.canonicalBaseUrl}/blog/${article.slug}`)}</guid>\n      <description>${xmlEscape(article.description ?? '')}</description>\n      <pubDate>${new Date(article.publishedAt ?? article.createdAt ?? Date.now()).toUTCString()}</pubDate>\n    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${xmlEscape(`${site.siteName} Blog`)}</title>\n    <link>${xmlEscape(site.canonicalBaseUrl)}</link>\n    <description>${xmlEscape(site.description)}</description>\n    <language>en</language>\n${items}\n  </channel>\n</rss>\n`;
}

async function renderAuthedPage(req, res, pathname, apiPath, render) {
  const site = siteContext(await getSiteConfig());
  const session = await requireSession(req, res);
  if (!session) return;
  const response = await apiFetch(`${apiPath}${apiPath.includes('?') ? '&' : '?'}siteSlug=${siteSlug}`, { cookie: req.headers.cookie ?? '' });
  const data = await response.json();
  if (!response.ok) return sendJson(res, response.status, data);
  sendHtml(res, 200, render(site, data, session));
}

async function getJobSnapshot(req, topic) {
  let activeResponse;
  let latestResponse;
  try {
    [activeResponse, latestResponse] = await Promise.all([
      apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=${topic}`, { cookie: req.headers.cookie ?? '' }),
      apiFetch(`/v1/jobs/latest?siteSlug=${siteSlug}&topic=${topic}`, { cookie: req.headers.cookie ?? '' }),
    ]);
  } catch {
    return {
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      queryCount: 0,
      totalSteps: 45,
      progress: 0,
      lines: [],
    };
  }

  const activePayload = await activeResponse.json().catch(() => ({}));
  const latestPayload = await latestResponse.json().catch(() => ({}));
  const activeJob = activePayload.job ?? null;
  const latestJob = latestPayload.job ?? null;
  const job = activeJob ?? latestJob;

  if (!job) {
    return {
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      queryCount: 0,
      totalSteps: 45,
      progress: 0,
      lines: [],
    };
  }

  const mappedStatus = job.status === 'running'
    ? 'running'
    : job.status === 'done'
      ? 'done'
      : job.status === 'error'
        ? 'error'
        : 'idle';

  return {
    status: mappedStatus,
    startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
    finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
    exitCode: job.status === 'error' ? 1 : 0,
    queryCount: 0,
    totalSteps: 45,
    progress: mappedStatus === 'done' ? 100 : mappedStatus === 'running' ? 10 : 0,
    lines: jobLinesFromSnapshot(job),
    rawJob: job,
  };
}

function matchesJobFilter(job, filters = {}) {
  if (!job) return false;
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined || value === null) return true;
    return Number(job.payload?.[key] ?? 0) === Number(value);
  });
}

async function getScopedJob(req, topic, filters = {}) {
  const [activeResponse, latestResponse] = await Promise.all([
    apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=${topic}`, { cookie: req.headers.cookie ?? '' }),
    apiFetch(`/v1/jobs/latest?siteSlug=${siteSlug}&topic=${topic}`, { cookie: req.headers.cookie ?? '' }),
  ]);
  const activePayload = await activeResponse.json().catch(() => ({}));
  const latestPayload = await latestResponse.json().catch(() => ({}));
  const activeJob = matchesJobFilter(activePayload.job, filters) ? activePayload.job : null;
  const latestJob = matchesJobFilter(latestPayload.job, filters) ? latestPayload.job : null;
  return activeJob ?? latestJob ?? null;
}

async function getBcJobSnapshot(req, topic, filters = {}) {
  const job = await getScopedJob(req, topic, filters);
  if (!job) {
    return {
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      lines: [],
      result: null,
    };
  }

  const metrics = job.result?.metrics ?? {};
  return {
    status: job.status === 'pending' ? 'running' : job.status === 'cancelled' ? 'idle' : job.status,
    startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
    finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
    exitCode: job.status === 'error' ? 1 : 0,
    lines: jobLinesFromSnapshot(job),
    result: job.result?.domainResult ?? job.result ?? null,
    commentsCollected: metrics.commentsCollected ?? 0,
    painPointsExtracted: metrics.painPointsExtracted ?? 0,
    videoScrapedId: metrics.videoScrapedId ?? null,
    selectedCount: metrics.selectedCount ?? 0,
    clustersCreated: metrics.clustersCreated ?? 0,
    variantsGenerated: metrics.variantsGenerated ?? 0,
    nicheKeywordsFound: metrics.nicheKeywordsFound ?? null,
    audiencePainKeywordsFound: metrics.audiencePainKeywordsFound ?? null,
    featureMapItems: metrics.featureMapItems ?? null,
    rawJob: job,
  };
}

async function streamTopicSnapshot(req, res, { topic, filters = {}, runningLine, doneLine, errorLine, buildPayload }) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  const loop = async () => {
    while (!closed) {
      const snapshot = await getBcJobSnapshot(req, topic, filters);
      if (snapshot.status === 'running') {
        send(buildPayload ? buildPayload(snapshot) : { line: runningLine });
      } else if (snapshot.status === 'done') {
        send(buildPayload ? buildPayload(snapshot) : { line: doneLine });
        send({ done: true, code: 0, ...snapshot });
        res.end();
        return;
      } else if (snapshot.status === 'error') {
        send(buildPayload ? buildPayload(snapshot) : { line: errorLine });
        send({ done: true, code: 1, ...snapshot });
        res.end();
        return;
      } else {
        send({ done: true, code: 0, ...snapshot });
        res.end();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  };

  loop().catch((error) => {
    send({ line: String(error), done: true, code: 1 });
    res.end();
  });
}

async function getRedditSnapshot(req) {
  const [activeResponse, latestResponse] = await Promise.all([
    apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=reddit`, { cookie: req.headers.cookie ?? '' }),
    apiFetch(`/v1/jobs/latest?siteSlug=${siteSlug}&topic=reddit`, { cookie: req.headers.cookie ?? '' }),
  ]);
  const activePayload = await activeResponse.json().catch(() => ({}));
  const latestPayload = await latestResponse.json().catch(() => ({}));
  const job = activePayload.job ?? latestPayload.job ?? null;
  if (!job) {
    return {
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      postsCollected: 0,
      painPointsExtracted: 0,
      currentTarget: null,
      lines: [],
      result: null,
    };
  }

  const metrics = job.result?.metrics ?? {};
  return {
    status: job.status === 'pending' ? 'running' : job.status === 'cancelled' ? 'idle' : job.status,
    startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
    finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
    exitCode: job.status === 'error' ? 1 : 0,
    postsCollected: metrics.postsCollected ?? 0,
    painPointsExtracted: metrics.painPointsExtracted ?? job.result?.domainResult?.gapsExtracted ?? 0,
    currentTarget: metrics.currentTarget ?? null,
    lines: jobLinesFromSnapshot(job),
    result: job.result?.domainResult ?? job.result ?? null,
  };
}

async function getYoutubeSnapshot(req) {
  const [activeResponse, latestResponse] = await Promise.all([
    apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=youtube`, { cookie: req.headers.cookie ?? '' }),
    apiFetch(`/v1/jobs/latest?siteSlug=${siteSlug}&topic=youtube`, { cookie: req.headers.cookie ?? '' }),
  ]);
  const activePayload = await activeResponse.json().catch(() => ({}));
  const latestPayload = await latestResponse.json().catch(() => ({}));
  const job = activePayload.job ?? latestPayload.job ?? null;
  if (!job) {
    return {
      status: 'idle',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      commentsCollected: 0,
      painPointsExtracted: 0,
      currentTarget: null,
      lines: [],
      result: null,
    };
  }

  const metrics = job.result?.metrics ?? {};
  return {
    status: job.status === 'pending' ? 'running' : job.status === 'cancelled' ? 'idle' : job.status,
    startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
    finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
    exitCode: job.status === 'error' ? 1 : 0,
    commentsCollected: metrics.commentsCollected ?? job.result?.domainResult?.commentsCollected ?? 0,
    painPointsExtracted: metrics.painPointsExtracted ?? job.result?.domainResult?.painPointsExtracted ?? 0,
    currentTarget: metrics.currentTarget ?? null,
    lines: jobLinesFromSnapshot(job),
    result: job.result?.domainResult ?? job.result ?? null,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const site = siteContext(await getSiteConfig());

  if (url.pathname === '/health') return sendJson(res, 200, { service: `client-${siteSlug}`, status: 'ok', mode });
  if (url.pathname === '/') {
    const response = await apiFetch(`/v1/articles?siteSlug=${siteSlug}&limit=3`);
    const payload = await response.json().catch(() => ({ results: [] }));
    return sendHtml(res, 200, landingPage(site, payload.results ?? []));
  }
  if (url.pathname === '/blog' && req.method === 'GET') {
    const response = await apiFetch(`/v1/articles?siteSlug=${siteSlug}&limit=50`);
    const payload = await response.json().catch(() => ({ results: [] }));
    return sendHtml(res, 200, blogIndexPage(site, payload));
  }
  if (url.pathname.startsWith('/blog/') && req.method === 'GET') {
    const articleSlug = decodeURIComponent(url.pathname.slice('/blog/'.length));
    const response = await apiFetch(`/v1/articles/${encodeURIComponent(articleSlug)}?siteSlug=${siteSlug}`);
    if (!response.ok) {
      return sendHtml(res, 404, html(site, 'Not found', `${publicNav(site)}<div class="wrap"><div class="panel"><h1>Article not found</h1></div></div>${footer(site)}`));
    }
    const article = await response.json();
    return sendHtml(res, 200, blogArticlePage(site, article));
  }
  if (url.pathname === '/robots.txt') return sendText(res, 200, robotsTxt(site));
  if (url.pathname === '/llms.txt') return sendText(res, 200, llmsTxt(site));
  if (url.pathname === '/llms-full.txt') return sendText(res, 200, llmsFullTxt(site));
  if (url.pathname === '/site.webmanifest') return sendText(res, 200, webmanifest(site), 'application/manifest+json; charset=utf-8');
  if (url.pathname === '/sitemap.xml') {
    const response = await apiFetch(`/v1/articles?siteSlug=${siteSlug}&limit=100`);
    const payload = await response.json().catch(() => ({ results: [] }));
    return sendText(res, 200, sitemapXml(site, payload.results ?? []), 'application/xml; charset=utf-8');
  }
  if (url.pathname === '/rss.xml') {
    const response = await apiFetch(`/v1/articles?siteSlug=${siteSlug}&limit=50`);
    const payload = await response.json().catch(() => ({ results: [] }));
    return sendText(res, 200, rssXml(site, payload.results ?? []), 'application/rss+xml; charset=utf-8');
  }
  if (url.pathname === '/admin/login' && req.method === 'GET') return sendHtml(res, 200, loginPage(site, url.searchParams.get('error') === '1'));
  if (url.pathname === '/admin' && req.method === 'GET') return renderAuthedPage(req, res, url.pathname, '/v1/admin/dashboard', dashboardPage);
  if (url.pathname === '/admin/articles' && req.method === 'GET') return renderAuthedPage(req, res, url.pathname, '/v1/admin/articles?limit=50', articlePage);
  if (url.pathname === '/admin/knowledge-base' && req.method === 'GET') return renderAuthedPage(req, res, url.pathname, '/v1/admin/knowledge-base?limit=50', kbPage);
  if (url.pathname === '/admin/content-gaps' && req.method === 'GET') return renderAuthedPage(req, res, url.pathname, '/v1/admin/content-gaps?status=new,in_progress&limit=50', gapsPage);

  if (url.pathname === '/api/auth' && req.method === 'POST') {
    const raw = await readBody(req);
    const contentType = req.headers['content-type'] ?? '';
    let parsed;
    try {
      parsed = contentType.includes('application/json')
        ? JSON.parse(raw || '{}')
        : Object.fromEntries(new URLSearchParams(raw));
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const response = await apiFetch('/v1/auth/login', { method: 'POST', body: { password: parsed.password ?? '', siteSlug } });
    const payload = await response.json().catch(() => ({}));
    if (contentType.includes('application/json')) {
      const setCookie = response.headers.get('set-cookie');
      sendJson(res, response.status, payload, setCookie ? { 'set-cookie': setCookie } : {});
      return;
    }
    if (!response.ok) {
      res.writeHead(302, { Location: '/admin/login?error=1' });
      res.end();
      return;
    }
    const setCookie = response.headers.get('set-cookie');
    res.writeHead(302, { Location: '/admin', ...(setCookie ? { 'set-cookie': setCookie } : {}) });
    res.end();
    return;
  }

  if (url.pathname === '/api/logout') {
    const response = await apiFetch('/v1/auth/logout', { method: 'POST', cookie: req.headers.cookie ?? '' });
    const setCookie = response.headers.get('set-cookie');
    res.writeHead(302, { Location: '/admin/login', ...(setCookie ? { 'set-cookie': setCookie } : {}) });
    res.end();
    return;
  }

  if (url.pathname === '/api/geo/start' && req.method === 'POST') {
    const response = await apiFetch('/v1/jobs/geo', { method: 'POST', body: { siteSlug }, cookie: req.headers.cookie ?? '' });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  if (url.pathname === '/api/reddit/start' && req.method === 'POST') {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const response = await apiFetch('/v1/jobs/reddit', {
      method: 'POST',
      body: {
        siteSlug,
        targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      },
      cookie: req.headers.cookie ?? '',
    });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  if (url.pathname === '/api/reddit/status' && req.method === 'GET') {
    return sendJson(res, 200, await getRedditSnapshot(req), { 'cache-control': 'no-store' });
  }

  if (url.pathname === '/api/reddit/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;
    req.on('close', () => { closed = true; });

    const loop = async () => {
      while (!closed) {
        const snapshot = await getRedditSnapshot(req);
        if (snapshot.status === 'running') {
          send({ line: '[REDDIT] Job running in distributed worker...' });
        } else if (snapshot.status === 'done') {
          send({ line: '[REDDIT] Job finished' });
          send({ done: true, code: 0 });
          res.end();
          return;
        } else if (snapshot.status === 'error') {
          send({ line: '[REDDIT] Job failed' });
          send({ done: true, code: 1 });
          res.end();
          return;
        } else {
          send({ done: true, code: 0 });
          res.end();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    loop().catch((error) => {
      send({ line: String(error), done: true, code: 1 });
      res.end();
    });
    return;
  }

  if (url.pathname === '/api/youtube/start' && req.method === 'POST') {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const response = await apiFetch('/v1/jobs/youtube', {
      method: 'POST',
      body: {
        siteSlug,
        targetIds: Array.isArray(parsed.targetIds) ? parsed.targetIds : [],
      },
      cookie: req.headers.cookie ?? '',
    });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  if (url.pathname === '/api/youtube/status' && req.method === 'GET') {
    return sendJson(res, 200, await getYoutubeSnapshot(req), { 'cache-control': 'no-store' });
  }

  if (url.pathname === '/api/youtube/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;
    req.on('close', () => { closed = true; });

    const loop = async () => {
      while (!closed) {
        const snapshot = await getYoutubeSnapshot(req);
        if (snapshot.status === 'running') {
          send({ line: '[YOUTUBE] Job running in distributed worker...' });
        } else if (snapshot.status === 'done') {
          send({ line: '[YOUTUBE] Job finished' });
          send({ done: true, code: 0 });
          res.end();
          return;
        } else if (snapshot.status === 'error') {
          send({ line: '[YOUTUBE] Job failed' });
          send({ done: true, code: 1 });
          res.end();
          return;
        } else {
          send({ done: true, code: 0 });
          res.end();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    loop().catch((error) => {
      send({ line: String(error), done: true, code: 1 });
      res.end();
    });
    return;
  }

  if (url.pathname === '/api/geo/status' && req.method === 'GET') {
    const snapshot = await getJobSnapshot(req, 'geo');
    sendJson(res, 200, snapshot, { 'cache-control': 'no-store' });
    return;
  }

  if (url.pathname === '/api/geo/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;
    req.on('close', () => { closed = true; });

    const loop = async () => {
      while (!closed) {
        const snapshot = await getJobSnapshot(req, 'geo');
        if (snapshot.status === 'running') {
          send({ line: '[GEO] Job running in distributed worker...' });
        } else if (snapshot.status === 'done') {
          send({ line: '[GEO] Job finished' });
          send({ done: true, code: 0 });
          res.end();
          return;
        } else if (snapshot.status === 'error') {
          send({ line: '[GEO] Job failed' });
          send({ done: true, code: 1 });
          res.end();
          return;
        } else {
          send({ done: true, code: 0 });
          res.end();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    loop().catch((error) => {
      send({ line: String(error), done: true, code: 1 });
      res.end();
    });
    return;
  }

  if (url.pathname === '/api/brand-clarity/projects/parse-stream' && req.method === 'GET') {
    return streamTopicSnapshot(req, res, {
      topic: 'bc-parse',
      runningLine: '[BC] Parse job running in distributed worker...',
      doneLine: '[BC] Parse job finished',
      errorLine: '[BC] Parse job failed',
    });
  }

  const bcScrapeMatch = url.pathname.match(/^\/api\/brand-clarity\/(\d+)\/scrape\/(start|status|stream|stop)$/);
  if (bcScrapeMatch) {
    const projectId = Number(bcScrapeMatch[1]);
    const action = bcScrapeMatch[2];

    if (action === 'start' && req.method === 'POST') {
      let parsed = {};
      try {
        parsed = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'Invalid request body' });
      }
      const response = await apiFetch('/v1/jobs/bc-scrape', {
        method: 'POST',
        body: { siteSlug, projectId, videoId: parsed.videoId ?? null },
        cookie: req.headers.cookie ?? '',
      });
      const payload = await response.text();
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
      res.end(payload);
      return;
    }

    if (action === 'status' && req.method === 'GET') {
      return sendJson(res, 200, await getBcJobSnapshot(req, 'bc-scrape', { projectId }), { 'cache-control': 'no-store' });
    }

    if (action === 'stream' && req.method === 'GET') {
      return streamTopicSnapshot(req, res, {
        topic: 'bc-scrape',
        filters: { projectId },
        runningLine: '[BC] Scrape job running in distributed worker...',
        doneLine: '[BC] Scrape job finished',
        errorLine: '[BC] Scrape job failed',
      });
    }

    if (action === 'stop' && req.method === 'POST') {
      const response = await apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=bc-scrape`, {
        method: 'DELETE',
        cookie: req.headers.cookie ?? '',
      });
      const payload = await response.text();
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
      res.end(payload);
      return;
    }
  }

  const bcSelectMatch = url.pathname.match(/^\/api\/brand-clarity\/(\d+)\/iterations\/(\d+)\/(select|select-stream)$/);
  if (bcSelectMatch) {
    const projectId = Number(bcSelectMatch[1]);
    const iterationId = Number(bcSelectMatch[2]);
    const action = bcSelectMatch[3];

    if (action === 'select' && req.method === 'POST') {
      const response = await apiFetch('/v1/jobs/bc-selector', {
        method: 'POST',
        body: { siteSlug, projectId, iterationId },
        cookie: req.headers.cookie ?? '',
      });
      const payload = await response.text();
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
      res.end(payload);
      return;
    }

    if (action === 'select-stream' && req.method === 'GET') {
      return streamTopicSnapshot(req, res, {
        topic: 'bc-selector',
        filters: { projectId, iterationId },
        runningLine: '[BC] Selector job running in distributed worker...',
        doneLine: '[BC] Selector job finished',
        errorLine: '[BC] Selector job failed',
      });
    }
  }

  const bcVariantsMatch = url.pathname.match(/^\/api\/brand-clarity\/(\d+)\/(generate-variants|variants\/status|variants\/stream)$/);
  if (bcVariantsMatch) {
    const projectId = Number(bcVariantsMatch[1]);
    const action = bcVariantsMatch[2];

    if (action === 'generate-variants' && req.method === 'POST') {
      let parsed = {};
      try {
        parsed = JSON.parse((await readBody(req)) || '{}');
      } catch {
        parsed = {};
      }
      const response = await apiFetch('/v1/jobs/bc-generate', {
        method: 'POST',
        body: { siteSlug, projectId, iterationId: parsed.iterationId ?? null },
        cookie: req.headers.cookie ?? '',
      });
      const payload = await response.text();
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
      res.end(payload);
      return;
    }

    if (action === 'variants/status' && req.method === 'GET') {
      return sendJson(res, 200, await getBcJobSnapshot(req, 'bc-generate', { projectId }), { 'cache-control': 'no-store' });
    }

    if (action === 'variants/stream' && req.method === 'GET') {
      return streamTopicSnapshot(req, res, {
        topic: 'bc-generate',
        filters: { projectId },
        runningLine: '[BC] Variant generation running in distributed worker...',
        doneLine: '[BC] Variant generation finished',
        errorLine: '[BC] Variant generation failed',
      });
    }
  }

  const shStreamMatch = url.pathname.match(/^\/api\/social-hub\/briefs\/(\d+)\/stream$/);
  if (shStreamMatch && req.method === 'GET') {
    const briefId = Number(shStreamMatch[1]);
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let closed = false;
    req.on('close', () => { closed = true; });

    const loop = async () => {
      while (!closed) {
        const response = await apiFetch(`/v1/social-hub/briefs/${briefId}/job-status?topic=sh-copy`, {
          cookie: req.headers.cookie ?? '',
        });
        const payload = await response.json().catch(() => ({}));
        const job = payload.job ?? null;

        if (!job) {
          send({ done: true, code: 0, variantCount: 0 });
          res.end();
          return;
        }

        const variantCount = job.result?.metrics?.variantsCreated ?? job.result?.domainResult?.variantsCreated ?? 0;
        if (job.status === 'pending' || job.status === 'running') {
          send({ line: '[SH] Copywriter running in distributed worker...', variantCount });
        } else if (job.status === 'done') {
          send({ line: '[SH] Copywriter finished', variantCount });
          send({ done: true, code: 0, variantCount });
          res.end();
          return;
        } else if (job.status === 'error') {
          send({ line: job.error ? `[SH] ${job.error}` : '[SH] Copywriter failed', variantCount });
          send({ done: true, code: 1, variantCount });
          res.end();
          return;
        } else {
          send({ done: true, code: 0, variantCount });
          res.end();
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };

    loop().catch((error) => {
      send({ line: String(error), done: true, code: 1 });
      res.end();
    });
    return;
  }

  const socialHubRouteMap = [
    [/^\/api\/social-hub\/settings$/, () => `/v1/social-hub/settings`],
    [/^\/api\/social-hub\/accounts$/, () => `/v1/social-hub/accounts`],
    [/^\/api\/social-hub\/accounts\/(\d+)$/, (m) => `/v1/social-hub/accounts/${m[1]}`],
    [/^\/api\/social-hub\/templates$/, () => `/v1/social-hub/templates`],
    [/^\/api\/social-hub\/templates\/(\d+)$/, (m) => `/v1/social-hub/templates/${m[1]}`],
    [/^\/api\/social-hub\/briefs$/, () => `/v1/social-hub/briefs`],
    [/^\/api\/social-hub\/briefs\/(\d+)$/, (m) => `/v1/social-hub/briefs/${m[1]}`],
    [/^\/api\/social-hub\/briefs\/(\d+)\/generate-copy$/, (m) => `/v1/social-hub/briefs/${m[1]}/generate-copy`],
    [/^\/api\/social-hub\/briefs\/(\d+)\/render$/, (m) => `/v1/social-hub/briefs/${m[1]}/render`],
    [/^\/api\/social-hub\/briefs\/(\d+)\/publish$/, (m) => `/v1/social-hub/briefs/${m[1]}/publish`],
    [/^\/api\/social-hub\/sources$/, () => `/v1/social-hub/sources`],
    [/^\/api\/social-hub\/analytics$/, () => `/v1/social-hub/analytics`],
    [/^\/api\/social-hub\/queue$/, () => `/v1/social-hub/queue`],
  ];

  for (const [pattern, buildTarget] of socialHubRouteMap) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    const raw = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await readBody(req) : '';
    const parsedBody = raw ? JSON.parse(raw) : {};
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? { ...parsedBody, siteSlug } : undefined;
    const targetBase = buildTarget(match);
    const passthroughQuery = url.searchParams.toString();
    const target = passthroughQuery ? `${targetBase}?${passthroughQuery}` : targetBase;
    const response = await apiFetch(target, { method: req.method ?? 'GET', body, cookie: req.headers.cookie ?? '' });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  const routeMap = [
    [/^\/api\/articles\/bulk-delete$/, () => `/v1/admin/articles/bulk-delete`],
    [/^\/api\/articles$/, () => `/v1/admin/articles?siteSlug=${siteSlug}`],
    [/^\/api\/articles\/(\d+)$/, (m) => `/v1/admin/articles/${m[1]}`],
    [/^\/api\/articles\/(\d+)\/publish$/, (m) => `/v1/admin/articles/${m[1]}/publish`],
    [/^\/api\/knowledge-base$/, () => `/v1/admin/knowledge-base?siteSlug=${siteSlug}`],
    [/^\/api\/knowledge-base\/(\d+)$/, (m) => `/v1/admin/knowledge-base/${m[1]}?siteSlug=${siteSlug}`],
    [/^\/api\/content-gaps$/, () => `/v1/admin/content-gaps?siteSlug=${siteSlug}`],
    [/^\/api\/content-gaps\/(\d+)\/acknowledge$/, (m) => `/v1/admin/content-gaps/${m[1]}/acknowledge`],
    [/^\/api\/content-gaps\/(\d+)\/archive$/, (m) => `/v1/admin/content-gaps/${m[1]}/archive`],
    [/^\/api\/generate-draft$/, () => `/v1/jobs/draft`],
    [/^\/api\/me$/, () => `/v1/auth/me`],
    [/^\/api\/admin\/dashboard$/, () => `/v1/admin/dashboard?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/articles$/, () => `/v1/admin/articles?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/articles\/(\d+)$/, (m) => `/v1/admin/articles/${m[1]}?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/articles\/(\d+)\/publish$/, (m) => `/v1/admin/articles/${m[1]}/publish`],
    [/^\/api\/admin\/knowledge-base$/, () => `/v1/admin/knowledge-base?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/knowledge-base\/(\d+)$/, (m) => `/v1/admin/knowledge-base/${m[1]}?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/content-gaps$/, () => `/v1/admin/content-gaps?siteSlug=${siteSlug}`],
    [/^\/api\/admin\/content-gaps\/(\d+)\/acknowledge$/, (m) => `/v1/admin/content-gaps/${m[1]}/acknowledge`],
    [/^\/api\/admin\/content-gaps\/(\d+)\/archive$/, (m) => `/v1/admin/content-gaps/${m[1]}/archive`],
    [/^\/api\/reddit\/targets$/, () => `/v1/admin/reddit/targets`],
    [/^\/api\/reddit\/targets\/(\d+)$/, (m) => `/v1/admin/reddit/targets/${m[1]}`],
    [/^\/api\/reddit\/runs$/, () => `/v1/admin/reddit/runs`],
    [/^\/api\/reddit\/runs\/(\d+)$/, (m) => `/v1/admin/reddit/runs/${m[1]}`],
    [/^\/api\/reddit\/gaps$/, () => `/v1/admin/reddit/gaps`],
    [/^\/api\/reddit\/gaps\/auto-filter$/, () => `/v1/admin/reddit/gaps/auto-filter`],
    [/^\/api\/reddit\/gaps\/(\d+)\/approve$/, (m) => `/v1/admin/reddit/gaps/${m[1]}/approve`],
    [/^\/api\/reddit\/gaps\/(\d+)\/reject$/, (m) => `/v1/admin/reddit/gaps/${m[1]}/reject`],
    [/^\/api\/youtube\/overview$/, () => `/v1/admin/youtube/overview`],
    [/^\/api\/youtube\/targets$/, () => `/v1/admin/youtube/targets`],
    [/^\/api\/youtube\/targets\/(\d+)$/, (m) => `/v1/admin/youtube/targets/${m[1]}`],
    [/^\/api\/youtube\/runs$/, () => `/v1/admin/youtube/runs`],
    [/^\/api\/youtube\/runs\/(\d+)$/, (m) => `/v1/admin/youtube/runs/${m[1]}`],
    [/^\/api\/youtube\/gaps$/, () => `/v1/admin/youtube/gaps`],
    [/^\/api\/youtube\/gaps\/auto-filter$/, () => `/v1/admin/youtube/gaps/auto-filter`],
    [/^\/api\/youtube\/gaps\/(\d+)\/approve$/, (m) => `/v1/admin/youtube/gaps/${m[1]}/approve`],
    [/^\/api\/youtube\/gaps\/(\d+)\/reject$/, (m) => `/v1/admin/youtube/gaps/${m[1]}/reject`],
    [/^\/api\/brand-clarity\/settings$/, () => `/v1/admin/bc/settings`],
    [/^\/api\/brand-clarity\/projects$/, () => `/v1/admin/bc/projects`],
    [/^\/api\/brand-clarity\/projects\/(\d+)$/, (m) => `/v1/admin/bc/projects/${m[1]}`],
    [/^\/api\/brand-clarity\/projects\/(\d+)\/documentation$/, (m) => `/v1/admin/bc/projects/${m[1]}/documentation`],
    [/^\/api\/brand-clarity\/(\d+)\/channels$/, (m) => `/v1/admin/bc/projects/${m[1]}/channels`],
    [/^\/api\/brand-clarity\/(\d+)\/channels\/confirm-all$/, (m) => `/v1/admin/bc/projects/${m[1]}/channels/confirm-all`],
    [/^\/api\/brand-clarity\/(\d+)\/channels\/(\d+)$/, (m) => `/v1/admin/bc/projects/${m[1]}/channels/${m[2]}`],
    [/^\/api\/brand-clarity\/(\d+)\/videos$/, (m) => `/v1/admin/bc/projects/${m[1]}/videos`],
    [/^\/api\/brand-clarity\/(\d+)\/videos\/add-manual$/, (m) => `/v1/admin/bc/projects/${m[1]}/videos/add-manual`],
    [/^\/api\/brand-clarity\/(\d+)\/videos\/(\d+)$/, (m) => `/v1/admin/bc/projects/${m[1]}/videos/${m[2]}`],
    [/^\/api\/jobs\/draft$/, () => `/v1/jobs/draft`],
    [/^\/api\/jobs\/geo$/, () => `/v1/jobs/geo`],
    [/^\/api\/jobs\/(\d+)$/, (m) => `/v1/jobs/${m[1]}`],
  ];

  if (url.pathname === '/api/generate-draft' && req.method === 'GET') {
    const [activeResponse, latestResponse] = await Promise.all([
      apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=draft`, { cookie: req.headers.cookie ?? '' }),
      apiFetch(`/v1/jobs/latest?siteSlug=${siteSlug}&topic=draft`, { cookie: req.headers.cookie ?? '' }),
    ]);
    const activePayload = await activeResponse.json().catch(() => ({}));
    const latestPayload = await latestResponse.json().catch(() => ({}));
    const job = activePayload.job ?? latestPayload.job ?? null;
    if (!job) {
      return sendJson(res, 200, { status: 'idle', gapId: null, canAbort: false, lines: [], result: null });
    }
    const payload = {
      status: job.status === 'pending' || job.status === 'cancelled' ? (job.status === 'cancelled' ? 'idle' : 'running') : job.status,
      gapId: job.payload?.gapId ?? null,
      canAbort: job.status === 'pending' || job.status === 'running',
      lines: jobLinesFromSnapshot(job),
      startedAt: job.startedAt ? Date.parse(job.startedAt) : null,
      finishedAt: job.finishedAt ? Date.parse(job.finishedAt) : null,
      result: job.result?.domainResult ?? job.result ?? null,
    };
    return sendJson(res, 200, payload);
  }

  if (url.pathname === '/api/generate-draft' && req.method === 'POST') {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
    const response = await apiFetch('/v1/jobs/draft', {
      method: 'POST',
      body: {
        siteSlug,
        gapId: parsed.gapId ?? parsed.gap_id,
        authorNotes: parsed.authorNotes ?? parsed.author_notes ?? '',
        model: parsed.model,
      },
      cookie: req.headers.cookie ?? '',
    });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  if (url.pathname === '/api/generate-draft' && req.method === 'DELETE') {
    const response = await apiFetch(`/v1/jobs/active?siteSlug=${siteSlug}&topic=draft`, { method: 'DELETE', cookie: req.headers.cookie ?? '' });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  for (const [pattern, buildTarget] of routeMap) {
    const match = url.pathname.match(pattern);
    if (!match) continue;
    const targetPath = buildTarget(match);
    const targetWithQuery = url.search
      ? `${targetPath}${targetPath.includes('?') ? '&' : '?'}${url.searchParams.toString()}`
      : targetPath;
    const raw = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await readBody(req) : '';
    const parsedBody = raw ? JSON.parse(raw) : {};
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? { ...parsedBody, siteSlug } : undefined;
    const response = await apiFetch(targetWithQuery, { method: req.method ?? 'GET', body, cookie: req.headers.cookie ?? '' });
    const payload = await response.text();
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const proxied = await proxyLegacy(req, res);
    if (proxied) return;
  }

  if (url.pathname.startsWith('/admin/')) {
    const proxied = await proxyLegacy(req, res);
    if (proxied) return;
  }

  sendHtml(res, 404, html(site, 'Not found', `${publicNav(site)}<div class="wrap"><div class="panel"><h1>Not found</h1></div></div>${footer(site)}`));
});

server.listen(port, host, () => {
  console.log(`[client-bff:${siteSlug}] listening on http://${host}:${port}`);
});
