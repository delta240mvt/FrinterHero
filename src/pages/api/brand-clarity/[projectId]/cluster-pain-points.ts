import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcExtractedPainPoints, bcPainClusters } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function runClusterer(projectId: number): Promise<{ clustersCreated: number; error?: string }> {
  return new Promise((resolve) => {
    let clustersCreated = 0;
    let stderr = '';

    const child = spawn('npx', ['tsx', 'scripts/bc-pain-clusterer.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId) },
      shell: true,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/CLUSTERS_CREATED:(\d+)/);
      if (match) clustersCreated = parseInt(match[1], 10);
    });

    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) resolve({ clustersCreated, error: stderr.slice(-500) || `exit code ${code}` });
      else resolve({ clustersCreated });
    });

    child.on('error', (err) => resolve({ clustersCreated: 0, error: err.message }));
  });
}

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  const approvedPoints = await db.select({ id: bcExtractedPainPoints.id })
    .from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));

  if (approvedPoints.length < 2) {
    return new Response(JSON.stringify({ error: 'Need at least 2 approved pain points' }), { status: 400, headers: JSON_HEADERS });
  }

  const result = await runClusterer(projectId);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: JSON_HEADERS });
  }

  // Fetch created clusters to return
  const clusters = await db.select().from(bcPainClusters).where(eq(bcPainClusters.projectId, projectId));

  return new Response(JSON.stringify({ clustersCreated: result.clustersCreated, clusters }), { headers: JSON_HEADERS });
};

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const clusters = await db.select().from(bcPainClusters).where(eq(bcPainClusters.projectId, projectId));
  return new Response(JSON.stringify({ clusters }), { headers: JSON_HEADERS });
};
