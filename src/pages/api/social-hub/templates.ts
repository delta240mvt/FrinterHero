export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shTemplates } from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import { getDefaultTemplates } from '@/lib/sh-image-gen';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── GET: List all active templates, seeding defaults on first call ───────────

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    // Seed defaults if table is empty
    const [{ value: total }] = await db.select({ value: count() }).from(shTemplates);

    if (total === 0) {
      const defaults = getDefaultTemplates();
      await db.insert(shTemplates).values(defaults);
    }

    const templates = await db
      .select()
      .from(shTemplates)
      .where(eq(shTemplates.isActive, true))
      .orderBy(shTemplates.id);

    return new Response(JSON.stringify(templates), { headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Templates GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── POST: Create a new template ──────────────────────────────────────────────

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: {
    name: string;
    slug: string;
    category: string;
    aspectRatio: string;
    jsxTemplate: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  const { name, slug, category, aspectRatio, jsxTemplate } = body;

  if (!name || !slug || !category || !aspectRatio || !jsxTemplate) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: name, slug, category, aspectRatio, jsxTemplate' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    const [created] = await db
      .insert(shTemplates)
      .values({ name, slug, category, aspectRatio, jsxTemplate })
      .returning();

    return new Response(JSON.stringify(created), { status: 201, headers: JSON_HEADERS });
  } catch (err: any) {
    // Unique constraint on slug
    if (err?.code === '23505' || String(err?.message).includes('unique')) {
      return new Response(
        JSON.stringify({ error: `Template slug "${slug}" already exists` }),
        { status: 409, headers: JSON_HEADERS },
      );
    }
    console.error('[SocialHub Templates POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// ── PUT: Update an existing template ─────────────────────────────────────────

export const PUT: APIRoute = async ({ request, url, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const idParam = url.searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(id) || id <= 0) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid ?id= query parameter' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  let body: Partial<{
    name: string;
    slug: string;
    category: string;
    aspectRatio: string;
    jsxTemplate: string;
    previewUrl: string;
    isActive: boolean;
  }>;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body || Object.keys(body).length === 0) {
    return new Response(JSON.stringify({ error: 'Request body is empty' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    // Verify template exists
    const [existing] = await db
      .select()
      .from(shTemplates)
      .where(eq(shTemplates.id, id))
      .limit(1);

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404, headers: JSON_HEADERS });
    }

    // Build update payload with only provided fields
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined)        updateData.name        = body.name;
    if (body.slug !== undefined)        updateData.slug        = body.slug;
    if (body.category !== undefined)    updateData.category    = body.category;
    if (body.aspectRatio !== undefined) updateData.aspectRatio = body.aspectRatio;
    if (body.jsxTemplate !== undefined) updateData.jsxTemplate = body.jsxTemplate;
    if (body.previewUrl !== undefined)  updateData.previewUrl  = body.previewUrl;
    if (body.isActive !== undefined)    updateData.isActive    = body.isActive;

    const [updated] = await db
      .update(shTemplates)
      .set(updateData)
      .where(eq(shTemplates.id, id))
      .returning();

    return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
  } catch (err: any) {
    if (err?.code === '23505' || String(err?.message).includes('unique')) {
      return new Response(
        JSON.stringify({ error: `Template slug "${body.slug}" already exists` }),
        { status: 409, headers: JSON_HEADERS },
      );
    }
    console.error('[SocialHub Templates PUT]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
