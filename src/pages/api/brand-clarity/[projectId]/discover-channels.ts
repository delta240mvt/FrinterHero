import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { spawn } from 'child_process';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Runs bc-channel-discovery.ts and waits for completion. Returns { channelsFound, error }. */
function runChannelDiscovery(projectId: number): Promise<{ channelsFound: number; error?: string }> {
  return new Promise((resolve) => {
    let channelsFound = 0;
    let stderr = '';

    const child = spawn('npx', ['tsx', 'scripts/bc-channel-discovery.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId) },
      shell: true,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/CHANNELS_FOUND:(\d+)/);
      if (match) channelsFound = parseInt(match[1], 10);
      if (text.includes('QUOTA_EXCEEDED')) resolve({ channelsFound: 0, error: 'QUOTA_EXCEEDED' });
    });

    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) resolve({ channelsFound, error: stderr.slice(-500) || `exit code ${code}` });
      else resolve({ channelsFound });
    });

    child.on('error', (err) => resolve({ channelsFound: 0, error: err.message }));
  });
}

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  if (!project.nicheKeywords || !(project.nicheKeywords as string[]).length) {
    return new Response(JSON.stringify({ error: 'nicheKeywords not set — run LP parser first' }), { status: 400, headers: JSON_HEADERS });
  }

  const result = await runChannelDiscovery(projectId);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ channelsFound: result.channelsFound }), { headers: JSON_HEADERS });
};
