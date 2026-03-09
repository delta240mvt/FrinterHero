import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { contentGaps } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid gap id' }), { status: 400 });
  }

  let body: any = {};
  try { body = await request.json(); } catch {}

  try {
    const [gap] = await db.select({ id: contentGaps.id, status: contentGaps.status }).from(contentGaps).where(eq(contentGaps.id, id)).limit(1);
    if (!gap) return new Response(JSON.stringify({ error: 'Gap not found' }), { status: 404 });

    const now = new Date();
    await db.update(contentGaps)
      .set({ status: 'archived', acknowledgedAt: now })
      .where(eq(contentGaps.id, id));

    return new Response(JSON.stringify({
      gap_id: id,
      status: 'archived',
      archived_at: now.toISOString(),
      reason: body.reason || null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ContentGaps Archive] Error:', { timestamp: new Date().toISOString(), gapId: id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
