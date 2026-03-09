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

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const validActions = ['generate_draft', 'snooze', 'archive'];
  if (!body.action || !validActions.includes(body.action)) {
    return new Response(JSON.stringify({ error: `action must be one of: ${validActions.join(', ')}` }), { status: 400 });
  }

  try {
    const [gap] = await db.select().from(contentGaps).where(eq(contentGaps.id, id)).limit(1);
    if (!gap) return new Response(JSON.stringify({ error: 'Gap not found' }), { status: 404 });
    if (gap.status === 'acknowledged') {
      return new Response(JSON.stringify({ error: 'Gap already acknowledged' }), { status: 409 });
    }

    const now = new Date();
    let newStatus = 'in_progress';
    if (body.action === 'snooze') newStatus = 'archived'; // simplified snooze = archive with note
    if (body.action === 'archive') newStatus = 'archived';

    await db.update(contentGaps)
      .set({
        status: newStatus,
        authorNotes: body.author_notes || gap.authorNotes,
        acknowledgedAt: now,
      })
      .where(eq(contentGaps.id, id));

    let draftGenerationStarted = false;
    if (body.action === 'generate_draft') {
      // Trigger draft generation asynchronously (fire and forget)
      // The actual generation is handled by POST /api/generate-draft
      draftGenerationStarted = true;
    }

    return new Response(JSON.stringify({
      gap_id: id,
      status: newStatus,
      author_notes: body.author_notes || gap.authorNotes,
      acknowledged_at: now.toISOString(),
      draft_generation_started: draftGenerationStarted,
      draft_id: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ContentGaps Acknowledge] Error:', { timestamp: new Date().toISOString(), gapId: id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
