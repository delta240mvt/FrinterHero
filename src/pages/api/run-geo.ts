import type { APIRoute } from 'astro';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export const POST: APIRoute = async ({ request, cookies }) => {
    // Simple session check (consistent with middleware)
    const sessionToken = cookies.get('session')?.value;
    if (!sessionToken) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        // Run the monitor script.
        // In production (Railway), DATABASE_URL and API keys must be in ENV.
        // We use tsx to run the TS script directly.
        console.log('[API] Starting GEO Monitor manually...');

        // Using npx tsx to ensure it works in the Railway environment
        const { stdout, stderr } = await execPromise('npx tsx scripts/geo-monitor.ts');

        if (stderr) console.error('[API] GEO Monitor Stderr:', stderr);
        console.log('[API] GEO Monitor Stdout:', stdout);

        return new Response(JSON.stringify({ success: true, output: stdout }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('[API] GEO Monitor Failed:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
