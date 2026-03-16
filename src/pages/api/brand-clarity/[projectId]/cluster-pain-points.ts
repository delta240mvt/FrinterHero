import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcExtractedPainPoints, bcPainClusters } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';
import { getBcSettings, buildLlmEnv } from '@/lib/bc-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function runClusterer(projectId: number, extraEnv: Record<string, string>): Promise<{ clustersCreated: number; logs: string[]; error?: string }> {
  return new Promise((resolve) => {
    let clustersCreated = 0;
    const logs: string[] = [];
    let buf = '';

    const child = spawn('npx', ['tsx', 'scripts/bc-pain-clusterer.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId), ...extraEnv },
      shell: true,
    });

    const onChunk = (chunk: Buffer) => {
      buf += chunk.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/CLUSTERS_CREATED:(\d+)/);
        if (match) clustersCreated = parseInt(match[1], 10);
        logs.push(trimmed);
      }
    };

    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    child.on('close', (code) => {
      if (buf.trim()) logs.push(buf.trim());
      if (code !== 0) resolve({ clustersCreated, logs, error: logs.slice(-3).join(' | ') || `exit code ${code}` });
      else resolve({ clustersCreated, logs });
    });

    child.on('error', (err) => resolve({ clustersCreated: 0, logs, error: err.message }));
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

  const llmSettings = await getBcSettings();
  const result = await runClusterer(projectId, buildLlmEnv(llmSettings));
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error, logs: result.logs }), { status: 500, headers: JSON_HEADERS });
  }

  // Fetch created clusters to return
  const clusters = await db.select().from(bcPainClusters).where(eq(bcPainClusters.projectId, projectId));

  return new Response(JSON.stringify({ clustersCreated: result.clustersCreated, logs: result.logs, clusters }), { headers: JSON_HEADERS });
};

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const clusters = await db.select().from(bcPainClusters).where(eq(bcPainClusters.projectId, projectId));
  return new Response(JSON.stringify({ clusters }), { headers: JSON_HEADERS });
};
