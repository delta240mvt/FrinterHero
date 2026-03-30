/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runShVideoJob, type ShVideoResult } from '../../../../../src/lib/jobs/sh-video.ts';
import { initWorkflowDb } from './workflow-db-init.ts';

type ShVideoQueueMessage = JobQueueMessage<{
  briefId: number;
  copyId: number;
  siteId: number | null;
  avatarUrl: string;
  videoModel: string;
  voiceId: string;
}>;
export type ShVideoWorkflowMessage = ShVideoQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface ShVideoWorkflowEnv {
  WAVESPEED_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
}

interface ShVideoWorkflowDeps {
  db?: any;
  env?: ShVideoWorkflowEnv;
  runShVideoJob?: (options: Parameters<typeof runShVideoJob>[0], overrides: Parameters<typeof runShVideoJob>[1]) => Promise<ShVideoResult>;
  step: WorkflowStepLike;
}


function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadWorkflowJob(db: any, message: ShVideoQueueMessage) {
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

export async function executeShVideoWorkflow(message: ShVideoQueueMessage, deps: ShVideoWorkflowDeps) {
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
        workerName: 'cloudflare:sh-video',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const env = deps.env ?? {};
      if (env.WAVESPEED_API_KEY) {
        process.env.WAVESPEED_API_KEY = env.WAVESPEED_API_KEY;
      }
      if (env.ELEVENLABS_API_KEY) {
        process.env.ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
      }
      const runner = deps.runShVideoJob ?? runShVideoJob;
      const payload = message.payload ?? {};
      return runner(
        {
          briefId: Number(payload.briefId),
          copyId: Number(payload.copyId),
          siteId: payload.siteId ?? null,
          avatarUrl: String(payload.avatarUrl || ''),
          videoModel: String(payload.videoModel || ''),
          voiceId: String(payload.voiceId || ''),
        },
        {
          db,
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

export interface ShVideoWorkflowBinding extends Pick<CloudflareWorkflow<ShVideoWorkflowMessage>, 'create'> {}

export async function startShVideoWorkflow(binding: ShVideoWorkflowBinding, message: ShVideoWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class ShVideoWorkflow extends WorkflowEntrypoint<ShVideoWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<ShVideoWorkflowMessage>, step: WorkflowStepLike) {
    initWorkflowDb(this.env as unknown as Record<string, unknown>);
    return executeShVideoWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
