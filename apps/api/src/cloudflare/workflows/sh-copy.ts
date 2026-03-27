/// <reference path="../workers-runtime.d.ts" />
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runShCopyJob, type ShCopyResult } from '../../../../../src/lib/jobs/sh-copy.ts';
import { callBcLlm, type BcLlmCallOptions } from '../../../../../src/lib/bc-llm-client.ts';

type ShCopyQueueMessage = JobQueueMessage<{ briefId: number; siteId: number | null; model: string }>;
export type ShCopyWorkflowMessage = ShCopyQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface ShCopyWorkflowEnv {
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  SH_MODEL?: string;
}

interface ShCopyWorkflowDeps {
  db?: any;
  env?: ShCopyWorkflowEnv;
  runShCopyJob?: (options: Parameters<typeof runShCopyJob>[0], overrides: Parameters<typeof runShCopyJob>[1]) => Promise<ShCopyResult>;
  step: WorkflowStepLike;
}

function createBcCallLlm(env: ShCopyWorkflowEnv): typeof callBcLlm {
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

type WorkflowEntrypointConstructor<TEnv> = abstract new (_ctx: unknown, env: TEnv) => {
  readonly env: TEnv;
};

const WorkflowEntrypointBase = (((globalThis as Record<string, unknown>).WorkflowEntrypoint as WorkflowEntrypointConstructor<ShCopyWorkflowEnv> | undefined) ??
  class {
    readonly env: ShCopyWorkflowEnv;

    constructor(_ctx: unknown, env: ShCopyWorkflowEnv) {
      this.env = env;
    }
  }) as WorkflowEntrypointConstructor<ShCopyWorkflowEnv>;

function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadWorkflowJob(db: any, message: ShCopyQueueMessage) {
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

export async function executeShCopyWorkflow(message: ShCopyQueueMessage, deps: ShCopyWorkflowDeps) {
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
        workerName: 'cloudflare:sh-copy',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const runner = deps.runShCopyJob ?? runShCopyJob;
      const payload = message.payload ?? {};
      return runner(
        {
          briefId: Number(payload.briefId),
          siteId: payload.siteId ?? null,
          model: String(payload.model || (deps.env?.SH_MODEL ?? '')),
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

export interface ShCopyWorkflowBinding extends Pick<CloudflareWorkflow<ShCopyWorkflowMessage>, 'create'> {}

export async function startShCopyWorkflow(binding: ShCopyWorkflowBinding, message: ShCopyWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class ShCopyWorkflow extends WorkflowEntrypointBase {
  async run(event: CloudflareWorkflowEvent<ShCopyWorkflowMessage>, step: WorkflowStepLike) {
    return executeShCopyWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
