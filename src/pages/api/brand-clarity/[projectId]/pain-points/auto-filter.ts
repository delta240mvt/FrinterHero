import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcExtractedPainPoints } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { findOffBrandMatch } from '@/utils/brandFilter';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const pending = await db.select().from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      eq(bcExtractedPainPoints.status, 'pending'),
    ));

  let rejected = 0;
  let approved = 0;

  for (const pp of pending) {
    const offBrand = findOffBrandMatch(
      pp.painPointTitle,
      pp.painPointDescription,
      pp.vocabularyQuotes,
      pp.emotionalIntensity,
    );

    const newStatus = offBrand ? 'rejected' : 'approved';
    await db.update(bcExtractedPainPoints).set({ status: newStatus })
      .where(eq(bcExtractedPainPoints.id, pp.id));

    if (offBrand) rejected++;
    else approved++;
  }

  return new Response(JSON.stringify({ processed: pending.length, approved, rejected }), { headers: JSON_HEADERS });
};
