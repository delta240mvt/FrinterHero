export const prerender = false;
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shSocialAccounts } from '@/db/schema';
import { desc, asc } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const accounts = await db
    .select()
    .from(shSocialAccounts)
    .orderBy(asc(shSocialAccounts.platform), desc(shSocialAccounts.createdAt));

  return new Response(JSON.stringify(accounts), { headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body.platform || !body.accountName) {
    return new Response(JSON.stringify({ error: 'platform and accountName are required' }), { status: 400, headers: JSON_HEADERS });
  }

  const inserted = await db
    .insert(shSocialAccounts)
    .values({
      platform: String(body.platform),
      accountName: String(body.accountName),
      accountHandle: body.accountHandle ? String(body.accountHandle) : null,
      authPayload: body.authPayload ?? null,
      isActive: true,
    })
    .returning();

  return new Response(JSON.stringify(inserted[0]), { status: 201, headers: JSON_HEADERS });
};
