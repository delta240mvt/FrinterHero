/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runBcClusterJob, type BcClusterResult } from '../../../../../src/lib/jobs/bc-cluster.ts';
import { callBcLlm, type BcLlmCallOptions } from '../../../../../src/lib/bc-llm-client.ts';

type BcClusterQueueMessage = JobQueueMessage<{ projectId: number; iterationId: number | null }>;
export type BcClusterWorkflowMessage = BcClusterQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface BcClusterWorkflowEnv {
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

interface BcClusterWorkflowDeps {
  db?: any;
  env?: BcClusterWorkflowEnv;
  runBcClusterJob?: (options: Parameters<typeof runBcClusterJob>[0], overrides: Parameters<typeof runBcClusterJob>[1]) => Promise<BcClusterResult>;
  step: WorkflowStepLike;
}

function createBcCallLlm(env: BcClusterWorkflowEnv): typeof callBcLlm {
  return async (options: BcLlmCallOptions) => {
    if (env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
    }
    if (env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
    }
    return callBcLlm(options);
  };
}


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
          callLlm: createBcCallLlm(deps.env ?? {}),
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

export class BcClusterWorkflow extends WorkflowEntrypoint<BcClusterWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<BcClusterWorkflowMessage>, step: WorkflowStepLike) {
    return executeBcClusterWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
