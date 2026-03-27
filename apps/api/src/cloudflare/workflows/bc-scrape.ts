/// <reference path="../workers-runtime.d.ts" />
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runBcScrapeJob, type BcScrapeResult } from '../../../../../src/lib/jobs/bc-scrape.ts';

type BcScrapeQueueMessage = JobQueueMessage<{ projectId: number; videoId: number }>;
export type BcScrapeWorkflowMessage = BcScrapeQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface BcScrapeWorkflowEnv {
  YOUTUBE_API_KEY?: string;
}

interface BcScrapeWorkflowDeps {
  db?: any;
  env?: BcScrapeWorkflowEnv;
  runBcScrapeJob?: (options: Parameters<typeof runBcScrapeJob>[0], overrides: Record<string, unknown>) => Promise<BcScrapeResult>;
  step: WorkflowStepLike;
}

type WorkflowEntrypointConstructor<TEnv> = abstract new (_ctx: unknown, env: TEnv) => {
  readonly env: TEnv;
};

const WorkflowEntrypointBase = (((globalThis as Record<string, unknown>).WorkflowEntrypoint as WorkflowEntrypointConstructor<BcScrapeWorkflowEnv> | undefined) ??
  class {
    readonly env: BcScrapeWorkflowEnv;

    constructor(_ctx: unknown, env: BcScrapeWorkflowEnv) {
      this.env = env;
    }
  }) as WorkflowEntrypointConstructor<BcScrapeWorkflowEnv>;

function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadWorkflowJob(db: any, message: BcScrapeQueueMessage) {
  const jobId = Number(message.jobId);
  const [job] = await db
    .select()
    .from(appJobs)
    .where(and(eq(appJobs.id, jobId), eq(appJobs.siteId, message.siteId)))
    .limit(1);

  if (!job) {
    throw new Error(`Job not found: ${message.jobId}`);
  }

  if (job.topic !== message.topic) {
    throw new Error(`Job topic mismatch: expected ${message.topic}, received ${String(job.topic)}`);
  }

  return job;
}

export async function executeBcScrapeWorkflow(message: BcScrapeQueueMessage, deps: BcScrapeWorkflowDeps) {
  const db = getDb(deps.db);
  const reservedJob = await deps.step.do('reserve', async () => {
    const job = await loadWorkflowJob(db, message);
    await db
      .update(appJobs)
      .set({
        error: null,
        progress: { stage: 'reserved' },
        startedAt: new Date(),
        status: 'running',
        updatedAt: new Date(),
        workerName: 'cloudflare:bc-scrape',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const runner = deps.runBcScrapeJob ?? runBcScrapeJob;
      const payload = message.payload ?? {};
      return runner(
        {
          projectId: Number(payload.projectId),
          videoId: Number(payload.videoId),
          youtubeApiKey: deps.env?.YOUTUBE_API_KEY ?? '',
          maxComments: 500,
          chunkSize: 25,
        },
        {
          db,
          fetchImpl: fetch,
          logger: console,
        },
      );
    });

    return deps.step.do('finalize', async () => {
      const result = buildWorkflowSuccessResult({
        jobId: message.jobId,
        result: jobResult,
        siteId: message.siteId,
        siteSlug: message.siteSlug,
        topic: message.topic,
      });

      await db
        .update(appJobs)
        .set({
          error: null,
          finishedAt: new Date(),
          progress: { stage: 'finalized' },
          result,
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(and(eq(appJobs.id, reservedJob.id), eq(appJobs.siteId, message.siteId)));

      return result;
    });
  } catch (error) {
    await deps.step.do('finalize', async () => {
      const result = buildWorkflowFailureResult({
        error: getErrorMessage(error),
        jobId: message.jobId,
        retryable: false,
        siteId: message.siteId,
        siteSlug: message.siteSlug,
        topic: message.topic,
      });

      await db
        .update(appJobs)
        .set({
          error: result.error,
          finishedAt: new Date(),
          progress: { stage: 'finalized' },
          result,
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(and(eq(appJobs.id, reservedJob.id), eq(appJobs.siteId, message.siteId)));

      return result;
    });

    throw error;
  }
}

export interface BcScrapeWorkflowBinding extends Pick<CloudflareWorkflow<BcScrapeWorkflowMessage>, 'create'> {}

export async function startBcScrapeWorkflow(binding: BcScrapeWorkflowBinding, message: BcScrapeWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class BcScrapeWorkflow extends WorkflowEntrypointBase {
  async run(event: CloudflareWorkflowEvent<BcScrapeWorkflowMessage>, step: WorkflowStepLike) {
    return executeBcScrapeWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
