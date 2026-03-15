import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcLandingPageVariants } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const variants = await db.select({
    id: bcLandingPageVariants.id,
    variantType: bcLandingPageVariants.variantType,
    variantLabel: bcLandingPageVariants.variantLabel,
    improvementSuggestions: bcLandingPageVariants.improvementSuggestions,
    generationModel: bcLandingPageVariants.generationModel,
    isSelected: bcLandingPageVariants.isSelected,
    createdAt: bcLandingPageVariants.createdAt,
    // Exclude htmlContent and generationPromptUsed from list view
  }).from(bcLandingPageVariants)
    .where(eq(bcLandingPageVariants.projectId, projectId))
    .orderBy(asc(bcLandingPageVariants.createdAt));

  return new Response(JSON.stringify(variants), { headers: JSON_HEADERS });
};
