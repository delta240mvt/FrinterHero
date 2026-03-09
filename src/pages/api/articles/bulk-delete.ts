import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { inArray } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, cookies }) => {
  const sessionToken = cookies.get('session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(JSON.stringify({ error: 'No IDs provided' }), { status: 400 });
    }

    const numericIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
    await db.delete(articles).where(inArray(articles.id, numericIds));

    return new Response(JSON.stringify({ success: true, deleted: numericIds.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Articles bulk-delete]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
