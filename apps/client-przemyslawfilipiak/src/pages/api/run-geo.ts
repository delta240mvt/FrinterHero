import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

// Total querying steps: queries.json has 46 queries × 3 models = 138
export const TOTAL_QUERY_STEPS = 138;

export const POST: APIRoute = async ({ cookies }) => {
    const sessionToken = cookies.get('session')?.value;
    if (!sessionToken) {
        return new Response('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const send = (payload: object) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            };

            const child = spawn('npx', ['tsx', 'scripts/geo-monitor.ts'], {
                cwd: process.cwd(),
                env: process.env,
                shell: true,
            });

            let buffer = '';

            const processLine = (line: string) => {
                if (!line.trim()) return;
                send({ line });
            };

            const handleChunk = (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) processLine(line);
            };

            child.stdout.on('data', handleChunk);
            child.stderr.on('data', handleChunk);

            child.on('close', (code) => {
                if (buffer.trim()) processLine(buffer);
                send({ done: true, code });
                controller.close();
            });

            child.on('error', (err) => {
                send({ error: err.message });
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
};
