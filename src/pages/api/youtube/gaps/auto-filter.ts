
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { ytExtractedGaps } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { findOffBrandMatch } from '@/utils/brandFilter';

export const POST: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // 1. Fetch all pending gaps
  const pendingGaps = await db.select()
    .from(ytExtractedGaps)
    .where(eq(ytExtractedGaps.status, 'pending'));

  // 2. Identify matches
  const rejectedIds: number[] = [];
  const matchesDetails: { id: number; keyword: string }[] = [];

  for (const gap of pendingGaps) {
    const match = findOffBrandMatch(
      gap.painPointTitle, 
      gap.painPointDescription, 
      gap.vocabularyQuotes || [],
      gap.emotionalIntensity
    );
    
    if (match) {
      rejectedIds.push(gap.id);
      matchesDetails.push({ id: gap.id, keyword: match });
    }
  }

  // 3. Batch update to 'rejected'
  if (rejectedIds.length > 0) {
    await db.update(ytExtractedGaps)
      .set({ 
        status: 'rejected',
        rejectedAt: new Date()
      })
      .where(inArray(ytExtractedGaps.id, rejectedIds));
  }

  return new Response(JSON.stringify({ 
    success: true, 
    processed: pendingGaps.length,
    rejectedCount: rejectedIds.length,
    matches: matchesDetails
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
