import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcTargetChannels } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function runVideoDiscovery(projectId: number): Promise<{ videosFound: number; error?: string; logs: string[] }> {
  return new Promise((resolve) => {
    let videosFound = 0;
    let stderr = '';
    const logs: string[] = [];

    const child = spawn('npx', ['tsx', 'scripts/bc-video-discovery.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId) },
      shell: true,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) { if (line.trim()) logs.push(line.trim()); }
      const match = text.match(/VIDEOS_FOUND:(\d+)/);
      if (match) videosFound = parseInt(match[1], 10);
      if (text.includes('QUOTA_EXCEEDED')) resolve({ videosFound: 0, error: 'QUOTA_EXCEEDED', logs });
    });

    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) resolve({ videosFound, error: stderr.slice(-500) || `exit code ${code}`, logs });
      else resolve({ videosFound, logs });
    });

    child.on('error', (err) => resolve({ videosFound: 0, error: err.message, logs }));
  });
}

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  const confirmed = await db.select({ id: bcTargetChannels.id })
    .from(bcTargetChannels)
    .where(and(eq(bcTargetChannels.projectId, projectId), eq(bcTargetChannels.isConfirmed, true)));

  if (!confirmed.length) {
    return new Response(JSON.stringify({ error: 'No confirmed channels — confirm channels first' }), { status: 400, headers: JSON_HEADERS });
  }

  const result = await runVideoDiscovery(projectId);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error, logs: result.logs }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ videosFound: result.videosFound, logs: result.logs }), { headers: JSON_HEADERS });
};
