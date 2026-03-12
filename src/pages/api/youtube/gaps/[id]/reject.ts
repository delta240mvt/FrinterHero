import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytExtractedGaps } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  await db.update(ytExtractedGaps).set({
    status: 'rejected',
    rejectedAt: new Date(),
  }).where(eq(ytExtractedGaps.id, id));

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
