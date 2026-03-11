import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditTargets } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const targets = await db.select().from(redditTargets).orderBy(desc(redditTargets.priority));
  return new Response(JSON.stringify({ targets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!body.type || !['subreddit','keyword_search'].includes(body.type)) {
    return new Response(JSON.stringify({ error: 'type must be subreddit or keyword_search' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!body.value?.trim() || !body.label?.trim()) {
    return new Response(JSON.stringify({ error: 'value and label required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const [target] = await db.insert(redditTargets).values({
    type: body.type,
    value: body.value.trim(),
    label: body.label.trim(),
    priority: parseInt(body.priority || '50', 10),
    isActive: body.isActive !== false,
  }).returning();

  return new Response(JSON.stringify({ target }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
