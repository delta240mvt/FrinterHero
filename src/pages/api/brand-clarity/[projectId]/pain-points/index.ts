import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcExtractedPainPoints } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // pending | approved | rejected | all

  const condition = statusFilter && statusFilter !== 'all'
    ? and(eq(bcExtractedPainPoints.projectId, projectId), eq(bcExtractedPainPoints.status, statusFilter))
    : eq(bcExtractedPainPoints.projectId, projectId);

  const painPoints = await db.select().from(bcExtractedPainPoints)
    .where(condition)
    .orderBy(desc(bcExtractedPainPoints.emotionalIntensity));

  return new Response(JSON.stringify(painPoints), { headers: JSON_HEADERS });
};
