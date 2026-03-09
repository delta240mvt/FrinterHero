# FrinterHero — AI-Driven Content Engine Implementation Plan

## Overview
Full implementation of an **AI-driven blog content creation engine** with intelligent gap analysis, author knowledge base integration, and structured approval workflows. The system builds on existing FrinterHero infrastructure (Astro SSR, PostgreSQL, Open Router AI) to create a self-sustaining content flywheel.

---

## Stage 1: Knowledge Base Infrastructure

### Purpose
Establish persistent storage and retrieval system for author's domain knowledge (projects, specifications, articles, research). This foundation enables semantic understanding of what the author has already created and informs gap analysis.

### Depends on
None

### Key Components

**Database Schema Extensions:**
- `knowledge_entries` table — Stores knowledge items with metadata
  - Entry type: project spec, published article, external research, personal note
  - Content (full text), source URL, tags, importance score
  - Created/updated timestamps
  - Embedding vector field (placeholder for semantic search — *user decision required*)

- `knowledge_sources` table — Track where knowledge comes from
  - Source type: internal article, external link, imported file, API data
  - Import timestamp, version, status (active/archived)

**Import System:**
- Batch markdown parser (reads MD files with metadata headers)
- Validation layer (checks required fields, sanitizes content)
- Deduplication logic (prevents duplicate entries)

**Search & Retrieval:**
- Full-text search on content (PostgreSQL built-in)
- Tag-based filtering
- Relevance ranking by importance score
- *(DECISION REQUIRED)* Semantic vector search: user must specify if embedding technology (e.g., pgvector) is authorized

### Success Criteria
- Knowledge entries can be created, retrieved, and filtered via REST API
- Full-text search returns relevant results
- No duplicate entries in database
- Import system validates and logs all imported content
- Schema supports future semantic search without breaking changes

---

## Stage 2: Daily AI Gap Analysis Loop

### Purpose
Establish automated, recurring process that identifies content visibility gaps by querying multiple AI models about author's industry/niche and comparing results against existing knowledge base. Feeds discovered gaps into the content creation pipeline.

### Depends on
Stage 1 (Knowledge Base must exist to compare AI responses against)

### Key Components

**Enhanced GEO Monitor (`scripts/geo-monitor.ts`):**
- Daily CRON trigger (configurable time, e.g., 7 AM)
- Load niche queries from `scripts/queries.json` (expand with author-specific topics)
- For each query:
  - Call all 4 models via Open Router
  - Capture AI response text
  - Extract key concepts and entities
  - Compare against knowledge base (full-text search for mentions)

**Gap Detection Engine (`scripts/gap-analysis.ts`):**
- Semantic comparison: AI mentioned topic X but knowledge base has no content on X → gap detected
- Confidence scoring (how important is this gap?)
- Duplicate detection (don't report same gap twice in same run)
- Store results in new `content_gaps` table

**Content Gaps Table:**
- `id`, `gap_title`, `gap_description`, `confidence_score` (0-100)
- `related_queries` (array of queries that revealed this gap)
- `suggested_angle` (brief outline for article)
- `status` (new, acknowledged, archived)
- `created_at`, `acknowledged_at` (when author reviews)

**Cron Integration:**
- Add npm script: `geo:daily` (runs gap analysis loop)
- Document deployment setup (Railway cron jobs, local cron, or scheduled function)

### Success Criteria
- Gap analysis runs without errors and produces 5-10 gaps per run
- Each gap is actionable (has title, description, suggested angle)
- Duplicate gaps not reported across multiple runs
- Historical gap data persists for trend analysis
- CRON execution logs stored for debugging

---

## Stage 3: Admin Dashboard — Content Gaps & Curation

### Purpose
Surface discovered gaps to author in interactive admin dashboard, allow author to add personal context/requirements, and approve topics for article generation.

### Depends on
Stage 2 (Content Gaps must exist to display)

### Key Components

**New Dashboard Section: "Content Gaps & Ideas"**
- Tab/section in `/admin` showing:
  - **Top 5 Gaps** from most recent run with:
    - Gap title + description
    - Confidence score (visual bar)
    - Suggested angle / outline
    - Related queries that revealed it
  - **Filter controls:** By confidence, by date, by source model
  - **Sort options:** By confidence, by date, by relevance to existing content

**Interactive Gap Curation Form:**
- For each gap, expandable card with:
  - **Gap summary** (title, why it matters)
  - **Text field:** "Your additional notes/requirements" — author can add:
    - "Focus on founders, not enterprises"
    - "Mention our FrinterFlow integration"
    - "Use personal examples from..."
  - **Knowledge base hints:** UI shows 2-3 relevant existing articles/projects from KB
  - **Model selection:** Author can choose which AI models to use for draft generation
- **Action buttons:**
  - "Approve & Generate Draft" → locks gap, proceeds to Stage 4
  - "Archive This Gap" → status: archived, removed from queue
  - "Snooze" (14 days) → temporarily hide

**Gaps Stats Widget:**
- Recent run timestamp
- Total gaps in last run
- Gaps acknowledged
- Gaps archived
- Upcoming run countdown

### Success Criteria
- Dashboard loads gap data within 2 seconds
- Author can curate 5 gaps in < 5 minutes
- Selected gaps + author notes flow to draft generation
- Dashboard reflects gap status changes in real-time
- Mobile-responsive UI for quick reviews

---

## Stage 4: AI-Powered Draft Generation

### Purpose
Transform curated gap + author requirements + knowledge base context into high-quality article draft that aligns with author's identity and voice. Leverage existing Open Router integration with enhanced prompting.

### Depends on
Stage 1 (Knowledge Base needed for context), Stage 3 (Author-curated gap + notes required)

### Key Components

**Advanced Prompt Engineering (`scripts/draft-generator.ts` — new):**
- **Mega-prompt architecture:**
  1. System prompt: Author's IDENTITY (tone, values, 3-sphere philosophy from llms-full.txt)
  2. Gap context: Title, description, suggested angle, author's custom notes
  3. Knowledge base context: 3-5 most relevant KB entries (by semantic/text similarity)
  4. Output format specification: JSON with title, description, markdown content, tags
  5. SEO/GEO optimization hints: Keywords, natural mention placement
  6. Brand voice guardrails: Examples of how to reference frinter.app, FrinterFlow, personal brand

**Draft Generation Workflow:**
- Author clicks "Approve & Generate Draft" → trigger `/api/generate-draft` (POST)
- API handler:
  - Loads gap details, author notes, curated KB excerpts
  - Calls `draft-generator.ts` which constructs mega-prompt
  - Selects model (default: Claude Sonnet for long-form, user's choice)
  - Calls Open Router API
  - Parses JSON response, validates structure
  - Converts markdown to HTML (existing `parseMarkdown()` utility)
  - Calculates reading time
  - Generates SEO-friendly slug from title

**Draft Table Record Creation:**
- Insert into existing `articles` table with:
  - `status: 'draft'`
  - `source_gap_id` (new field, FK to content_gaps)
  - `generated_by_model` (which AI model created it)
  - `generation_timestamp`
  - All content fields populated from AI response

**Quality Assurance:**
- Response validation (title, description, content all present)
- Length check (article between 800-2500 words, configurable)
- Tone check (optional): scan for brand voice alignment
- Error logging: if generation fails, log reason and allow manual retry

### Success Criteria
- Generated drafts follow author's identity and tone
- Drafts include natural references to author's projects/products
- No hallucinated facts (all claims backed by KB or gap context)
- Markdown → HTML conversion preserves formatting
- Draft creation succeeds 95%+ of attempts
- Generation takes < 60 seconds per article

---

## Stage 5: Review, Edit & Publication Workflow

### Purpose
Enable author to review AI-generated drafts, make edits, and publish with full visibility into generation source. Maintain approval history for transparency.

### Depends on
Stage 4 (Drafts must exist before review)

### Key Components

**Enhanced Draft Editor (`/admin/article/[id]`):**
- Existing edit form + new features:
  - **Generation metadata banner:** Shows:
    - "Generated from gap: {gap title}"
    - "Model used: Claude Sonnet"
    - "Generated: {timestamp}"
    - "Based on KB entries: {3 top sources}"
  - **Suggested edits panel** (optional):
    - AI-generated editing suggestions (tone, clarity, SEO)
    - Author can accept/dismiss each
  - **Preview panel:** Live markdown preview as author edits
  - **Tone checker:** Optional badge showing alignment with IDENTITY
  - **Tag suggestions:** AI suggests 5-7 tags based on content
  - **Featured checkbox:** Author decides if article should be featured

**Publication Workflow:**
- **Status states:**
  - `draft` → Author in edit mode
  - `ready-for-review` → Author marks ready (optional step for multi-author setup)
  - `published` → Live on blog, in RSS, searchable
  - `archived` → Hidden from public blog
- **Publish action:**
  - Update `status: 'published'`, set `publishedAt` timestamp
  - Auto-trigger: Invalidate RSS/sitemap caches
  - Send Discord notification (if enabled): "New article published: {title}"
  - Update gap status to `acknowledged` (flag that this gap was addressed)

**Publication History & Audit Trail:**
- New `article_generations` table:
  - Link article to source gap
  - Track which models were queried
  - Store original vs final content (for transparency)
  - Author's custom notes that influenced the draft
  - Publication timestamp
- Admin can view full lineage: gap → draft → published article

**Bulk Actions (Optional Enhancement):**
- Author can approve multiple gaps at once
- Batch generation of 5 drafts simultaneously
- Requires monitoring of API rate limits

### Success Criteria
- Author can edit and publish draft in < 10 minutes
- Generation source fully transparent (gap → draft lineage visible)
- Published articles correctly reflected in RSS/sitemap within 60 seconds
- Audit trail complete for all articles
- No data loss if author closes browser mid-edit (autosave existing feature)

---

## Integration Points & Architecture

### API Endpoints (New & Modified)

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/knowledge-base` | List KB entries (search, filter) | No |
| POST | `/api/knowledge-base` | Import/create KB entry | Yes |
| GET | `/api/knowledge-base/[id]` | Retrieve KB entry | No |
| GET | `/api/content-gaps` | List recent gaps | No |
| POST | `/api/content-gaps/[id]/acknowledge` | Mark gap as reviewed | Yes |
| POST | `/api/content-gaps/[id]/archive` | Archive gap | Yes |
| POST | `/api/generate-draft` | Trigger draft generation from gap | Yes |
| PUT | `/api/articles/[id]` | Edit draft (existing, enhanced) | Yes |
| POST | `/api/articles/[id]/publish` | Publish draft | Yes |
| GET | `/api/article-generations` | View generation history | Yes |

### Database Schema Summary

**New Tables:**
- `knowledge_entries` — Author's knowledge base
- `knowledge_sources` — Track where KB entries come from
- `content_gaps` — Identified gaps from AI analysis
- `article_generations` — Audit trail linking articles to gaps

**Modified Tables:**
- `articles` — Add `source_gap_id`, `generated_by_model`, `generation_timestamp`
- `geoRuns` — Optionally track which gaps were identified per run

### Existing Code Preservation
- **Keep:** `src/pages/blog/`, RSS generation, sitemap, existing CRUD endpoints
- **Extend:** `scripts/geo-monitor.ts` → split into `geo-monitor.ts` (queries) + `gap-analysis.ts` (comparison)
- **Keep:** `src/utils/markdown.ts`, auth system, session management
- **Enhance:** Admin dashboard with new sections (don't remove existing features)

---

## Technology & Architecture Decisions

### Authorized Technologies (From Research)
- ✅ PostgreSQL + Drizzle ORM (existing)
- ✅ Open Router API + 4 models (existing)
- ✅ Astro SSR (existing)
- ✅ Tailwind CSS (existing)
- ✅ Node.js / Railway (existing)

### Decisions Requiring User Input

1. **Semantic Search / Vector Embeddings**
   - *Question:* Should author enable vector embeddings (pgvector) for semantic search in Knowledge Base?
   - *Impact:* Enables smarter gap detection + better KB retrieval, but adds complexity + minimal cost
   - *Recommendation:* Start with full-text search (Stage 1), add embeddings in future iteration if needed

2. **Bulk Draft Generation & Queuing**
   - *Question:* Should system support batch generation (5+ drafts per trigger) with job queue?
   - *Impact:* Faster content creation but requires monitoring & rate-limiting
   - *Recommendation:* Start with single-draft generation, scale if gap list grows

3. **Knowledge Base Source Formats**
   - *Question:* What formats should import system support? (Markdown, PDF, JSON, Web URLs)
   - *Impact:* More formats = more flexibility but more parsing code
   - *Recommendation:* Start with Markdown + manually-entered entries, add web import if needed

4. **AI Model Selection Per Gap**
   - *Question:* Should author choose AI model per gap, or use smart routing?
   - *Impact:* Granular control vs simplified UX
   - *Recommendation:* Default to Claude Sonnet (best for long-form), allow override

---

## Success Criteria (Overall System)

✅ **Knowledge Base:** Author can import 20+ KB entries and search by full-text + tags  
✅ **Gap Analysis:** System identifies 5-10 content gaps daily with 80%+ relevance  
✅ **Curation:** Author can review + curate 5 gaps in < 5 minutes via dashboard  
✅ **Draft Generation:** AI generates 1 article per gap in < 60 seconds, aligned with author's voice  
✅ **Publication:** Author publishes 1-2 articles per week with full transparency into generation source  
✅ **Content Flywheel:** System becomes self-sustaining (gaps → drafts → published articles → expanded KB)

---

## Deployment Notes

- All stages run on existing Railway infrastructure (no new services required)
- CRON job for daily gap analysis must be configured in Railway or via external service
- Database migrations auto-generated by Drizzle Kit
- npm scripts: `geo:daily`, `kb:import`, `draft:generate` (all optional, callable manually)
- Environment variables: Only `DATABASE_URL`, `OPENROUTER_API_KEY`, `ADMIN_PASSWORD_HASH` required (no new keys)

---

## Next Steps for Implementation

1. **Tasks agent** will receive this plan and create granular, executable tasks for each stage
2. **Coding agents** (Claude Code, Cursor) will implement stages in dependency order
3. **Parallelization:** Stages 1-2 can be built independently; Stage 3+ are sequential
4. **User review points:** After each stage completion, author reviews + decides on optional enhancements
