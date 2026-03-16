import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const id = parseInt(params.id || '0', 10);
  if (!id) return new Response(JSON.stringify({ error: 'Invalid id' }), { status: 400, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body.projectDocumentation?.trim()) {
    return new Response(JSON.stringify({ error: 'projectDocumentation required' }), { status: 400, headers: JSON_HEADERS });
  }

  const [updated] = await db.update(bcProjects).set({
    projectDocumentation: body.projectDocumentation.trim(),
    status: 'draft',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, id)).returning();

  if (!updated) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });

  // Re-run LP parser to incorporate documentation
  const llmSettings = await getBcSettings();
  spawn('npx', ['tsx', 'scripts/bc-lp-parser.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, BC_PROJECT_ID: String(id), ...buildLlmEnv(llmSettings) },
    shell: true,
    detached: false,
  });

  return new Response(JSON.stringify({ updated: true, parsingStarted: true }), { headers: JSON_HEADERS });
};
