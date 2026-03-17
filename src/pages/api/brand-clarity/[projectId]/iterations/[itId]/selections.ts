/**
 * GET /api/brand-clarity/[projectId]/iterations/[itId]/selections
 * Returns the selected pain points for an iteration, ordered by rank.
 */
import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcIterations, bcIterationSelections, bcExtractedPainPoints } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';

function auth(cookies: any) { return !!cookies.get('session')?.value; }
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  const itId      = parseInt(params.itId || '0', 10);
  if (!projectId || !itId) return new Response(JSON.stringify({ error: 'Invalid ids' }), { status: 400, headers: JSON_HEADERS });

  const [iteration] = await db.select().from(bcIterations)
    .where(and(eq(bcIterations.id, itId), eq(bcIterations.projectId, projectId)));
  if (!iteration) return new Response(JSON.stringify({ error: 'Iteration not found' }), { status: 404, headers: JSON_HEADERS });

  // Join selections with pain point data
  const rows = await db
    .select({
      selId:            bcIterationSelections.id,
      rank:             bcIterationSelections.rank,
      selectionReason:  bcIterationSelections.selectionReason,
      pp: {
        id:                   bcExtractedPainPoints.id,
        painPointTitle:        bcExtractedPainPoints.painPointTitle,
        painPointDescription:  bcExtractedPainPoints.painPointDescription,
        emotionalIntensity:    bcExtractedPainPoints.emotionalIntensity,
        category:              bcExtractedPainPoints.category,
        customerLanguage:      bcExtractedPainPoints.customerLanguage,
        desiredOutcome:        bcExtractedPainPoints.desiredOutcome,
        vocabularyQuotes:      bcExtractedPainPoints.vocabularyQuotes,
        vocData:               bcExtractedPainPoints.vocData,
        status:                bcExtractedPainPoints.status,
      },
    })
    .from(bcIterationSelections)
    .innerJoin(bcExtractedPainPoints, eq(bcIterationSelections.painPointId, bcExtractedPainPoints.id))
    .where(eq(bcIterationSelections.iterationId, itId))
    .orderBy(asc(bcIterationSelections.rank));

  return new Response(JSON.stringify({ iteration, selections: rows }), { headers: JSON_HEADERS });
};
