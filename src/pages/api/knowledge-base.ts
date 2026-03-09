import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { knowledgeEntries, knowledgeSources } from '@/db/schema';
import { eq, and, desc, or, sql, ilike } from 'drizzle-orm';

// GET /api/knowledge-base — list entries with search, filter, pagination
export const GET: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const tagsParam = url.searchParams.get('tags') || '';
  const type = url.searchParams.get('type') || '';
  const sortBy = url.searchParams.get('sort_by') || 'importance';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  if (isNaN(limit) || isNaN(offset) || limit < 0 || offset < 0) {
    return new Response(JSON.stringify({ error: 'Invalid limit or offset' }), { status: 400 });
  }

  try {
    const conditions: any[] = [];

    if (type) conditions.push(eq(knowledgeEntries.type, type));

    if (tagsParam) {
      const tagList = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      for (const tag of tagList) {
        conditions.push(sql`${knowledgeEntries.tags} @> ARRAY[${tag}]::text[]`);
      }
    }

    if (search) {
      conditions.push(
        or(
          ilike(knowledgeEntries.title, `%${search}%`),
          sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${search})`
        )!
      );
    }

    const orderBy = sortBy === 'recency'
      ? desc(knowledgeEntries.createdAt)
      : desc(knowledgeEntries.importanceScore);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [entries, countResult] = await Promise.all([
      db.select()
        .from(knowledgeEntries)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` })
        .from(knowledgeEntries)
        .where(whereClause),
    ]);

    return new Response(JSON.stringify({
      entries,
      pagination: {
        total: Number(countResult[0]?.count || 0),
        limit,
        offset,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB API GET] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};

// POST /api/knowledge-base — create KB entry
export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const validTypes = ['project_spec', 'published_article', 'external_research', 'personal_note'];
  const fieldErrors: Record<string, string> = {};

  if (!body.type || !validTypes.includes(body.type)) {
    fieldErrors.type = `Must be one of: ${validTypes.join(', ')}`;
  }
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    fieldErrors.title = 'Required and must be non-empty';
  }
  if (!body.content || typeof body.content !== 'string' || body.content.trim().length < 50) {
    fieldErrors.content = `Min 50 characters (got ${body.content?.trim()?.length || 0})`;
  }
  if (body.importance_score !== undefined) {
    const score = Number(body.importance_score);
    if (isNaN(score) || score < 0 || score > 100) {
      fieldErrors.importance_score = 'Must be 0-100';
    }
  }
  if (body.source_url) {
    try { new URL(body.source_url); } catch {
      fieldErrors.source_url = 'Must be a valid URL';
    }
  }
  if (body.tags && Array.isArray(body.tags)) {
    const tagRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    const invalid = (body.tags as string[]).filter(t => !tagRegex.test(t));
    if (invalid.length > 0) {
      fieldErrors.tags = `Tags must be lowercase alphanumeric with hyphens. Invalid: ${invalid.join(', ')}`;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return new Response(JSON.stringify({ error: 'Validation failed', fields: fieldErrors }), { status: 400 });
  }

  try {
    const sourceId = body.source_id ? parseInt(body.source_id, 10) : null;

    // Duplicate check: same title + source_id
    const existing = await db.select({ id: knowledgeEntries.id })
      .from(knowledgeEntries)
      .where(
        sourceId
          ? and(eq(knowledgeEntries.title, body.title.trim()), eq(knowledgeEntries.sourceId, sourceId))
          : and(eq(knowledgeEntries.title, body.title.trim()), sql`${knowledgeEntries.sourceId} IS NULL`)
      )
      .limit(1);

    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: 'Duplicate entry detected', existing_id: existing[0].id }), { status: 409 });
    }

    const [entry] = await db.insert(knowledgeEntries).values({
      type: body.type,
      title: body.title.trim(),
      content: body.content,
      sourceUrl: body.source_url || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      importanceScore: body.importance_score !== undefined ? Number(body.importance_score) : 50,
      sourceId: sourceId || null,
    }).returning();

    return new Response(JSON.stringify(entry), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB API POST] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
