import type { APIRoute } from 'astro';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '@/db/client';
import { geoRuns } from '@/db/schema';
import { desc } from 'drizzle-orm';

const execPromise = promisify(exec);

export const POST: APIRoute = async ({ cookies }) => {
  const session = cookies.get('session')?.value;
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const startTime = new Date();
  console.log(`[GEO/run] Manual run triggered at ${startTime.toISOString()}`);

  try {
    const { stdout, stderr } = await execPromise('npx tsx scripts/geo-monitor.ts');
    if (stderr) console.error('[GEO/run] stderr:', stderr);
    console.log('[GEO/run] stdout:', stdout.slice(0, 500));

    // Fetch results from latest geoRun record
    const [latestRun] = await db.select().from(geoRuns).orderBy(desc(geoRuns.runAt)).limit(1);

    return new Response(JSON.stringify({
      success: true,
      gaps_found: latestRun?.gapsFound || 0,
      gaps_deduped: latestRun?.gapsDeduped || 0,
      queries_count: latestRun?.queriesCount || 0,
      run_at: latestRun?.runAt?.toISOString() || startTime.toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[GEO/run] Failed:', { timestamp: new Date().toISOString(), error: err.message });
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
