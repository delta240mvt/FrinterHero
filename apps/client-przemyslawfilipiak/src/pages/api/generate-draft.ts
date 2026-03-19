import type { APIRoute } from 'astro';
import { draftJob } from '@/lib/draft-job';

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { gap_id, author_notes, model } = body;

  if (!gap_id) {
    return new Response(JSON.stringify({ error: 'gap_id is required' }), { status: 400 });
  }

  const result = draftJob.start(Number(gap_id), author_notes || '', model || 'anthropic/claude-sonnet-4-6');

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), { status: 409 });
  }

  return new Response(JSON.stringify({ success: true, message: 'Draft generation started in background' }), { status: 202 });
};

export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  return new Response(JSON.stringify(draftJob.getSnapshot()), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const success = draftJob.stop();
  return new Response(JSON.stringify({ success }), { status: 200 });
};
