import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcLandingPageVariants } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select({ status: bcProjects.status }).from(bcProjects).where(eq(bcProjects.id, projectId));

  const variants = await db.select({
    id: bcLandingPageVariants.id,
    variantType: bcLandingPageVariants.variantType,
    variantLabel: bcLandingPageVariants.variantLabel,
    isSelected: bcLandingPageVariants.isSelected,
    generationModel: bcLandingPageVariants.generationModel,
    improvementSuggestions: bcLandingPageVariants.improvementSuggestions,
    featurePainMap: bcLandingPageVariants.featurePainMap,
    createdAt: bcLandingPageVariants.createdAt,
  }).from(bcLandingPageVariants)
    .where(eq(bcLandingPageVariants.projectId, projectId))
    .orderBy(asc(bcLandingPageVariants.createdAt));

  return new Response(JSON.stringify({ variants, projectStatus: project?.status ?? 'unknown' }), { headers: JSON_HEADERS });
};
