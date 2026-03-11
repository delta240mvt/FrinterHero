# FrinterHero AI-Driven Content Engine

AI-driven blog content engine that identifies visibility gaps via automated analysis, curates topics with author input, and generates high-quality drafts aligned with Przemysław Filipiak's brand identity. Builds on existing Astro SSR + PostgreSQL infrastructure with enhanced AI orchestration, knowledge base integration, and structured approval workflows.

## .shotgun/ Files

Read ALL of these before writing any code:

- `.shotgun/specification.md` — Requirements, architecture, and acceptance criteria
- `.shotgun/contracts/` — Type definitions and interface contracts (knowledge_base_models.ts, content_gaps_models.ts, draft_generation_types.ts, article_generation_audit.ts, api_contracts.json)
- `.shotgun/research.md` — Complete existing codebase structure, technologies, and current implementation
- `.shotgun/plan.md` — Implementation plan with 5 sequential stages and dependencies
- `.shotgun/tasks.md` — **Start here.** Granular tasks organized by stage with `[ ]` checkboxes

## Quality Checks

```bash
npm run build
npm run db:push
npm run dev
```

## How to Work

### 1. Read Pipeline Files First
- Read **all** `.shotgun/` files above. Do NOT modify them.
- Understanding `.shotgun/specification.md` § 3 (Database Schema) is critical — all new tables defined there.
- Understanding `.shotgun/research.md` § 2-4 is critical — existing brand identity, blog system, and AI integration documented there.

### 2. Open `.shotgun/tasks.md` and Find Your Stage
- **Only work on ONE stage at a time.** Do not skip ahead.
- Find the first stage with `[ ]` (uncomplete) tasks.
- All tasks in earlier stages must be marked `[X]` before proceeding to next stage.
- Dependency order is **strict**: Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5

**Dependency Chain:**
```
Stage 1: Knowledge Base Infrastructure (no dependencies)
  ↓ Required by:
Stage 2: Daily AI Gap Analysis Loop
  ↓ Required by:
Stage 3: Admin Dashboard — Content Gaps & Curation
  ↓ Required by:
Stage 4: AI-Powered Draft Generation
  ↓ Required by:
Stage 5: Review, Edit & Publication Workflow
```

### 3. Execute Each Task in Order

For each task in your current stage:

**A. Read task specification carefully**
- Acceptance criteria define success (must all pass)
- File paths are relative to project root: `src/pages/api/knowledge-base.ts` = `FrinterHero/src/pages/api/knowledge-base.ts`

**B. Check if file already exists**
- Modifying existing files: preserve all existing code, only add new code
- Creating new files: follow existing code style (TypeScript strict mode, Tailwind classes, Astro conventions)

**C. Implement and test**
- Use Drizzle ORM for all database operations (no raw SQL)
- Use TypeScript interfaces from `.shotgun/contracts/` (never redefine types)
- All AI mega-prompts must include IDENTITY from `llms-full.txt` (author's tone, philosophy, 3-sphere colors)
- Run `npm run dev` locally and test in browser before marking complete
- Verify acceptance criteria pass

**D. Mark task complete**
- Replace `[ ]` with `[X]` in `.shotgun/tasks.md`
- Commit code with clear message: `feat: {task description}`

### 4. Before Moving to Next Stage

**Stop and wait for human review:**
- Run `npm run build` — must succeed with no errors
- Run test sequence: manual tests + acceptance criteria verification
- Summarize what you implemented and what works
- **Do NOT start next stage without approval**

### 5. Special Rules for This Project

**Brand Identity (CRITICAL):**
- Author files: `public/llms.txt`, `public/llms-full.txt`, `CLAUDE.md`
- All AI draft prompts must include IDENTITY system prompt from `llms-full.txt` content
- Mega-prompt structure defined in `.shotgun/specification.md` § 7.2
- Tone checkers scan for keywords: "deep work", "Przemysław", "three spheres", "focus"

**Database Operations (MANDATORY):**
- All database schema changes in `src/db/schema.ts` only
- Run `drizzle-kit generate` after schema changes → creates migration in `drizzle/migrations/`
- Run `npm run db:push` to sync schema to PostgreSQL
- Drizzle ORM for queries: `db.select().from(table).where(...)`, not raw SQL strings
- **DO NOT** create migration files manually

**TypeScript & Type Safety:**
- `tsconfig.json` has `"strict": true` — enable all strict type checks
- Import interfaces from `.shotgun/contracts/`:
  - `KnowledgeEntry`, `KnowledgeSource` from `contracts/knowledge_base_models.ts`
  - `ContentGap` from `contracts/content_gaps_models.ts`
  - `DraftAIResponse`, `GenerateDraftRequest` from `contracts/draft_generation_types.ts`
  - `ArticleGeneration` from `contracts/article_generation_audit.ts`
- Never use `any` type — always define explicit types

**API Contract Compliance:**
- `.shotgun/contracts/api_contracts.json` defines OpenAPI 3.0 schema for all new endpoints
- Request/response bodies MUST match schema exactly
- HTTP status codes: 200 OK, 201 Created, 202 Accepted, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests

**Authentication & Authorization:**
- All `/api/*` endpoints (except GET for public data) require session authentication
- Check middleware in `src/middleware.ts` — applies to `/admin/*` routes
- Use existing bcrypt + session system (no changes to auth layer)

**Astro SSR Specifics:**
- Output mode: `'server'` (SSR, not static)
- Node adapter: `@astrojs/node` for Railway deployment
- Astro pages are `.astro` files: `src/pages/admin/knowledge-base/index.astro`
- Components are `.astro` files: `src/components/admin/GapCard.astro`
- Client-side JavaScript in `<script>` tags or separate `.ts` files in `src/utils/`

**Existing Code to Preserve:**
- `src/pages/blog/` — existing blog listing + post rendering
- `src/pages/api/articles/` — existing article CRUD endpoints
- `src/utils/markdown.ts` — existing markdown → HTML conversion (`parseMarkdown()` utility)
- `src/utils/auth.ts` — existing authentication system (bcrypt + tokens)
- `src/middleware.ts` — existing route protection for `/admin/*`
- `src/components/layouts/Base.astro` — existing layout (JSON-LD schema)
- All existing admin pages and components

### 6. Environment Variables

All required variables already in `.env.example`:

```
DATABASE_URL=postgresql://...
ADMIN_PASSWORD_HASH=$2b$10$...
OPENROUTER_API_KEY=sk-or-...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
NODE_ENV=development
```

Copy to `.env.local`, fill in your values. No new environment variables needed for this project.

### 7. Testing Each Stage

**After completing each stage, run:**

```bash
# Build verification
npm run build          # Must succeed with no errors

# Local development
npm run dev            # Start dev server on localhost:3000

# Manual testing
# - Open browser to test UI components
# - Test API endpoints via curl or HTTP client
# - Verify database records created correctly
# - Check console for errors/logs
```

**For database changes:**
```bash
npm run db:push        # Sync schema to PostgreSQL (creates/updates tables)
npm run db:seed        # Optional: seed sample data
```

**Specific stage test checklist in tasks.md:**
- Stage 1: KB search <500ms, pagination works, import succeeds
- Stage 2: Gap analysis finds 5-10 gaps, no duplicates, scores 0-100
- Stage 3: Dashboard loads <2 seconds, filters work, curation form captures notes
- Stage 4: Draft generation <60 seconds, JSON validation passes, tone alignment works
- Stage 5: Article publishes, gap acknowledged, RSS updated, audit trail complete

### 8. Common Pitfalls to Avoid

❌ **Don't:** Rewrite entire files — merge new code into existing files  
✅ **Do:** Use `replace_markdown_section` or `insert_markdown_section` for document edits

❌ **Don't:** Use raw SQL queries  
✅ **Do:** Use Drizzle ORM: `db.select().from(table).where(eq(table.id, id))`

❌ **Don't:** Forget IDENTITY in AI prompts  
✅ **Do:** Include system prompt from `llms-full.txt` (tone, philosophy, 3-sphere colors)

❌ **Don't:** Skip migration generation  
✅ **Do:** Run `drizzle-kit generate` after schema.ts changes

❌ **Don't:** Use `any` type in TypeScript  
✅ **Do:** Import and use types from `.shotgun/contracts/`

❌ **Don't:** Publish articles automatically  
✅ **Do:** Keep status workflow: draft → author review → published

❌ **Don't:** Assume codebase is indexed yet  
✅ **Do:** Refer to `.shotgun/research.md` for structure, files, and existing implementations

### 9. When You're Done With a Stage

1. All tasks marked `[X]`
2. Run `npm run build` — succeeds
3. Run test checklist — all pass
4. **Stop and summarize:**
   - What was implemented
   - What tests passed
   - Any issues encountered
   - Ready for next stage
5. **Wait for human approval before starting next stage**

---

## File Locations Reference

### Critical Identity Files (DO NOT MODIFY)
- `public/llms.txt` — Concise AI crawler metadata
- `public/llms-full.txt` — Extended author identity for mega-prompts
- `CLAUDE.md` — Brand context and philosophy (internal reference)

### Existing Database Layer
- `src/db/schema.ts` — All table definitions (add new tables here)
- `src/db/client.ts` — PostgreSQL connection singleton
- `drizzle/migrations/` — Auto-generated migration files

### Existing API Endpoints
- `src/pages/api/auth.ts` — Login/logout (existing, don't modify)
- `src/pages/api/articles/` — Article CRUD (existing, extend only)
- `src/pages/api/run-geo.ts` — GEO Monitor trigger (existing)

### Existing Blog Pages
- `src/pages/blog/index.astro` — Blog listing
- `src/pages/blog/[slug].astro` — Blog post detail (SSR)
- `src/pages/admin/index.astro` — Dashboard home

### Existing Utilities
- `src/utils/markdown.ts` — parseMarkdown() function
- `src/utils/auth.ts` — bcrypt hashing + token generation
- `src/utils/slug.ts` — URL slug generation

### Existing Scripts
- `scripts/geo-monitor.ts` — GEO Monitor main loop (extend in Stage 2)
- `scripts/apis.ts` — Open Router API wrappers
- `scripts/analysis.ts` — Gap detection (extend in Stage 2)
- `scripts/queries.json` — Niche search query bank

### Contracts (Use These Types)
- `.shotgun/contracts/knowledge_base_models.ts` — KB interfaces
- `.shotgun/contracts/content_gaps_models.ts` — Gap interfaces
- `.shotgun/contracts/draft_generation_types.ts` — Draft generation interfaces
- `.shotgun/contracts/article_generation_audit.ts` — Audit trail interfaces
- `.shotgun/contracts/api_contracts.json` — OpenAPI specification

---

## Implementation Summary

**Total scope:** 5 sequential stages, ~80-120 hours  
**Architecture:** Astro SSR + PostgreSQL + Drizzle ORM + Open Router (4 models)  
**Deployment:** Railway (existing infrastructure)  
**Key deliverables:**
1. Knowledge base system (Stage 1)
2. Automated daily gap analysis (Stage 2)
3. Author curation dashboard (Stage 3)
4. AI draft generation with identity preservation (Stage 4)
5. Review, edit, publish workflow with audit trail (Stage 5)

Start with Stage 1. One stage at a time. Mark tasks `[X]` as complete. Stop at stage boundaries for human review.
