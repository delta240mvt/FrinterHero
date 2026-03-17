export const prerender = false;
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shSocialAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  const deleted = await db
    .delete(shSocialAccounts)
    .where(eq(shSocialAccounts.id, id))
    .returning({ id: shSocialAccounts.id });

  if (!deleted.length) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify({ ok: true, id }), { headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const patch: Partial<typeof shSocialAccounts.$inferInsert> = {};

  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  if (body.accountName !== undefined) patch.accountName = String(body.accountName);
  if (body.accountHandle !== undefined) patch.accountHandle = body.accountHandle ? String(body.accountHandle) : null;

  if (!Object.keys(patch).length) {
    return new Response(JSON.stringify({ error: 'No updatable fields provided' }), { status: 400, headers: JSON_HEADERS });
  }

  const updated = await db
    .update(shSocialAccounts)
    .set(patch)
    .where(eq(shSocialAccounts.id, id))
    .returning();

  if (!updated.length) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  return new Response(JSON.stringify(updated[0]), { headers: JSON_HEADERS });
};
