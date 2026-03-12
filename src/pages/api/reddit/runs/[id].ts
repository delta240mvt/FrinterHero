import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditScrapeRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // Cascade delete is handled by the database
    await db.delete(redditScrapeRuns).where(eq(redditScrapeRuns.id, id));
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
