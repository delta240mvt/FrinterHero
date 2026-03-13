import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytExtractedGaps, ytComments, contentGaps } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const gap = await db.query.ytExtractedGaps.findFirst({ where: eq(ytExtractedGaps.id, id) });
  if (!gap) return new Response(JSON.stringify({ error: 'Gap not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  if (!['pending', 'rejected'].includes(gap.status)) return new Response(JSON.stringify({ error: 'Gap already processed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let authorNotes: string | undefined;
  try { const body = await request.json(); authorNotes = body.authorNotes; } catch {}

  // Fetch up to 5 source comments for context
  const commentIds = (gap.sourceCommentIds || []).slice(0, 5);
  let sourceComments: any[] = [];
  if (commentIds.length > 0) {
    sourceComments = await db.select({
      commentText: ytComments.commentText,
      author: ytComments.author,
      voteCount: ytComments.voteCount,
    }).from(ytComments).where(inArray(ytComments.id, commentIds));
  }

  const gapDescription = [
    gap.painPointDescription,
    gap.sourceVideoTitle ? `\nSource video: "${gap.sourceVideoTitle}"` : '',
    sourceComments.length > 0
      ? `\nSource comments (${gap.frequency} total):\n${sourceComments.map(c => `• "${c.commentText.substring(0, 150)}" (${c.voteCount} votes)`).join('\n')}`
      : '',
    gap.vocabularyQuotes.length > 0
      ? `\nVoice of customer: ${gap.vocabularyQuotes.join(', ')}`
      : '',
    authorNotes ? `\nAuthor notes: ${authorNotes}` : '',
  ].filter(Boolean).join('\n');

  const [newGap] = await db.insert(contentGaps).values({
    gapTitle: gap.painPointTitle,
    gapDescription,
    confidenceScore: Math.min(100, gap.emotionalIntensity * 10),
    suggestedAngle: gap.suggestedArticleAngle,
    relatedQueries: gap.vocabularyQuotes,
    sourceModels: ['youtube-apify', 'claude-sonnet'],
    authorNotes: authorNotes || null,
    status: 'new',
  }).returning();

  await db.update(ytExtractedGaps).set({
    status: 'approved',
    approvedAt: new Date(),
    contentGapId: newGap.id,
  }).where(eq(ytExtractedGaps.id, id));

  return new Response(JSON.stringify({ ok: true, contentGapId: newGap.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
