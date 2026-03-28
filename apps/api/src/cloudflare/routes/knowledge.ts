import { Hono } from 'hono';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { knowledgeEntries, knowledgeSources } from '../../../../../src/db/schema.ts';
import { importMarkdownFiles } from '../../../../../src/utils/kb-importer.ts';
import { requireAuthMiddleware } from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

const KB_TYPES = ['project_spec', 'published_article', 'external_research', 'personal_note'] as const;
type KbType = (typeof KB_TYPES)[number];

function kbScope(siteId: number) {
  return or(eq(knowledgeEntries.siteId, siteId), isNull(knowledgeEntries.siteId));
}

function parseTags(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

export const knowledgeRouter = new Hono<HonoEnv>();

// GET /v1/admin/knowledge-base — paginated list with filters
knowledgeRouter.get('/v1/admin/knowledge-base', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);

  const search = c.req.query('search')?.trim() ?? '';
  const tagsParam = c.req.query('tags')?.trim() ?? '';
  const type = c.req.query('type')?.trim() ?? '';
  const sortBy = c.req.query('sort_by') ?? 'importance';
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '') || 20, 1), 100);
  const offset = Math.max(Math.min(parseInt(c.req.query('offset') ?? '') || 0, 5000), 0);

  const conditions: any[] = [kbScope(siteId)!];
  if (type) conditions.push(eq(knowledgeEntries.type, type));
  if (tagsParam) {
    for (const tag of tagsParam.split(',').map(t => t.trim()).filter(Boolean)) {
      conditions.push(sql`${knowledgeEntries.tags} @> ARRAY[${tag}]::text[]`);
    }
  }
  if (search) {
    conditions.push(or(
      ilike(knowledgeEntries.title, `%${search}%`),
      sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${search})`
    )!);
  }
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
  const orderBy = sortBy === 'recency' ? desc(knowledgeEntries.createdAt) : desc(knowledgeEntries.importanceScore);

  const [rows, totals] = await Promise.all([
    db.select().from(knowledgeEntries).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(knowledgeEntries).where(whereClause),
  ]);
  return c.json({ entries: rows, pagination: { total: totals[0]?.total ?? 0, limit, offset } });
});

// POST /v1/admin/knowledge-base/import — bulk import from markdown files
// NOTE: registered BEFORE /:id routes to avoid param capture
knowledgeRouter.post('/v1/admin/knowledge-base/import', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const folderName = typeof body.folderName === 'string' && body.folderName.trim() ? body.folderName.trim() : null;
  const files = Array.isArray(body.files)
    ? body.files
        .map((file: unknown) => ({
          filename: typeof (file as Record<string, unknown>)?.filename === 'string' ? (file as Record<string, unknown>).filename as string : '',
          content: typeof (file as Record<string, unknown>)?.content === 'string' ? (file as Record<string, unknown>).content as string : '',
        }))
        .filter(file => file.filename.endsWith('.md') && file.content)
    : [];
  if (files.length === 0) return c.json({ error: 'No .md files provided' }, 400);
  const { valid, errors } = importMarkdownFiles(files);
  const sourceName = `batch-import-${Date.now()}`;
  const [source] = await db.insert(knowledgeSources).values({ siteId, sourceType: 'imported_markdown', sourceName, status: 'active' }).returning();
  if (!source) return c.json({ error: 'Failed to create source' }, 500);
  let successCount = 0;
  const failedEntries = [...errors.map(e => ({ filename: e.filename, reason: e.errors.join('; ') }))];
  for (const entry of valid) {
    try {
      const existing = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(and(kbScope(siteId)!, eq(knowledgeEntries.title, entry.title), eq(knowledgeEntries.sourceId, source.id))).limit(1);
      if (existing.length > 0) { failedEntries.push({ filename: entry.filename, reason: 'Duplicate entry (same title + source)' }); continue; }
      await db.insert(knowledgeEntries).values({ siteId, type: entry.type, title: entry.title, content: entry.content, tags: entry.tags, projectName: folderName || entry.projectName || null, importanceScore: entry.importanceScore, sourceUrl: entry.sourceUrl || null, sourceId: source.id });
      successCount++;
    } catch (error) {
      console.error('[KB Import] Failed to insert entry:', { filename: entry.filename, error });
      failedEntries.push({ filename: entry.filename, reason: 'Database insertion error' });
    }
  }
  return c.json({ total_files: files.length, successful: successCount, failed: failedEntries.length, source_id: source.id, errors: failedEntries });
});

// GET /v1/admin/knowledge-base/:id
knowledgeRouter.get('/v1/admin/knowledge-base/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const entryId = Number(c.req.param('id'));
  if (!entryId) return c.json({ error: 'Invalid id' }, 400);
  const [entry] = await db.select().from(knowledgeEntries).where(and(kbScope(siteId)!, eq(knowledgeEntries.id, entryId))).limit(1);
  if (!entry) return c.json({ error: 'Knowledge entry not found' }, 404);
  return c.json(entry);
});

// POST /v1/admin/knowledge-base — create entry
knowledgeRouter.post('/v1/admin/knowledge-base', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));

  const fieldErrors: Record<string, string> = {};
  const type = typeof body.type === 'string' ? body.type : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  const sourceUrl = body.source_url ? String(body.source_url) : null;
  const tags = parseTags(body.tags);
  const projectName = body.project_name ? String(body.project_name) : null;
  const sourceId = body.source_id ? Number(body.source_id) : null;
  const importanceScore = body.importance_score === undefined ? 50 : Number(body.importance_score);

  if (!KB_TYPES.includes(type as KbType)) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`;
  if (!title) fieldErrors.title = 'Required and must be non-empty';
  if (!content || content.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${content.trim().length})`;
  if (Number.isNaN(importanceScore) || importanceScore < 0 || importanceScore > 100) fieldErrors.importance_score = 'Must be 0-100';
  if (sourceUrl) { try { new URL(sourceUrl); } catch { fieldErrors.source_url = 'Must be a valid URL'; } }
  const invalidTags = tags.filter(tag => !/^[a-z0-9][a-z0-9-]*$/.test(tag));
  if (invalidTags.length > 0) fieldErrors.tags = `Invalid tags: ${invalidTags.join(', ')}`;
  if (Object.keys(fieldErrors).length > 0) return c.json({ error: 'Validation failed', fields: fieldErrors }, 400);

  const duplicateFilter = sourceId
    ? and(eq(knowledgeEntries.title, title), eq(knowledgeEntries.sourceId, sourceId), kbScope(siteId)!)
    : and(eq(knowledgeEntries.title, title), isNull(knowledgeEntries.sourceId), kbScope(siteId)!);
  const [duplicate] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(duplicateFilter).limit(1);
  if (duplicate) return c.json({ error: 'Duplicate entry detected', existingId: duplicate.id }, 409);
  const [created] = await db.insert(knowledgeEntries).values({ siteId, type, title, content, sourceUrl, tags, projectName, importanceScore, sourceId }).returning();
  return c.json(created, 201);
});

// PUT /v1/admin/knowledge-base/:id
knowledgeRouter.put('/v1/admin/knowledge-base/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const entryId = Number(c.req.param('id'));
  if (!entryId) return c.json({ error: 'Invalid id' }, 400);
  const [existing] = await db.select().from(knowledgeEntries).where(and(kbScope(siteId)!, eq(knowledgeEntries.id, entryId))).limit(1);
  if (!existing) return c.json({ error: 'Knowledge entry not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const fieldErrors: Record<string, string> = {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.type !== undefined) { const t = String(body.type); if (!KB_TYPES.includes(t as KbType)) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`; else updates.type = t; }
  if (body.title !== undefined) { const t = String(body.title).trim(); if (!t) fieldErrors.title = 'Must be non-empty string'; else updates.title = t; }
  if (body.content !== undefined) { const c2 = String(body.content); if (c2.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${c2.trim().length})`; else updates.content = c2; }
  if (body.source_url !== undefined) { if (body.source_url) { try { new URL(String(body.source_url)); updates.sourceUrl = String(body.source_url); } catch { fieldErrors.source_url = 'Must be a valid URL'; } } else updates.sourceUrl = null; }
  if (body.tags !== undefined) { const tags = parseTags(body.tags); const inv = tags.filter(t => !/^[a-z0-9][a-z0-9-]*$/.test(t)); if (inv.length > 0) fieldErrors.tags = `Invalid tags: ${inv.join(', ')}`; else updates.tags = tags; }
  if (body.project_name !== undefined) updates.projectName = body.project_name ? String(body.project_name) : null;
  if (body.importance_score !== undefined) { const s = Number(body.importance_score); if (Number.isNaN(s) || s < 0 || s > 100) fieldErrors.importance_score = 'Must be 0-100'; else updates.importanceScore = s; }
  if (Object.keys(fieldErrors).length > 0) return c.json({ error: 'Validation failed', fields: fieldErrors }, 400);
  const [updated] = await db.update(knowledgeEntries).set(updates).where(and(eq(knowledgeEntries.id, entryId), kbScope(siteId)!)).returning();
  return c.json(updated);
});

// DELETE /v1/admin/knowledge-base/:id
knowledgeRouter.delete('/v1/admin/knowledge-base/:id', requireAuthMiddleware, async (c) => {
  const db = c.get('db');
  if (!db) return c.json({ error: 'DB unavailable' }, 500);
  const session = c.get('session')!;
  const siteId = session.activeSiteId ?? session.siteId;
  if (!siteId) return c.json({ error: 'No active site' }, 400);
  const entryId = Number(c.req.param('id'));
  if (!entryId) return c.json({ error: 'Invalid id' }, 400);
  const [existingEntry] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(and(kbScope(siteId)!, eq(knowledgeEntries.id, entryId))).limit(1);
  if (!existingEntry) return c.json({ error: 'Knowledge entry not found' }, 404);
  await db.delete(knowledgeEntries).where(and(eq(knowledgeEntries.id, entryId), kbScope(siteId)!));
  return c.json({ success: true, deletedId: entryId });
});
