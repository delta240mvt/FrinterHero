# Apify Reddit Scraper — Query Structure

Actor used: `trudax/reddit-scraper-lite`
Script: `scripts/reddit-scraper.ts` → `buildApifyInput()`

---

## Key Constraint: Reddit 403 on `.json` Endpoints

Reddit blocks requests to its JSON API endpoints (`.json` suffix) from Apify's IP ranges:

```
GET https://www.reddit.com/search/.json?q=...          → 403 Forbidden
GET https://www.reddit.com/r/productivity/top/.json    → 403 Forbidden
GET https://www.reddit.com/r/post-id/comments/.json    → 403 Forbidden (for individual posts)
```

The actor handles this gracefully for HTML listing pages: it gets 403 on `.json`, then falls back to visiting the HTML page and parsing post links from the DOM. Individual post `.json` fetches also get 403 but the actor can extract post content from the listing page HTML directly.

**What does NOT work:**
- `searches: ['keyword']` parameter → actor always hits `search/.json` → 403, no fallback
- `startUrls` pointing to a global search page (`reddit.com/search/?q=...`) → actor visits the HTML but extracts off-topic posts from sidebar/trending sections instead of actual search results
- Any URL with `?t=year` on subreddit listings → actor hits `.json?t=year` → 403

---

## Target Type 1: Subreddit

**Input:**
```json
{
  "startUrls": [{ "url": "https://www.reddit.com/r/productivity/hot" }],
  "maxItems": 3,
  "maxPostCount": 3,
  "maxComments": 5
}
```

**Rules:**
- Use `/hot` — no query parameters. Adding `?t=year` or `/top/` causes the actor to hit `.json` endpoints that return 403.
- The actor visits the HTML listing page, extracts post links, then visits each post page.
- Individual post `.json` fetches may get 403; the actor falls back to HTML post pages.
- `maxItems` / `maxPostCount` controls how many posts are returned (default: env `REDDIT_MAX_ITEMS_PER_TARGET`, fallback `3`).
- `maxComments: 5` — top 5 comments per post.

**Why it works:** `/r/name/hot` is a standard subreddit listing page. The actor's DOM parser is designed for this exact structure.

---

## Target Type 2: Keyword Search

**Input:**
```json
{
  "startUrls": [{
    "url": "https://www.reddit.com/r/productivity+Entrepreneur+selfimprovement+getdisciplined+DecidingToBeBetter+digitalminimalism+deepwork+meditation+nosurf+ADHD_Programmers+cogsci+neuroscience/search/?q=focus+productivity+system&sort=new&restrict_sr=1&t=month"
  }],
  "maxItems": 3,
  "maxPostCount": 3,
  "maxComments": 5
}
```

**Rules:**
- Use `startUrls` with a **subreddit-restricted search URL**, not the `searches` parameter.
- `restrict_sr=1` — limits results to the listed subreddits only. This makes the results page use the same HTML structure as a subreddit listing page, which the actor parses correctly.
- `sort=new` — newest posts first.
- `t=month` — posts from the last month (note: `t=year` with subreddit search triggers `.json` 403).
- The subreddit list (`NICHE_SUBREDDITS`) is hardcoded to Frinter's niche.
- The keyword (`q=`) is URL-encoded from `target.value`.

**Why it works:** `/r/[subreddits]/search/?restrict_sr=1` renders the same HTML structure as a subreddit hot/new listing. The actor's DOM parser handles it correctly. Without `restrict_sr=1`, the global search page has a different HTML structure that causes the actor to pick up irrelevant posts.

---

## Niche Subreddits (Keyword Search Scope)

Defined in `NICHE_SUBREDDITS` constant — joined with `+`:

| Subreddit | Relevance |
|---|---|
| `productivity` | Core — focus systems, time management |
| `Entrepreneur` | High performers, founders, work-life tension |
| `selfimprovement` | Habits, discipline, burnout |
| `getdisciplined` | Focus, motivation, consistency |
| `DecidingToBeBetter` | Behavioural change, life design |
| `digitalminimalism` | Deep work, screen time, attention |
| `deepwork` | Direct niche match — Cal Newport-style focus |
| `meditation` | Recovery, inner balance (Frinter's I-sphere) |
| `nosurf` | Distraction, attention economy |
| `ADHD_Programmers` | Focus disorders, productivity hacks |
| `cogsci` | Cognitive science, brain performance |
| `neuroscience` | Sleep, recovery, brain optimization |

To add more subreddits: edit the `NICHE_SUBREDDITS` array in `scripts/reddit-scraper.ts`.

---

## Post-Fetch Date Filter

Regardless of the `t=month` URL parameter, the scraper applies a server-side date filter after receiving items from Apify:

```typescript
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
// Items older than 1 year are discarded
```

This acts as a safety net to ensure no stale content reaches the LLM analysis pipeline.

---

## Field Name Mapping (Apify → DB)

The Apify actor returns different field names than Reddit's native API. The normalization happens in the scraping loop before LLM analysis:

| Apify field | Reddit API field | DB / normalized field |
|---|---|---|
| `item.text` | `item.selftext` | `body` |
| `item.score` | `item.score` | `upvotes` |
| `item.commentCount` | `item.num_comments` | `commentCount` |
| `item.createdAt` (ISO) | `item.created_utc` (Unix) | `postedAt` |
| `item.comments[].body` | — | `topComments[]` |

`mapToDbPost()` in `scripts/reddit-scraper.ts` handles the full mapping for DB insertion.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDDIT_MAX_ITEMS_PER_TARGET` | `3` | Max posts fetched per target |
| `REDDIT_CHUNK_SIZE` | `10` | Posts per LLM analysis batch |
| `REDDIT_ANALYSIS_MODEL` | `anthropic/claude-sonnet-4-6` | OpenRouter model for pain point extraction |
| `APIFY_API_TOKEN` | required | Apify platform token |
