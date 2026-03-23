import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, toPositiveInt, toNonNegativeInt, parseTags,
  requireActiveSite, kbScope, KB_TYPES,
  db, and, desc, eq, ilike, isNull, or, sql, knowledgeEntries, knowledgeSources,
} from '../helpers.js';
import { importMarkdownFiles } from '../../../../src/utils/kb-importer';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, url, pathname, segments } = ctx;

  if (method === 'GET' && pathname === '/v1/admin/knowledge-base') {
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const search = url.searchParams.get('search')?.trim() ?? '';
    const tagsParam = url.searchParams.get('tags')?.trim() ?? '';
    const type = url.searchParams.get('type')?.trim() ?? '';
    const sortBy = url.searchParams.get('sort_by') ?? 'importance';
    const limit = toPositiveInt(url.searchParams.get('limit'), 20, { max: 100 });
    const offset = toNonNegativeInt(url.searchParams.get('offset'), 0, 5000);
    const conditions: any[] = [kbScope(site.id)];
    if (type) conditions.push(eq(knowledgeEntries.type, type));
    if (tagsParam) for (const tag of tagsParam.split(',').map((entry) => entry.trim()).filter(Boolean)) conditions.push(sql`${knowledgeEntries.tags} @> ARRAY[${tag}]::text[]`);
    if (search) conditions.push(or(ilike(knowledgeEntries.title, `%${search}%`), sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${search})`));
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const orderBy = sortBy === 'recency' ? desc(knowledgeEntries.createdAt) : desc(knowledgeEntries.importanceScore);
    const [rows, totals] = await Promise.all([
      db.select().from(knowledgeEntries).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(knowledgeEntries).where(whereClause),
    ]);
    json(res, 200, { entries: rows, pagination: { total: totals[0]?.total ?? 0, limit, offset } });
    return true;
  }

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' }), true;
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [entry] = await db.select().from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!entry) return json(res, 404, { error: 'Knowledge entry not found' }), true;
    json(res, 200, entry);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/knowledge-base') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const fieldErrors: Record<string, string> = {};
    const type = typeof body.type === 'string' ? body.type : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const sourceUrl = body.source_url ? String(body.source_url) : null;
    const tags = parseTags(body.tags);
    const projectName = body.project_name ? String(body.project_name) : null;
    const sourceId = body.source_id ? Number(body.source_id) : null;
    const importanceScore = body.importance_score === undefined ? 50 : Number(body.importance_score);
    if (!KB_TYPES.includes(type as (typeof KB_TYPES)[number])) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`;
    if (!title) fieldErrors.title = 'Required and must be non-empty';
    if (!content || content.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${content.trim().length})`;
    if (Number.isNaN(importanceScore) || importanceScore < 0 || importanceScore > 100) fieldErrors.importance_score = 'Must be 0-100';
    if (sourceUrl) { try { new URL(sourceUrl); } catch { fieldErrors.source_url = 'Must be a valid URL'; } }
    const invalidTags = tags.filter((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag));
    if (invalidTags.length > 0) fieldErrors.tags = `Invalid tags: ${invalidTags.join(', ')}`;
    if (Object.keys(fieldErrors).length > 0) return json(res, 400, { error: 'Validation failed', fields: fieldErrors }), true;
    const duplicateFilter = sourceId ? and(eq(knowledgeEntries.title, title), eq(knowledgeEntries.sourceId, sourceId), kbScope(site.id)) : and(eq(knowledgeEntries.title, title), isNull(knowledgeEntries.sourceId), kbScope(site.id));
    const [duplicate] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(duplicateFilter).limit(1);
    if (duplicate) return json(res, 409, { error: 'Duplicate entry detected', existingId: duplicate.id }), true;
    const [created] = await db.insert(knowledgeEntries).values({ siteId: site.id, type, title, content, sourceUrl, tags, projectName, importanceScore, sourceId }).returning();
    json(res, 201, created);
    return true;
  }

  if (method === 'POST' && pathname === '/v1/admin/knowledge-base/import') {
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const folderName = typeof body.folderName === 'string' && body.folderName.trim() ? body.folderName.trim() : null;
    const files = Array.isArray(body.files)
      ? body.files
          .map((file) => ({ filename: typeof file?.filename === 'string' ? file.filename : '', content: typeof file?.content === 'string' ? file.content : '' }))
          .filter((file) => file.filename.endsWith('.md') && file.content)
      : [];
    if (files.length === 0) return json(res, 400, { error: 'No .md files provided' }), true;
    const { valid, errors } = importMarkdownFiles(files);
    const sourceName = `batch-import-${Date.now()}`;
    const [source] = await db.insert(knowledgeSources).values({ siteId: site.id, sourceType: 'imported_markdown', sourceName, status: 'active' }).returning();
    let successCount = 0;
    const failedEntries = [...errors.map((entry) => ({ filename: entry.filename, reason: entry.errors.join('; ') }))];
    for (const entry of valid) {
      try {
        const existing = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.title, entry.title), eq(knowledgeEntries.sourceId, source.id))).limit(1);
        if (existing.length > 0) { failedEntries.push({ filename: entry.filename, reason: 'Duplicate entry (same title + source)' }); continue; }
        await db.insert(knowledgeEntries).values({ siteId: site.id, type: entry.type, title: entry.title, content: entry.content, tags: entry.tags, projectName: folderName || entry.projectName || null, importanceScore: entry.importanceScore, sourceUrl: entry.sourceUrl || null, sourceId: source.id });
        successCount += 1;
      } catch (error) {
        console.error('[KB Import] Failed to insert entry:', { filename: entry.filename, error });
        failedEntries.push({ filename: entry.filename, reason: 'Database insertion error' });
      }
    }
    json(res, 200, { total_files: files.length, successful: successCount, failed: failedEntries.length, source_id: source.id, errors: failedEntries });
    return true;
  }

  if (method === 'PUT' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' }), true;
    const body = await readJsonBody(req);
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existing] = await db.select().from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Knowledge entry not found' }), true;
    const fieldErrors: Record<string, string> = {};
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.type !== undefined) { const type = String(body.type); if (!KB_TYPES.includes(type as (typeof KB_TYPES)[number])) fieldErrors.type = `Must be one of: ${KB_TYPES.join(', ')}`; else updates.type = type; }
    if (body.title !== undefined) { const title = String(body.title).trim(); if (!title) fieldErrors.title = 'Must be non-empty string'; else updates.title = title; }
    if (body.content !== undefined) { const content = String(body.content); if (content.trim().length < 50) fieldErrors.content = `Min 50 characters (got ${content.trim().length})`; else updates.content = content; }
    if (body.source_url !== undefined) { if (body.source_url) { try { new URL(String(body.source_url)); updates.sourceUrl = String(body.source_url); } catch { fieldErrors.source_url = 'Must be a valid URL'; } } else updates.sourceUrl = null; }
    if (body.tags !== undefined) { const tags = parseTags(body.tags); const invalidTags = tags.filter((tag) => !/^[a-z0-9][a-z0-9-]*$/.test(tag)); if (invalidTags.length > 0) fieldErrors.tags = `Invalid tags: ${invalidTags.join(', ')}`; else updates.tags = tags; }
    if (body.project_name !== undefined) updates.projectName = body.project_name ? String(body.project_name) : null;
    if (body.importance_score !== undefined) { const importanceScore = Number(body.importance_score); if (Number.isNaN(importanceScore) || importanceScore < 0 || importanceScore > 100) fieldErrors.importance_score = 'Must be 0-100'; else updates.importanceScore = importanceScore; }
    if (Object.keys(fieldErrors).length > 0) return json(res, 400, { error: 'Validation failed', fields: fieldErrors }), true;
    const [updated] = await db.update(knowledgeEntries).set(updates).where(and(eq(knowledgeEntries.id, entryId), kbScope(site.id))).returning();
    json(res, 200, updated);
    return true;
  }

  if (method === 'DELETE' && segments[0] === 'v1' && segments[1] === 'admin' && segments[2] === 'knowledge-base' && segments[3]) {
    const entryId = Number(segments[3]);
    if (!entryId) return json(res, 400, { error: 'Invalid id' }), true;
    const context = await requireActiveSite(req, res);
    if (!context) return true;
    const { site } = context;
    const [existing] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(and(kbScope(site.id), eq(knowledgeEntries.id, entryId))).limit(1);
    if (!existing) return json(res, 404, { error: 'Knowledge entry not found' }), true;
    await db.delete(knowledgeEntries).where(and(eq(knowledgeEntries.id, entryId), kbScope(site.id)));
    json(res, 200, { success: true, deletedId: entryId });
    return true;
  }

  return false;
}
