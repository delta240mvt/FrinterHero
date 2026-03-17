export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shGeneratedCopy, shContentBriefs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, cookies, request }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const briefId = parseInt(params.id || '0', 10);
  if (!briefId) {
    return new Response(JSON.stringify({ error: 'Invalid brief id' }), { status: 400, headers: JSON_HEADERS });
  }

  const body = await request.json().catch(() => ({})) as {
    hookLine?: string;
    bodyText?: string;
    hashtags?: string[];
    cta?: string;
    status?: 'approved' | 'rejected';
    copyId: number;
  };

  const copyId = parseInt(String(body?.copyId || '0'), 10);
  if (!copyId) {
    return new Response(JSON.stringify({ error: 'copyId is required' }), { status: 400, headers: JSON_HEADERS });
  }

  // Build update payload — only include fields that were provided
  const updateFields: Record<string, any> = {};
  if (body.hookLine !== undefined) updateFields.hookLine = body.hookLine;
  if (body.bodyText !== undefined) updateFields.bodyText = body.bodyText;
  if (body.hashtags !== undefined) updateFields.hashtags = body.hashtags;
  if (body.cta !== undefined) updateFields.cta = body.cta;
  if (body.status !== undefined) updateFields.status = body.status;

  // Mark as edited if any content field changed
  if (body.hookLine !== undefined || body.bodyText !== undefined || body.hashtags !== undefined || body.cta !== undefined) {
    updateFields.isEdited = true;
    updateFields.editedAt = new Date();
  }

  if (Object.keys(updateFields).length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db
    .update(shGeneratedCopy)
    .set(updateFields)
    .where(and(eq(shGeneratedCopy.id, copyId), eq(shGeneratedCopy.briefId, briefId)))
    .returning();

  if (!updated) {
    return new Response(JSON.stringify({ error: 'Copy record not found' }), { status: 404, headers: JSON_HEADERS });
  }

  // If approved, advance the brief status to 'rendering'
  if (body.status === 'approved') {
    await db
      .update(shContentBriefs)
      .set({ status: 'rendering' })
      .where(eq(shContentBriefs.id, briefId));
  }

  return new Response(JSON.stringify(updated), { headers: JSON_HEADERS });
};
