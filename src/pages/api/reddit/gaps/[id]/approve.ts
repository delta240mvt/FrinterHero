import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { redditExtractedGaps, redditPosts, contentGaps } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const gap = await db.query.redditExtractedGaps.findFirst({ where: eq(redditExtractedGaps.id, id) });
  if (!gap) return new Response(JSON.stringify({ error: 'Gap not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  if (gap.status !== 'pending') return new Response(JSON.stringify({ error: 'Gap already processed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let authorNotes: string | undefined;
  try { const body = await request.json(); authorNotes = body.authorNotes; } catch {}

  // Fetch up to 3 source posts
  const postIds = (gap.sourcePostIds || []).slice(0, 3);
  let sourcePosts: any[] = [];
  if (postIds.length > 0) {
    sourcePosts = await db.select().from(redditPosts).where(inArray(redditPosts.id, postIds));
  }

  const gapDescription = [
    gap.painPointDescription,
    sourcePosts.length > 0 ? `\nReddit sources (${gap.frequency} posts):\n${sourcePosts.map(p => `• "${p.title}" [${p.subreddit}]`).join('\n')}` : '',
    gap.vocabularyQuotes.length > 0 ? `\nVoice of customer: ${gap.vocabularyQuotes.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const [newGap] = await db.insert(contentGaps).values({
    gapTitle: gap.painPointTitle,
    gapDescription,
    confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
    suggestedAngle: gap.suggestedArticleAngle,
    relatedQueries: gap.vocabularyQuotes,
    sourceModels: ['reddit-apify', 'claude-sonnet'],
    authorNotes: authorNotes || null,
    status: 'new',
  }).returning();

  await db.update(redditExtractedGaps).set({
    status: 'approved',
    approvedAt: new Date(),
    contentGapId: newGap.id,
  }).where(eq(redditExtractedGaps.id, id));

  return new Response(JSON.stringify({ ok: true, contentGapId: newGap.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
