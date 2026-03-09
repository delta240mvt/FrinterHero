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
