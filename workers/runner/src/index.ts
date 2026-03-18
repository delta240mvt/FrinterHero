import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import http from 'node:http';
import dotenv from 'dotenv';
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '../../../src/db/client';
import { appJobs } from '../../../src/db/schema';

const rootDir = path.resolve(process.cwd(), '..', '..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
const topics = (process.env.WORKER_TOPICS ?? process.argv[2] ?? 'geo,draft')
  .split(',')
  .map((topic) => topic.trim())
  .filter(Boolean);
const workerName = process.env.WORKER_NAME ?? `worker-general:${topics.join('+')}`;
const pollMs = Number.parseInt(process.env.WORKER_POLL_MS ?? '3000', 10);
const staleJobMs = Number.parseInt(process.env.WORKER_STALE_JOB_MS ?? `${10 * 60 * 1000}`, 10);
const workerHealthPort = process.env.WORKER_HEALTH_PORT ? Number.parseInt(process.env.WORKER_HEALTH_PORT, 10) : null;
let currentJobId: number | null = null;
let currentTopic: string | null = null;
let lastLoopAt: string | null = null;
let processedJobs = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reserveNextJob() {
  const [candidate] = await db
    .select()
    .from(appJobs)
    .where(
      and(
        inArray(appJobs.topic, topics as [string, ...string[]]),
        eq(appJobs.status, 'pending'),
        lte(appJobs.availableAt, new Date()),
      ),
    )
    .orderBy(desc(appJobs.priority), asc(appJobs.createdAt))
    .limit(1);

  if (!candidate) return null;

  const [locked] = await db
    .update(appJobs)
    .set({
      status: 'running',
      workerName,
      lockedAt: new Date(),
      startedAt: new Date(),
      updatedAt: new Date(),
      attemptCount: (candidate.attemptCount ?? 0) + 1,
    })
    .where(eq(appJobs.id, candidate.id))
    .returning();

  return locked ?? null;
}

async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - staleJobMs);
  await db
    .update(appJobs)
    .set({
      status: 'pending',
      error: `Recovered stale running job on ${workerName}`,
      lockedAt: null,
      workerName: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(appJobs.topic, topics as [string, ...string[]]),
        eq(appJobs.status, 'running'),
        lte(appJobs.lockedAt, cutoff),
      ),
    );
}

function runScript(scriptPath: string, extraEnv: Record<string, string> = {}) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      cwd: rootDir,
      env: {
        ...process.env,
        ...extraEnv,
      },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

function parseDomainResult(stdout: string) {
  const marker = 'RESULT_JSON:';
  const line = stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(marker));

  if (!line) return null;

  try {
    return JSON.parse(line.slice(marker.length));
  } catch {
    return null;
  }
}

function parseMetricFromStdout(stdout: string, metric: string) {
  const lines = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith(`${metric}:`)) continue;
    const value = Number.parseInt(line.slice(metric.length + 1), 10);
    return Number.isNaN(value) ? null : value;
  }
  return null;
}

function parseLastMatchedValue(stdout: string, pattern: RegExp) {
  const lines = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function processJob(job: typeof appJobs.$inferSelect) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  if (job.topic === 'geo') {
    return runScript('scripts/geo-monitor.ts');
  }

  if (job.topic === 'draft') {
    const gapId = Number(payload.gapId ?? 0);
    if (!gapId) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Missing gapId in draft payload',
        code: 1,
      };
    }

    return runScript('scripts/draft-bridge.ts', {
      GAP_ID: String(gapId),
      MODEL: String(payload.model ?? 'anthropic/claude-sonnet-4-6'),
      AUTHOR_NOTES: String(payload.authorNotes ?? ''),
    });
  }

  if (job.topic === 'reddit') {
    const runId = Number(payload.runId ?? 0);
    const targets = Array.isArray(payload.targets)
      ? payload.targets.map((entry) => String(entry).trim()).filter(Boolean)
      : String(payload.targets ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

    if (!runId || targets.length === 0) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Missing runId or targets in reddit payload',
        code: 1,
      };
    }

    return runScript('scripts/reddit-scraper.ts', {
      SCRAPE_RUN_ID: String(runId),
      SCRAPE_TARGETS: targets.join(','),
      SITE_ID: String(payload.siteId ?? ''),
    });
  }

  if (job.topic === 'youtube') {
    const runId = Number(payload.runId ?? 0);
    const targetIds = Array.isArray(payload.targetIds)
      ? payload.targetIds.map((entry) => String(entry).trim()).filter(Boolean)
      : String(payload.targetIds ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

    if (!runId || targetIds.length === 0) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Missing runId or targetIds in youtube payload',
        code: 1,
      };
    }

    return runScript('scripts/yt-scraper.ts', {
      SCRAPE_RUN_ID: String(runId),
      SCRAPE_TARGET_IDS: targetIds.join(','),
      SITE_ID: String(payload.siteId ?? ''),
    });
  }

  if (job.topic === 'bc-scrape') {
    const projectId = Number(payload.projectId ?? 0);
    const videoId = Number(payload.videoId ?? 0);

    if (!projectId) {
      return {
        ok: false,
        stdout: '',
        stderr: 'Missing projectId in bc-scrape payload',
        code: 1,
      };
    }

    return runScript('scripts/bc-scraper.ts', {
      BC_PROJECT_ID: String(projectId),
      BC_VIDEO_ID: videoId ? String(videoId) : '',
      SITE_ID: String(payload.siteId ?? ''),
    });
  }

  return {
    ok: false,
    stdout: '',
    stderr: `Unsupported topic in runner: ${job.topic}`,
    code: 1,
  };
}

async function finalizeSuccess(jobId: number, result: Record<string, unknown>) {
  await db
    .update(appJobs)
    .set({
      status: 'done',
      result,
      error: null,
      lockedAt: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(appJobs.id, jobId));
}

async function finalizeError(job: typeof appJobs.$inferSelect, errorMessage: string, result: Record<string, unknown>) {
  const status = (job.attemptCount ?? 0) >= (job.maxAttempts ?? 3) ? 'error' : 'pending';
  await db
    .update(appJobs)
    .set({
      status,
      error: errorMessage,
      result,
      availableAt: new Date(Date.now() + 10_000),
      finishedAt: status === 'error' ? new Date() : null,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(appJobs.id, job.id));
}

async function releaseCurrentJob(signal: string) {
  if (!currentJobId) return;

  await db
    .update(appJobs)
    .set({
      status: 'pending',
      error: `Job released after ${signal} on ${workerName}`,
      lockedAt: null,
      workerName: null,
      updatedAt: new Date(),
    })
    .where(eq(appJobs.id, currentJobId));
}

async function main() {
  console.log(`[${workerName}] starting with topics=${topics.join(',')}`);
  await recoverStaleJobs();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    lastLoopAt = new Date().toISOString();
    const job = await reserveNextJob();
    if (!job) {
      await sleep(pollMs);
      continue;
    }

    console.log(`[${workerName}] processing job#${job.id} topic=${job.topic}`);
    currentJobId = job.id;
    currentTopic = job.topic;

    try {
      const result = await processJob(job);
      if (result.ok) {
        const domainResult = parseDomainResult(result.stdout);
        await finalizeSuccess(job.id, {
          code: result.code,
          stdout: result.stdout.slice(-8000),
          ...(job.topic === 'reddit'
            ? {
                metrics: {
                  postsCollected: parseMetricFromStdout(result.stdout, 'postsCollected'),
                  painPointsExtracted: parseMetricFromStdout(result.stdout, 'painPointsExtracted'),
                  currentTarget: parseLastMatchedValue(result.stdout, /\[SCRAPE\] Target:\s+(.+)/),
                },
              }
            : {}),
          ...(job.topic === 'youtube'
            ? {
                metrics: {
                  commentsCollected: parseMetricFromStdout(result.stdout, 'commentsCollected'),
                  painPointsExtracted: parseMetricFromStdout(result.stdout, 'painPointsExtracted'),
                  currentTarget: parseLastMatchedValue(result.stdout, /\[YT\] Scraping:\s+(.+)/),
                },
              }
            : {}),
          ...(job.topic === 'bc-scrape'
            ? {
                metrics: {
                  commentsCollected: parseMetricFromStdout(result.stdout, 'commentsCollected'),
                  painPointsExtracted: parseMetricFromStdout(result.stdout, 'painPointsExtracted'),
                  videoScrapedId: parseMetricFromStdout(result.stdout, 'VIDEO_SCRAPED'),
                },
              }
            : {}),
          ...(domainResult ? { domainResult } : {}),
        });
      } else {
        await finalizeError(job, result.stderr || 'Worker execution failed', {
          code: result.code,
          stdout: result.stdout.slice(-4000),
          stderr: result.stderr.slice(-4000),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finalizeError(job, message, { detail: message });
    } finally {
      processedJobs += 1;
      currentJobId = null;
      currentTopic = null;
    }
  }
}

function startHealthServer() {
  if (!workerHealthPort || Number.isNaN(workerHealthPort)) return;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      workerName,
      status: 'ok',
      topics,
      currentJobId,
      currentTopic,
      processedJobs,
      lastLoopAt,
      timestamp: new Date().toISOString(),
    }));
  });

  server.listen(workerHealthPort, '0.0.0.0', () => {
    console.log(`[${workerName}] health endpoint listening on http://0.0.0.0:${workerHealthPort}/health`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    releaseCurrentJob(signal)
      .catch((error) => console.error(`[${workerName}] failed to release job on ${signal}`, error))
      .finally(() => process.exit(0));
  });
}

startHealthServer();

main().catch((error) => {
  console.error(`[${workerName}] fatal error`, error);
  process.exit(1);
});
