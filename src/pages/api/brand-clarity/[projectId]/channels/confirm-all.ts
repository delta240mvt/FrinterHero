import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcTargetChannels, bcProjects } from '@/db/schema';
import { eq } from 'drizzle-orm';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  await db.update(bcTargetChannels).set({ isConfirmed: true })
    .where(eq(bcTargetChannels.projectId, projectId));

  await db.update(bcProjects).set({ status: 'videos_pending', updatedAt: new Date() })
    .where(eq(bcProjects.id, projectId));

  const confirmed = await db.select({ id: bcTargetChannels.id })
    .from(bcTargetChannels).where(eq(bcTargetChannels.projectId, projectId));

  return new Response(JSON.stringify({ confirmed: confirmed.length }), { headers: JSON_HEADERS });
};
