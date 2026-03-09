# Task Management: FrinterHero AI-Driven Content Engine

## Instructions for AI Coding Agents

When working on these tasks:

1. **Check dependencies**: Review "Depends on:" for each stage — only start a stage when all dependencies are complete
2. **Parallel execution**: Stages with no shared dependencies can be worked on simultaneously by separate agents
3. **Mark completion**: Replace `[ ]` with `[X]` when you finish each task
4. **No modifications**: Do not modify other content in this file unless explicitly instructed by the user
5. **Test acceptance criteria**: Each task has explicit success criteria — validate before marking complete

**How to interpret "file path"**: 
- `src/pages/api/knowledge-base.ts` = create new file in src/pages/api/ directory
- `src/db/schema.ts` = modify existing file
- `scripts/gap-analysis.ts` = create new file in scripts/ directory

---

## Stage 1: Knowledge Base Infrastructure

Depends on: None

**Database Schema & Migrations**

- [X] In `src/db/schema.ts`, add `knowledge_sources` table definition with columns: id (PK), source_type (varchar), source_name (varchar), source_url (varchar, optional), import_timestamp (timestamp), status (varchar), version (int). Add indexes on status and source_type.
  - Acceptance: Table defined with proper types matching `contracts/knowledge_base_models.ts`, Drizzle migration auto-generated

- [X] In `src/db/schema.ts`, add `knowledge_entries` table definition with columns: id (PK), type (varchar enum), title (varchar), content (text), source_url (varchar, optional), tags (text array), importance_score (int 0-100), created_at (timestamp), updated_at (timestamp), source_id (FK to knowledge_sources). Add GIN index on tags, composite index on (type, importance_score), and full-text search index on content.
  - Acceptance: Table supports array tags with GIN index, full-text search index created, constraint importance_score 0-100 enforced, source_id FK relationship validated

- [X] Run `drizzle-kit generate` to create database migration files in `drizzle/migrations/` folder from schema changes. Verify migration naming convention (`timestamp_description.sql`).
  - Acceptance: Migration files generated, no syntax errors in SQL, rollback capability verified

- [X] In `src/db/schema.ts`, modify `articles` table to add three new optional columns: source_gap_id (int, nullable FK), generated_by_model (varchar, nullable), generation_timestamp (timestamp, nullable). Ensure backward compatibility with existing articles.
  - Acceptance: New columns nullable, existing data unaffected, FK constraint added for source_gap_id

**Knowledge Base API Endpoints**

- [X] In `src/pages/api/knowledge-base.ts` (new file), implement `GET /api/knowledge-base` endpoint. Parse query params (search, tags, type, sort_by, limit, offset). Execute full-text search on `knowledge_entries.content` using PostgreSQL tsvector. Filter by tags (AND logic) and type. Return paginated results matching spec schema from api_contracts.json.
  - Acceptance: Full-text search returns relevant results in <500ms, pagination works, tags filter uses AND logic, response matches OpenAPI schema

- [X] In `src/pages/api/knowledge-base.ts`, implement `POST /api/knowledge-base` endpoint. Validate request body: type enum, title non-empty, content min 50 chars, tags lowercase alphanumeric+hyphens, importance_score 0-100, source_url valid URL format (if provided). Check for duplicate entries by title+source_id. Insert into knowledge_entries and knowledge_sources tables. Return 201 Created with generated record.
  - Acceptance: Validation returns 400 with field-specific errors, duplicates rejected with 409, record created and returned

- [X] In `src/pages/api/knowledge-base/[id].ts` (new file), implement `GET /api/knowledge-base/[id]` endpoint. Retrieve single knowledge entry by id. Return 404 if not found.
  - Acceptance: Returns complete KnowledgeEntry object, 404 on missing id, response matches OpenAPI schema

**Knowledge Base Import System**

- [X] In `src/utils/kb-importer.ts` (new file), implement markdown batch importer. Accept array of markdown files with YAML frontmatter (type, title, tags, importance_score, source_url). Parse frontmatter, extract content. Validate each entry (required fields, content length). Return array of validated KnowledgeEntry objects with errors for invalid entries.
  - Acceptance: Parses YAML frontmatter correctly, validates all required fields, returns detailed error messages for invalid entries, handles empty content gracefully

- [X] In `src/pages/api/kb-import.ts` (new file), implement `POST /api/kb-import` endpoint. Accept multipart form data with markdown files. Call kb-importer utility. Insert valid entries into knowledge_base. Return import summary: total files, successful, failed, with error details for failed entries.
  - Acceptance: Accepts multipart/form-data with .md files, returns import summary with success/failure counts, creates knowledge_sources record for batch import

**Knowledge Base Admin UI**

- [X] In `src/pages/admin/knowledge-base/index.astro` (new file), create admin page for KB management. Display table of KB entries with columns: title, type, importance_score, tags, created_at. Implement search form (search term, type filter, tag filter, sort options). Show pagination controls. Add "Import" and "Create New Entry" buttons.
  - Acceptance: Page loads in <2 seconds, filters/search work client-side or via GET params, pagination navigates correctly, buttons link to appropriate forms

- [X] In `src/pages/admin/knowledge-base/create.astro` (new file), create form page for adding single KB entry. Fields: type (select), title (text), content (textarea), source_url (text, optional), tags (comma-separated or tag input), importance_score (slider 0-100). Submit creates entry via POST /api/knowledge-base. Show success/error message.
  - Acceptance: Form validates client-side, submits to API endpoint, displays validation errors, redirects to KB list on success

- [X] In `src/pages/admin/knowledge-base/import.astro` (new file), create file upload page for batch import. Allow user to select multiple .md files. Show preview of entries to be imported (display parsed title, type, importance_score from each file). Submit button triggers POST /api/kb-import. Display import summary (success/failed counts) after upload.
  - Acceptance: File input accepts .md files, preview shows at least title and type for each file, submission returns import summary with error details

---

## Stage 2: Daily AI Gap Analysis Loop

Depends on: Stage 1

**Gap Detection Infrastructure**

- [X] In `src/db/schema.ts`, add `content_gaps` table definition with columns: id (PK), gap_title (varchar), gap_description (text), confidence_score (int 0-100), suggested_angle (text), related_queries (text array), source_models (text array), author_notes (text, optional), status (varchar enum: new/acknowledged/archived/in_progress), created_at (timestamp), acknowledged_at (timestamp, optional), geo_run_id (FK to geoRuns). Add indexes on status, confidence_score, created_at.
  - Acceptance: Table structure matches content_gaps_models.ts, constraints and enums enforced, indexes created for filtering/sorting

- [X] In `src/db/schema.ts`, modify `geoRuns` table to add two new columns: gaps_found (int, default 0), gaps_deduped (int, default 0).
  - Acceptance: Columns added, backward compatible, defaults applied

- [X] Run `drizzle-kit generate` to create migration for content_gaps table and geoRuns modifications.
  - Acceptance: Migration files generated, SQL syntax valid

**Gap Detection Engine**

- [X] In `scripts/gap-analysis.ts` (new file), implement gap detection logic. Accept array of GEO queries and AI responses. For each response: extract key topics/entities. Compare against knowledge_base using full-text search. Detect gaps: topics mentioned by AI but no corresponding KB entry (or minimal relevance). Score confidence 0-100 based on: KB coverage, AI model consensus (multiple models mentioning same topic = higher score), topic relevance to niche keywords.
  - Acceptance: Function returns array of ContentGap objects with titles, descriptions, scores, related_queries, source_models populated; scoring logic is traceable (score > 0 only if real gap detected)

- [X] In `scripts/gap-analysis.ts`, implement duplicate detection. Accept list of detected gaps + previous gaps from last 14 days. Compare gap titles (fuzzy match or semantic similarity). Mark duplicates with duplicate_gap_id. Filter duplicates from final output.
  - Acceptance: Duplicate detection prevents same gap from being reported in consecutive runs, fuzzy matching tolerates minor wording differences

- [X] In `scripts/gap-analysis.ts`, implement function to generate suggested_angle for each gap. Accept gap title, description, related_queries. Construct brief actionable outline (2-3 sentences) pointing to article direction. Ensure angle is specific to author's niche (not generic).
  - Acceptance: Every gap has non-empty suggested_angle, angles are specific (not "write about X" but "explain X for founders managing...")

**Enhanced GEO Monitor Integration**

- [X] In `scripts/geo-monitor.ts` (existing, modify), refactor to separate query execution from gap detection. Keep existing query logic (load scripts/queries.json, call Open Router for 4 models, store responses). After response collection, call new `gap-analysis.ts` functions. Store detected gaps in `content_gaps` table. Update `geoRuns` with gaps_found and gaps_deduped counts.
  - Acceptance: geo-monitor.ts successfully calls gap-analysis.ts, results stored in content_gaps table, geoRuns record updated with metrics

- [X] In `scripts/queries.json`, verify file contains niche-specific queries (both English and Polish) for author's domain. Add 5-10 new queries if list is sparse. Each query should target potential content gaps (questions about topics author might not have addressed).
  - Acceptance: queries.json has at least 25 queries, mix of English/Polish, relevant to author's niche and expertise areas

**CRON Job Setup**

- [X] In `package.json`, add npm script `"geo:daily": "node --loader tsx ./scripts/geo-monitor.ts"` for manual execution. Add npm script `"gap:analyze": "node --loader tsx ./scripts/gap-analysis.ts"` for testing.
  - Acceptance: Scripts defined, executable via npm run, can be triggered manually for testing

- [X] In project root, create `cron-config.ts` (or document in README) for Railway CRON setup. Configure daily trigger at 7 AM UTC+1 (configurable). Map trigger to call `/api/geo:run` endpoint (which executes geo-monitor.ts and gap-analysis.ts server-side).
  - Acceptance: CRON config documented for Railway deployment, trigger time configurable, endpoint specified

- [X] In `src/pages/api/geo/run.ts` (new file), implement `POST /api/geo/run` endpoint. Execute geo-monitor.ts and gap-analysis.ts. Return status: { success: bool, gaps_found: int, gaps_deduped: int, error?: string }. Log execution (start time, end time, error if any).
  - Acceptance: Endpoint executes gap analysis pipeline, returns structured result, logs errors for debugging, can be called manually or by CRON

---

## Stage 3: Admin Dashboard — Content Gaps & Curation

Depends on: Stage 2

**Gap Display Components**

- [X] In `src/components/admin/GapCard.astro` (new file), create reusable gap card component. Display: gap_title, gap_description (truncated), confidence_score (visual bar 0-100), suggested_angle, related_queries (comma-separated), source_models. Props: gap object, onExpand callback, onApprove callback, onArchive callback. Include action buttons: "Expand", "Approve & Generate", "Archive".
  - Acceptance: Card renders all gap properties, confidence bar visual, action buttons clickable with callbacks, responsive design

- [X] In `src/components/admin/GapExpandedCard.astro` (new file), create expanded gap card component. Show: full gap details, knowledge base hints (2-3 most relevant KB entries with importance_score), author notes text field, AI model selector (multi-select: Claude, OpenAI, Perplexity, Gemini). Action buttons: "Approve & Generate Draft", "Archive", "Snooze (14 days)". Props: gap object, kbHints array, callbacks for each action.
  - Acceptance: Expanded card shows all fields, KB hints fetched and displayed with relevance, text field editable, model selector works, buttons trigger callbacks

- [X] In `src/pages/admin/content-gaps/index.astro` (new file), create dashboard page for gap curation. Display: stats widget (last run time, gaps found, acknowledged, archived, next run countdown), filter/sort controls (confidence range slider, date range, source model multi-select, status filter), gap feed (show top 5 gaps as GapCard components). Implement client-side filtering (or fetch filtered results via GET params). Load data from GET /api/content-gaps.
  - Acceptance: Page loads dashboard stats within 2 seconds, filters update gap feed without full page reload, gaps sorted by confidence descending by default, mobile-responsive

**Gap Curation Workflow**

- [X] In `src/pages/api/content-gaps.ts` (new file), implement `GET /api/content-gaps` endpoint. Parse query params: status, confidence_min/max, sort_by, limit, offset. Query content_gaps table with filters. For each gap returned, fetch 2-3 most relevant KB entries using full-text search. Return gaps with knowledge_base_hints embedded in response, plus recent_run stats and dashboard stats. Response matches ListContentGapsResponse schema.
  - Acceptance: Endpoint returns paginated gaps with KB hints, stats widget data included, filters/sort applied correctly, <2 second response time

- [X] In `src/pages/api/content-gaps/[id]/acknowledge.ts` (new file), implement `POST /api/content-gaps/[id]/acknowledge` endpoint. Validate request: author_notes, selected_models, action (generate_draft/snooze/archive). If action=generate_draft: update gap status to in_progress, store author_notes. Call POST /api/generate-draft with gap details. Return AcknowledgeGapResponse. If action=snooze: mark gap as snoozed with 14-day hide window. If action=archive: mark status=archived.
  - Acceptance: Endpoint updates gap status correctly, author_notes stored, model selection captured, generate_draft triggers draft generation (see Stage 4)

- [X] In `src/pages/api/content-gaps/[id]/archive.ts` (new file), implement `POST /api/content-gaps/[id]/archive` endpoint. Validate request: reason (optional). Update gap status to archived. Return archived_at timestamp.
  - Acceptance: Gap marked as archived, can be re-queried with status=archived filter, returns 200 with confirmation

**Dashboard Stats & Real-Time Updates**

- [X] In `src/components/admin/GapStatsWidget.astro` (new file), create stats display component. Props: last_run_timestamp, total_gaps_in_run, gaps_acknowledged, gaps_archived, next_run_countdown_minutes. Display in card format with clear typography. Show countdown as "Next run in X hours Y minutes".
  - Acceptance: Component displays all stats, countdown auto-updates every 60 seconds (client-side JS), formatting readable

- [X] In `src/pages/admin/content-gaps/index.astro`, add client-side polling to refresh gap feed every 30 seconds (fetch GET /api/content-gaps with current filters). Update GapCard components and stats widget in place without full page reload.
  - Acceptance: Polling request succeeds every 30 seconds, DOM updates reflect new gaps/status changes, no full page flash

---

## Stage 4: AI-Powered Draft Generation

Depends on: Stage 1, Stage 3

**Draft Generation Engine & Mega-Prompt**

- [X] In `scripts/draft-generator.ts` (new file), implement mega-prompt constructor function. Accept: gap details (title, description, suggested_angle, author_notes), KB context (3-5 most relevant entries), author identity data. Construct mega-prompt with sections: (1) system identity prompt (from llms-full.txt content: tone, philosophy, 3-sphere colors, brand values), (2) gap context (custom author notes included), (3) KB context (excerpt from each entry with importance_score), (4) output format spec (JSON schema with title, description, content, tags, mentions), (5) SEO guidelines (keyword density, structure), (6) brand voice guardrails (examples of natural product mentions: frinter.app, FrinterFlow). Return complete prompt string.
  - Acceptance: Prompt includes all 6 sections, author identity (tone, philosophy) from llms-full.txt content integrated, author_notes embedded in section 2, KB entries truncated to ~500 chars each with importance scores shown, output format unambiguous JSON spec

- [X] In `scripts/draft-generator.ts`, implement draft generation function. Accept: GenerateDraftRequest (gap_id, author_notes, model). Load gap from database. Fetch top 5 KB entries using full-text similarity search. Load author identity from llms-full.txt. Call mega-prompt constructor. Call Open Router API with selected model. Parse JSON response (title, description, content markdown, tags, mentions). Validate response (all required fields present, content 800-2500 words). Convert markdown to HTML using existing parseMarkdown() utility. Calculate reading time (estimate 200 words/min). Generate URL-friendly slug from title. Return DraftAIResponse object.
  - Acceptance: Function executes end-to-end without errors, JSON parsing succeeds, markdown→HTML conversion preserves formatting (headers, lists, code blocks), slug is valid URL format, reading time reasonable

- [X] In `scripts/draft-generator.ts`, implement error handling. On API call failure: log error with context (gap_id, model, error details). Return error object with code (INVALID_GAP, API_ERROR, VALIDATION_FAILED, TIMEOUT) and retry_allowed flag. On validation failure: return specific field errors (title missing, content too short, etc.).
  - Acceptance: All error paths caught and logged, error codes match DraftGenerationError spec, retry_allowed flag accurate

**Draft Generation API Endpoint**

- [X] In `src/pages/api/generate-draft.ts` (new file), implement `POST /api/generate-draft` endpoint. Validate request: gap_id exists and status=in_progress, author_notes provided, model valid (one of: anthropic/claude-sonnet-4-6, openai/gpt-4, perplexity/llm, gemini-2.0-pro). Call draft-generator.ts function. On success: insert article record into `articles` table with: status=draft, source_gap_id, generated_by_model, generation_timestamp, all content fields populated. Insert audit record into `article_generations` table (new, see Stage 5). Return GenerateDraftResponse with article_id, article content, kb_entries_used IDs. On error (422): return error details with retry_allowed flag, do not create article record.
  - Acceptance: Draft created in articles table with correct status and metadata, article_generations record created, kb_entries_used populated with IDs of KB entries used in mega-prompt, response includes article_id for redirect to editor

- [X] In `src/pages/api/generate-draft.ts`, implement async job queueing (optional, for long generations >30s). For sync: return 201 immediately. For async: return 202 Accepted with job_id, store job metadata in memory or database, return job status endpoint URL.
  - Acceptance: Sync generations < 60 seconds return 201, async handling (if implemented) returns 202 with polling URL

**Draft Quality Validation**

- [X] In `scripts/draft-validator.ts` (new file), implement draft validation function. Accept: DraftAIResponse. Check: title non-empty and <150 chars, description 100-160 chars (SEO), content markdown present and 800-2500 words, tags array has 5-7 items, mentions array populated for brand products. Return validation object: { isValid: bool, errors: string[], metrics: { wordCount, tone_alignment_score, brand_mention_count } }.
  - Acceptance: Validation catches all invalid states, error messages actionable, wordCount accurate, tone alignment score 0-100 based on keyword scan for author identity phrases

- [X] In `scripts/draft-generator.ts`, integrate draft-validator.ts. After response parse and before article creation, run validation. If invalid: log validation errors, return 422 with details. If valid: proceed to article creation.
  - Acceptance: Invalid drafts not inserted into database, error details returned to user with field-specific feedback

---

## Stage 5: Review, Edit & Publication Workflow

Depends on: Stage 4

**Article Generation Audit Trail**

- [X] In `src/db/schema.ts`, add `article_generations` table definition with columns: id (PK), article_id (int FK to articles), gap_id (int FK to content_gaps), generated_by_model (varchar), generation_prompt (text), original_content (text), final_content (text, optional), author_notes (text), kb_entries_used (int array), models_queried (text array), generation_timestamp (timestamp), publication_timestamp (timestamp, optional), content_changed (bool default false). Mark table as immutable (document in code comment).
  - Acceptance: Table structure matches ArticleGeneration interface, FK relationships established, immutability documented in schema

- [X] Run `drizzle-kit generate` to create migration for article_generations table.
  - Acceptance: Migration generated, SQL valid

- [X] In `src/pages/api/generate-draft.ts`, after draft creation, insert record into `article_generations` table with: article_id, gap_id, generated_by_model, generation_prompt (full mega-prompt text), original_content (AI response markdown), author_notes, kb_entries_used (array of IDs), models_queried (array). Set generation_timestamp = NOW().
  - Acceptance: Record created immediately after article insertion, all fields populated from generation context

**Enhanced Article Editor**

- [X] In `src/pages/admin/article/[id].astro` (modify existing file), add generation metadata banner at top. If article.source_gap_id exists: display "🎯 Generated from Gap" card showing gap title (with link to gap in dashboard), generated_by_model, generation_timestamp, top 3 KB entries that informed draft (title, importance_score, link to KB entry). If article has no source_gap_id: show "✏️ Author-Created" banner.
  - Acceptance: Metadata banner visible for AI-generated drafts, gap and KB links work, author-created articles show different indicator

- [X] In `src/pages/admin/article/[id].astro`, add generation history section. Query article_generations table by article_id. Display ArticleGenerationSummary: model used, generation timestamp, publication timestamp (if published), content_changed flag, KB entries count. Add "View Original Content" button to show side-by-side comparison (original vs final).
  - Acceptance: Generation history displayed, timestamps shown correctly, content comparison accessible

- [X] In `src/pages/admin/article/[id].astro`, enhance edit form with autosave feature. Every 30 seconds (if content changed): send PUT request to /api/articles/[id] with current form state. Show "Saving..." indicator, then "Saved at HH:MM" on success. On error: show "Save failed, will retry" and keep retrying.
  - Acceptance: Autosave triggers every 30 seconds without user clicking, saves are visible, error handling graceful

- [X] In `src/components/admin/DraftEditingSuggestions.astro` (new file), create collapsible suggestions panel. Display AI-generated suggestions (optional): tone improvements (e.g., "Add more personal examples"), clarity improvements (e.g., "Expand intro paragraph"), SEO improvements (e.g., "Add H2 for 'AI safety practices'"), brand voice alignment (e.g., "Mention FrinterFlow naturally"). Each suggestion has "Accept" (insert text) and "Dismiss" buttons.
  - Acceptance: Suggestions render, accept button inserts suggested text into editor, dismiss removes suggestion from view

- [X] In `src/pages/admin/article/[id].astro`, add tone alignment badge. Show visual indicator (green/yellow/red) and score (0-100) showing how well article aligns with author identity. Scan content for identity keywords (from llms-full.txt: author's phrases, 3-sphere language, philosophical references). Update score in real-time as user edits.
  - Acceptance: Badge updates as content changes, score 0-100 displayed, color indicator clear

**Publication Workflow & Audit Trail**

- [X] In `src/pages/api/articles/[id]/publish.ts` (new file), implement `POST /api/articles/[id]/publish` endpoint. Validate article exists and status=draft. Update article: status=published, publishedAt=NOW(). Update source gap (if source_gap_id exists): status=acknowledged, acknowledged_at=NOW(). Update article_generations record (if exists): publication_timestamp=NOW(), final_content=(current article content). Invalidate RSS/sitemap caches. Send Discord notification (if webhook configured): "📝 New article: {title}". Return article with new status and publishedAt.
  - Acceptance: Article status transitions to published, timestamps recorded accurately, gap acknowledged, caches invalidated, notification sent

- [X] In `src/pages/api/articles/[id]/publish.ts`, add transaction wrapping. Ensure atomicity: if any step fails (gap update, cache invalidation, notification), entire transaction rolls back and no state changes occur.
  - Acceptance: Transaction succeeds or fails as atomic unit, database consistency maintained, no partial updates

- [X] In `src/pages/admin/article/[id].astro`, modify edit form status dropdown. Current options: "draft", "published", "archived". Add "ready-for-review" state (for future multi-author setup). On status change to published: show confirmation modal with final content preview, ask "Are you sure? This cannot be undone.". On publish: execute POST /api/articles/[id]/publish.
  - Acceptance: Status dropdown includes draft, ready-for-review, published, archived, confirmation modal shown before publish, API call executes on confirmation

- [X] In `src/pages/api/article-generations.ts` (new file), implement `GET /api/article-generations` endpoint. Parse query params: article_id (optional filter), gap_id (optional filter). Query article_generations table. Return array of ArticleGenerationSummary. Response matches schema in api_contracts.json.
  - Acceptance: Endpoint returns generation history, filters work (can filter by article or gap), response schema matches contract

**Content Flywheel Integration**

- [X] In `src/pages/api/articles/[id]/publish.ts` (modify), after publication, optionally add published article to knowledge base. If author has enabled "add published articles to KB" setting: create knowledge_entry with type=published_article, title=article.title, content=article.content (HTML), source_url=blog_url+article.slug, tags=article.tags, importance_score=80 (configurable), source_id=knowledge_sources record for "published_articles".
  - Acceptance: Setting respected, published articles can be added to KB, KB entry created with all required fields, no duplicate entries (check by title+source_url)

- [X] In `src/pages/admin/knowledge-base/index.astro`, add filter option to show "Published Articles" (type=published_article from KB). Display these with badge "From Published Article" distinguishing from manually-imported entries.
  - Acceptance: Published articles visible in KB list, badge shown, can be filtered separately

**Final Integration & Testing**

- [X] In `src/pages/api/articles/[id].ts` (modify existing PUT endpoint), ensure response includes new fields: source_gap_id, generated_by_model (for transparency). When updating, do not allow retroactive changes to these fields (they are immutable once set).
  - Acceptance: Response includes source_gap_id and generated_by_model, attempting to update these fields in PUT request fails silently or returns 400

- [X] In `src/utils/markdown.ts`, verify parseMarkdown() utility correctly converts Astro markdown to HTML. Test with complex markdown: headers, lists, code blocks, links, blockquotes. Ensure output valid HTML (no unmatched tags).
  - Acceptance: Markdown conversion test passes for all standard markdown elements, HTML output valid, no escaping issues

---

## Cross-Stage Requirements

Depends on: All stages (applied throughout)

**Authentication & Authorization**

- [X] In `src/middleware/auth.ts` (or modify existing if present), ensure all `/api/*` endpoints require session authentication except GET endpoints for public content (KB search, gap list read). Admin pages (`/admin/*`) require session + admin role check.
  - Acceptance: Protected endpoints reject unauthenticated requests with 401, public GET endpoints accessible without auth, admin pages require auth

**Error Handling & Logging**

- [X] Throughout all new files, implement consistent error logging. Use `console.error()` or logging library with context: timestamp, endpoint/function, error code, error message, relevant IDs (gap_id, article_id, etc.). Log all API call failures, database errors, validation failures.
  - Acceptance: Error logs include context, no sensitive data logged (API keys, passwords), errors traceable for debugging

**TypeScript Types & Contracts**

- [X] Ensure all new code uses TypeScript interfaces from `contracts/` folder (knowledge_base_models.ts, content_gaps_models.ts, draft_generation_types.ts, article_generation_audit.ts). Do not redefine types in implementation files.
  - Acceptance: No duplicate type definitions, contracts/ types used consistently, TypeScript strict mode passes

**Environment & Configuration**

- [X] In `.env.local`, ensure required variables present: DATABASE_URL, OPENROUTER_API_KEY, ADMIN_PASSWORD_HASH (existing). No new environment variables required.
  - Acceptance: All required env vars present, application starts without missing config errors

**Documentation**

- [X] In `src/db/schema.ts`, add comments above each new table explaining purpose and key constraints (similar to specification.md § 3.1 format).
  - Acceptance: Comments explain table purpose, list key constraints, match specification documentation

- [X] In each new script file (scripts/gap-analysis.ts, scripts/draft-generator.ts, etc.), add file-level JSDoc comment explaining: purpose, input contracts, output contracts, error handling approach.
  - Acceptance: Scripts have docstring explaining function signatures and behavior



---

# AI Agent Coordination & Execution Guide

## Overview

This section describes how AI coding agents (Claude Code, Cursor, Windsurf) will collaborate to implement the FrinterHero AI-Driven Content Engine. The implementation is organized into 5 sequential stages with clear dependencies.

**Total estimated effort:** 80-120 hours across all stages  
**Recommended team:** 2-3 parallel agents (one per stage during dependent work)  
**Execution model:** Sequential stages with parallelization where possible

---

## Stage Execution Model

### Dependency Graph

```
Stage 1: Knowledge Base Infrastructure
    ↓
Stage 2: Daily AI Gap Analysis Loop
    ↓
Stage 3: Admin Dashboard — Content Gaps & Curation
    ↓
Stage 4: AI-Powered Draft Generation
    ↓
Stage 5: Review, Edit & Publication Workflow
```

**Key insight:** Stages are strictly sequential. Stage N cannot start until Stage N-1 is complete and tested.

### Parallelization Opportunities

Within each stage, **multiple agents can work in parallel on independent tasks**:

- **Stage 1:** DB schema can proceed in parallel with API endpoint implementation and UI creation
- **Stage 2:** Gap detection logic independent from GEO Monitor integration
- **Stage 3:** Dashboard components built in parallel with API endpoints
- **Stage 4:** Draft generator engine developed while mega-prompt system is refined
- **Stage 5:** Audit trail implementation parallel to editor UI enhancements

---

## Agent Roles & Responsibilities

### Agent 1: Database & Backend Architecture

**Focus:** Database schema, migrations, core business logic, API endpoints, Open Router integration

**Responsible for Stages:**
- **Stage 1:** Complete (DB schema, migrations, KB API endpoints, import system)
- **Stage 2:** Gap detection engine, GEO Monitor integration, CRON setup
- **Stage 4:** Draft generation pipeline, validation, database records
- **Stage 5:** Audit trail table, article_generations record creation, publication logic

**Key deliverables:**
- All database tables created and indexed correctly
- API endpoints match OpenAPI spec exactly
- Error handling consistent across all endpoints
- Transaction/atomicity for critical workflows

**Success metrics:**
- Zero data integrity violations (all FK constraints enforced)
- All migrations auto-generated and tested
- API endpoints <1s response time (p95)
- Gap analysis runs without errors daily

---

### Agent 2: Admin Dashboard & Frontend

**Focus:** Astro SSR pages, Astro components, user interaction, client-side state, styling

**Responsible for Stages:**
- **Stage 1:** KB admin pages (list, create, import UI)
- **Stage 3:** Gap dashboard, gap curation UI, stats widgets, filters
- **Stage 5:** Article editor enhancements, metadata banner, publication UI

**Key deliverables:**
- All admin pages responsive and accessible
- Real-time dashboard updates (polling every 30 seconds)
- Filter/sort controls responsive (<500ms)
- Mobile-first design

**Success metrics:**
- Dashboard loads in <2 seconds
- Mobile UI works on all screen sizes
- Filters/sorts update without page reload
- No console errors in browser DevTools

---

### Agent 3: AI Integration & Prompting

**Focus:** LLM integration, mega-prompt design, content validation, brand voice preservation, SEO

**Responsible for Stages:**
- **Stage 2:** (observes gap detection validation)
- **Stage 4:** Draft generator, mega-prompt system, validation, quality checks
- **Stage 5:** (observes article publication and optional feedback loops)

**Key deliverables:**
- Mega-prompt correctly integrates author identity from llms-full.txt
- Draft validation catches all invalid formats (95%+ success rate)
- Generated articles align with author voice (tone alignment score)
- No hallucinated facts in generated content

**Success metrics:**
- Generated drafts 800-2500 words
- Tone alignment score >80%
- Brand products naturally mentioned (not forced)
- All claims grounded in KB or gap description
- <60 second generation time per article

---

## Stage-by-Stage Execution Guide

### Stage 1: Knowledge Base Infrastructure (Est. 16-20 hours)

**Primary:** Agent 1  
**Secondary:** Agent 2

**Execution:**

1. Agent 1 builds DB schema + migrations (4-6 hours)
   - Define `knowledge_sources`, `knowledge_entries` tables
   - Add indexes (GIN, full-text, composite)
   - Modify `articles` table with FK columns
   - Generate Drizzle migrations
   - **Checkpoint:** Migrations run without errors

2. Agent 1 builds API endpoints (4-5 hours)
   - `GET /api/knowledge-base` (search, filter, pagination)
   - `POST /api/knowledge-base` (create, validate)
   - `GET /api/knowledge-base/[id]` (retrieve)
   - Test against OpenAPI spec
   - **Checkpoint:** All endpoints return correct status codes

3. Agent 1 builds import system (3-4 hours)
   - `src/utils/kb-importer.ts` (markdown parser, YAML frontmatter)
   - `POST /api/kb-import` endpoint (batch upload)
   - Test with sample files
   - **Checkpoint:** Can import 5+ files without errors

4. Agent 2 builds admin UI (5-7 hours, runs in parallel with step 3)
   - `/admin/knowledge-base/index.astro` (list view)
   - `/admin/knowledge-base/create.astro` (form)
   - `/admin/knowledge-base/import.astro` (batch upload)
   - Integrate with API endpoints
   - **Checkpoint:** All pages load, forms work, validation displays

**Handoff:** Agent 1 ready for Stage 2. DB + API + UI complete.

---

### Stage 2: Daily AI Gap Analysis Loop (Est. 14-18 hours)

**Primary:** Agent 1

**Execution:**

1. Agent 1 adds gap schema (2 hours)
   - `content_gaps` table
   - Modify `geoRuns` table
   - Generate migration
   - **Checkpoint:** Schema adds without conflicts

2. Agent 1 builds gap detection engine (6-8 hours)
   - `scripts/gap-analysis.ts` (core logic)
   - Full-text search comparison (KB vs AI)
   - Confidence scoring (0-100)
   - Duplicate detection (14-day window)
   - Suggested angle generation
   - **Checkpoint:** Produces realistic gaps with scores

3. Agent 1 integrates with GEO Monitor (3-4 hours)
   - Refactor `scripts/geo-monitor.ts`
   - Call gap-analysis pipeline
   - Store gaps in database
   - Update `geoRuns` metrics
   - **Checkpoint:** `npm run geo:daily` succeeds

4. Agent 1 sets up CRON (2 hours)
   - npm scripts (`geo:daily`, `gap:analyze`)
   - `src/pages/api/geo/run.ts` endpoint
   - Document Railway CRON config
   - **Checkpoint:** Endpoint works, can be called manually

5. Agent 1 runs end-to-end test (1-2 hours)
   - Execute gap analysis
   - Verify gaps in database
   - Check scores realistic
   - Confirm no duplicates
   - **Checkpoint:** Daily gap detection working

**Handoff:** Agent 1 ready for Stage 3. Gap pipeline complete + tested.

---

### Stage 3: Admin Dashboard — Content Gaps & Curation (Est. 18-22 hours)

**Primary:** Agent 1 (API) + Agent 2 (UI)  
**Work in parallel**

**Execution:**

1. Agent 1 builds gap API endpoints (4-5 hours)
   - `GET /api/content-gaps` (filters, sorts, KB hints)
   - `POST /api/content-gaps/[id]/acknowledge` (approve + notes)
   - `POST /api/content-gaps/[id]/archive` (archive)
   - **Checkpoint:** Endpoints return correct schema

2. Agent 2 builds gap components (4-5 hours, parallel with step 1)
   - `GapCard.astro` component
   - `GapExpandedCard.astro` component
   - `GapStatsWidget.astro` component
   - **Checkpoint:** Components render correctly

3. Agent 2 builds dashboard page (5-6 hours)
   - `/admin/content-gaps/index.astro` main page
   - Integrate components
   - Filter/sort controls
   - Client-side polling (30-second refresh)
   - **Checkpoint:** Loads in <2 seconds, filters work

4. Agent 2 wires curation workflow (4-6 hours)
   - "Approve & Generate" button workflow
   - Modal for custom notes
   - Model selector (Claude, OpenAI, Perplexity, Gemini)
   - "Archive" and "Snooze" actions
   - **Checkpoint:** Author can approve gaps

5. Agent 2 tests end-to-end (1-2 hours)
   - Dashboard displays gaps
   - Filters update feed
   - Author approves gap with notes
   - **Checkpoint:** Dashboard fully functional

**Handoff:** Agents 1 & 2 ready for Stage 4. Dashboard live + author can approve gaps.

---

### Stage 4: AI-Powered Draft Generation (Est. 18-24 hours)

**Primary:** Agent 3 (prompting) + Agent 1 (API + validation)  
**Work in parallel**

**Execution:**

1. Agent 3 builds mega-prompt system (5-7 hours)
   - `scripts/draft-generator.ts` mega-prompt constructor
   - Load author identity from `llms-full.txt` (tone, philosophy, 3-sphere)
   - 6-section prompt structure
   - Test with sample gaps
   - **Checkpoint:** Generates valid JSON output

2. Agent 3 builds draft generation function (4-5 hours)
   - Open Router API call
   - JSON response parsing
   - Markdown → HTML conversion
   - Reading time calculation
   - Slug generation
   - **Checkpoint:** End-to-end generation succeeds

3. Agent 3 builds validation system (3-4 hours)
   - `scripts/draft-validator.ts`
   - Response structure validation
   - Content length check (800-2500 words)
   - SEO validation (title/description lengths)
   - Brand voice alignment scan
   - **Checkpoint:** Validator catches invalid formats

4. Agent 1 builds draft API endpoint (4-5 hours, parallel with step 3)
   - `POST /api/generate-draft`
   - Accept GenerateDraftRequest
   - Call draft-generator + validator
   - Create article record (status: draft)
   - Create article_generations audit record
   - **Checkpoint:** Article created with full audit trail

5. Agent 1 builds error handling (2-3 hours)
   - Comprehensive error logging
   - Error response codes (API_ERROR, VALIDATION_FAILED, etc.)
   - Retry_allowed flag
   - Handle timeouts, rate limits
   - **Checkpoint:** All errors caught and logged

6. Agents test end-to-end (2-3 hours)
   - Trigger from dashboard approval
   - Verify mega-prompt structure
   - Verify KB context embedded
   - Verify article created
   - **Checkpoint:** Full draft generation pipeline works

**Handoff:** Agents 1, 2, 3 ready for Stage 5. Drafts generating in <60 seconds.

---

### Stage 5: Review, Edit & Publication Workflow (Est. 16-20 hours)

**Primary:** Agent 1 (API) + Agent 2 (UI)  
**Work in parallel**

**Execution:**

1. Agent 1 adds audit table (1-2 hours)
   - `article_generations` table
   - Generate migration
   - **Checkpoint:** Table created

2. Agent 1 builds publication API (4-5 hours)
   - `POST /api/articles/[id]/publish`
   - Update article status → published
   - Update gap status → acknowledged
   - Invalidate caches
   - Send Discord notification
   - Wrap in transaction
   - **Checkpoint:** Publication succeeds atomically

3. Agent 1 builds history API (2 hours)
   - `GET /api/article-generations`
   - Return audit trail by article or gap
   - **Checkpoint:** Endpoint returns correct schema

4. Agent 2 enhances editor UI (3-4 hours, parallel with step 2)
   - Add generation metadata banner
   - Display gap source, model, KB hints
   - Integrate generation history display
   - **Checkpoint:** Banner shows for AI-generated articles

5. Agent 2 adds autosave (2-3 hours)
   - 30-second autosave timer
   - "Saving..." and "Saved at HH:MM" UI
   - Retry logic on failure
   - **Checkpoint:** Autosave works without user clicks

6. Agent 2 adds publication UI (2-3 hours)
   - Status dropdown (draft, published, archived)
   - Confirmation modal before publish
   - Final content preview
   - Wire to publish API
   - **Checkpoint:** Author can publish with confirmation

7. Agent 2 adds optional enhancements (3-4 hours, if time)
   - DraftEditingSuggestions.astro component
   - Tone alignment badge (real-time)
   - Content comparison view (original vs final)

8. Agents test end-to-end (2 hours)
   - View generated draft
   - Edit content
   - Autosave verification
   - Publish article
   - Verify status transitions
   - Verify cache/notification
   - **Checkpoint:** Full workflow succeeds

**Handoff:** System complete. All 5 stages working end-to-end.

---

## End-to-End System Test (All Agents)

After all stages complete, run full integration test:

1. **Day 1 (7 AM):** CRON triggers gap analysis
   - [X] 5-10 gaps created in database
   - [X] Confidence scores realistic
   - [X] No duplicates

2. **Day 1 (9 AM):** Author reviews dashboard
   - [X] Dashboard loads with gaps
   - [X] Filters/sorts work
   - [X] KB hints visible

3. **Day 1 (10 AM):** Author approves gap
   - [X] Enters custom notes
   - [X] Selects Claude Sonnet
   - [X] Clicks "Approve & Generate Draft"

4. **Day 1 (10:01 AM):** Draft generated
   - [X] Article in `articles` table (status=draft)
   - [X] Audit record in `article_generations`
   - [X] Author redirected to editor

5. **Day 1 (10:30 AM):** Author edits draft
   - [X] Changes title, adds examples
   - [X] Autosave works every 30 seconds
   - [X] Edits tracked

6. **Day 1 (11 AM):** Author publishes
   - [X] Clicks "Publish"
   - [X] Confirms in modal
   - [X] Status → published
   - [X] Gap → acknowledged
   - [X] Article in RSS/sitemap
   - [X] Discord notification sent

7. **Next day (7 AM):** Second run
   - [X] New gaps detected (no duplicates)
   - [X] System sustaining itself
   - [X] Content flywheel working

---

## Communication Between Agents

### Stage Completion Handoff

1. Agent A completes stage (all tasks marked `[X]`)
2. Agent A runs manual tests, documents results
3. Agent A updates tasks.md with notes on any issues
4. Agent B reviews completed stage, runs own tests
5. Agent B starts Stage N+1

### Key Information to Pass

- Which acceptance criteria were tricky
- Design decisions made (error message format, etc.)
- Database schema decisions (column types, constraints)
- API response shapes (if deviating from spec)
- Performance bottlenecks encountered
- Any third-party library additions needed

---

## Success Metrics & Quality Thresholds

### Performance

| Metric | Target | Threshold |
|--------|--------|-----------|
| Dashboard load | <2 sec | <3 sec |
| Full-text search | <500ms | <1 sec |
| Draft generation | <60 sec | <120 sec |
| API response (p95) | <1 sec | <2 sec |
| Filter/sort | <500ms | <1 sec |

### Quality

| Metric | Target | Verification |
|--------|--------|--------------|
| Draft voice alignment | 80%+ | Tone alignment score |
| No hallucinations | 100% | All claims grounded |
| Acceptance criteria | 100% | All tasks [X] |
| Data integrity | 100% | FK constraints enforced |
| Test coverage | 60%+ | Critical paths tested |

---

## Estimated Total Timeline

**With 2-3 parallel agents:** 6-10 working days (10-14 calendar days)

- Stage 1: 2-3 days
- Stage 2: 2 days
- Stage 3: 2-3 days
- Stage 4: 3-4 days
- Stage 5: 2-3 days
- Testing & fixes: 1-2 days
