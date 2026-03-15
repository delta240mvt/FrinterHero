import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { bcProjects, bcExtractedPainPoints } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { spawn } from 'child_process';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function runLpGenerator(projectId: number): Promise<{ variantsGenerated: number; error?: string }> {
  return new Promise((resolve) => {
    let variantsGenerated = 0;
    let stderr = '';

    const child = spawn('npx', ['tsx', 'scripts/bc-lp-generator.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId) },
      shell: true,
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/VARIANTS_GENERATED:(\d+)/);
      if (match) variantsGenerated = parseInt(match[1], 10);
    });

    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code !== 0) resolve({ variantsGenerated, error: stderr.slice(-500) || `exit code ${code}` });
      else resolve({ variantsGenerated });
    });

    child.on('error', (err) => resolve({ variantsGenerated: 0, error: err.message }));
  });
}

export const POST: APIRoute = async ({ params, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  const projectId = parseInt(params.projectId || '0', 10);
  if (!projectId) return new Response(JSON.stringify({ error: 'Invalid projectId' }), { status: 400, headers: JSON_HEADERS });

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, projectId));
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: JSON_HEADERS });

  if (!project.lpStructureJson) {
    return new Response(JSON.stringify({ error: 'lpStructureJson missing — run LP parser first' }), { status: 400, headers: JSON_HEADERS });
  }

  const approvedCount = await db.select({ id: bcExtractedPainPoints.id })
    .from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, projectId),
      eq(bcExtractedPainPoints.status, 'approved'),
    ));

  if (!approvedCount.length) {
    return new Response(JSON.stringify({ error: 'No approved pain points — approve pain points first' }), { status: 400, headers: JSON_HEADERS });
  }

  // Update status to generating
  await db.update(bcProjects).set({ status: 'generating', updatedAt: new Date() })
    .where(eq(bcProjects.id, projectId));

  const result = await runLpGenerator(projectId);
  if (result.error) {
    await db.update(bcProjects).set({ status: 'pain_points_pending', updatedAt: new Date() })
      .where(eq(bcProjects.id, projectId));
    return new Response(JSON.stringify({ error: result.error }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ variantsGenerated: result.variantsGenerated }), { headers: JSON_HEADERS });
};
