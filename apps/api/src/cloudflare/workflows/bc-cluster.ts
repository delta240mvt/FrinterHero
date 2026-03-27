/// <reference path="../workers-runtime.d.ts" />
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runBcClusterJob, type BcClusterResult } from '../../../../../src/lib/jobs/bc-cluster.ts';

type BcClusterQueueMessage = JobQueueMessage<{ projectId: number; iterationId: number | null }>;
export type BcClusterWorkflowMessage = BcClusterQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface BcClusterWorkflowEnv {}

interface BcClusterWorkflowDeps {
  db?: any;
  env?: BcClusterWorkflowEnv;
  runBcClusterJob?: (options: Parameters<typeof runBcClusterJob>[0], overrides: Record<string, unknown>) => Promise<BcClusterResult>;
  step: WorkflowStepLike;
}

type WorkflowEntrypointConstructor<TEnv> = abstract new (_ctx: unknown, env: TEnv) => {
  readonly env: TEnv;
};

const WorkflowEntrypointBase = (((globalThis as Record<string, unknown>).WorkflowEntrypoint as WorkflowEntrypointConstructor<BcClusterWorkflowEnv> | undefined) ??
  class {
    readonly env: BcClusterWorkflowEnv;

    constructor(_ctx: unknown, env: BcClusterWorkflowEnv) {
      this.env = env;
    }
  }) as WorkflowEntrypointConstructor<BcClusterWorkflowEnv>;

function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadWorkflowJob(db: any, message: BcClusterQueueMessage) {
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

export async function executeBcClusterWorkflow(message: BcClusterQueueMessage, deps: BcClusterWorkflowDeps) {
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
        workerName: 'cloudflare:bc-cluster',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const runner = deps.runBcClusterJob ?? runBcClusterJob;
      const payload = message.payload ?? {};
      return runner(
        {
          projectId: Number(payload.projectId),
          iterationId: payload.iterationId != null ? Number(payload.iterationId) : null,
        },
        {
          db,
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

export interface BcClusterWorkflowBinding extends Pick<CloudflareWorkflow<BcClusterWorkflowMessage>, 'create'> {}

export async function startBcClusterWorkflow(binding: BcClusterWorkflowBinding, message: BcClusterWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class BcClusterWorkflow extends WorkflowEntrypointBase {
  async run(event: CloudflareWorkflowEvent<BcClusterWorkflowMessage>, step: WorkflowStepLike) {
    return executeBcClusterWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
