import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { knowledgeEntries } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ params, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400 });
  }

  try {
    const [entry] = await db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).limit(1);
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Knowledge entry not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(entry), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB API GET/:id] Error:', { timestamp: new Date().toISOString(), id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ params, cookies, request }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const validTypes = ['project_spec', 'published_article', 'external_research', 'personal_note'];
  const fieldErrors: Record<string, string> = {};

  if (body.type !== undefined && !validTypes.includes(body.type)) {
    fieldErrors.type = `Must be one of: ${validTypes.join(', ')}`;
  }
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    fieldErrors.title = 'Must be non-empty string';
  }
  if (body.content !== undefined && (typeof body.content !== 'string' || body.content.trim().length < 50)) {
    fieldErrors.content = `Min 50 characters (got ${body.content?.trim()?.length || 0})`;
  }
  if (body.importance_score !== undefined) {
    const score = Number(body.importance_score);
    if (isNaN(score) || score < 0 || score > 100) fieldErrors.importance_score = 'Must be 0-100';
  }
  if (body.source_url) {
    try { new URL(body.source_url); } catch { fieldErrors.source_url = 'Must be a valid URL'; }
  }
  if (body.tags && Array.isArray(body.tags)) {
    const tagRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    const invalid = (body.tags as string[]).filter(t => !tagRegex.test(t));
    if (invalid.length > 0) fieldErrors.tags = `Invalid tags: ${invalid.join(', ')}`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return new Response(JSON.stringify({ error: 'Validation failed', fields: fieldErrors }), { status: 400 });
  }

  try {
    const [existing] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).limit(1);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Knowledge entry not found' }), { status: 404 });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.type !== undefined) updates.type = body.type;
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.content !== undefined) updates.content = body.content;
    if (body.source_url !== undefined) updates.sourceUrl = body.source_url || null;
    if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.importance_score !== undefined) updates.importanceScore = Number(body.importance_score);
    if (body.project_name !== undefined) updates.projectName = body.project_name || null;

    const [updated] = await db.update(knowledgeEntries).set(updates).where(eq(knowledgeEntries.id, id)).returning();

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB API PUT/:id] Error:', { timestamp: new Date().toISOString(), id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400 });
  }

  try {
    const [existing] = await db.select({ id: knowledgeEntries.id }).from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).limit(1);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Knowledge entry not found' }), { status: 404 });
    }

    await db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id));

    return new Response(JSON.stringify({ success: true, deleted_id: id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB API DELETE/:id] Error:', { timestamp: new Date().toISOString(), id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
