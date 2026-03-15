import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { spawn } from 'child_process';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projects = await db.select().from(bcProjects).orderBy(desc(bcProjects.createdAt));
  return new Response(JSON.stringify(projects), { headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { name, founderDescription, lpRawInput, projectDocumentation } = body;
  if (!name?.trim() || !founderDescription?.trim() || !lpRawInput?.trim()) {
    return new Response(JSON.stringify({ error: 'name, founderDescription, lpRawInput required' }), { status: 400, headers: JSON_HEADERS });
  }

  const [project] = await db.insert(bcProjects).values({
    name: name.trim().substring(0, 255),
    founderDescription: founderDescription.trim(),
    lpRawInput: lpRawInput.trim(),
    projectDocumentation: projectDocumentation?.trim() || null,
    status: 'draft',
  }).returning();

  // Spawn LP parser asynchronously (non-blocking — client polls status)
  spawn('npx', ['tsx', 'scripts/bc-lp-parser.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, BC_PROJECT_ID: String(project.id) },
    shell: true,
    detached: false,
  });

  return new Response(JSON.stringify({ project, parsingStarted: true }), { status: 201, headers: JSON_HEADERS });
};
