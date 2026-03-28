/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runBcParseJob, type BcLpParseResult } from '../../../../../src/lib/jobs/bc-parse.ts';
import { callBcLlm, type BcLlmCallOptions } from '../../../../../src/lib/bc-llm-client.ts';

type BcParseQueueMessage = JobQueueMessage<{ projectId: number }>;
export type BcParseWorkflowMessage = BcParseQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface BcParseWorkflowEnv {
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

interface BcParseWorkflowDeps {
  db?: any;
  env?: BcParseWorkflowEnv;
  runBcParseJob?: (options: Parameters<typeof runBcParseJob>[0], overrides: Parameters<typeof runBcParseJob>[1]) => Promise<BcLpParseResult>;
  step: WorkflowStepLike;
}

function createBcCallLlm(env: BcParseWorkflowEnv): typeof callBcLlm {
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

async function loadWorkflowJob(db: any, message: BcParseQueueMessage) {
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

export async function executeBcParseWorkflow(message: BcParseQueueMessage, deps: BcParseWorkflowDeps) {
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
        workerName: 'cloudflare:bc-parse',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const runner = deps.runBcParseJob ?? runBcParseJob;
      const payload = message.payload ?? {};
      return runner(
        {
          projectId: Number(payload.projectId),
        },
        {
          db,
          callLlm: createBcCallLlm(deps.env ?? {}),
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

export interface BcParseWorkflowBinding extends Pick<CloudflareWorkflow<BcParseWorkflowMessage>, 'create'> {}

export async function startBcParseWorkflow(binding: BcParseWorkflowBinding, message: BcParseWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class BcParseWorkflow extends WorkflowEntrypoint<BcParseWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<BcParseWorkflowMessage>, step: WorkflowStepLike) {
    return executeBcParseWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
