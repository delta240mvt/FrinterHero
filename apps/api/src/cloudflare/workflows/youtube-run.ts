/// <reference path="../workers-runtime.d.ts" />
import OpenAI from 'openai';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs, ytScrapeRuns } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runYoutubeScraperJob, type YoutubeScraperOptions, type YoutubeScraperResult } from '../../../../../src/lib/jobs/youtube.ts';

type YoutubeQueueMessage = JobQueueMessage<Record<string, unknown>>;
export type YoutubeRunWorkflowMessage = YoutubeQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface YoutubeWorkflowEnv {
  OPENROUTER_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
}

interface YoutubeWorkflowDeps {
  db?: any;
  env?: YoutubeWorkflowEnv;
  runYoutubeJob?: (options: YoutubeScraperOptions, overrides: Record<string, unknown>) => Promise<YoutubeScraperResult>;
  step: WorkflowStepLike;
}

type WorkflowEntrypointConstructor<TEnv> = abstract new (_ctx: unknown, env: TEnv) => {
  readonly env: TEnv;
};

const WorkflowEntrypointBase = (((globalThis as Record<string, unknown>).WorkflowEntrypoint as WorkflowEntrypointConstructor<YoutubeWorkflowEnv> | undefined) ??
  class {
    readonly env: YoutubeWorkflowEnv;

    constructor(_ctx: unknown, env: YoutubeWorkflowEnv) {
      this.env = env;
    }
  }) as WorkflowEntrypointConstructor<YoutubeWorkflowEnv>;

function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readInteger(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

async function loadWorkflowJob(db: any, message: YoutubeQueueMessage) {
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

function buildWorkflowOptions(
  job: Record<string, unknown>,
  scrapeRunId: number,
  siteId: number,
  env: YoutubeWorkflowEnv,
): YoutubeScraperOptions {
  const payload = asRecord(job.payload);

  return {
    chunkSize: readInteger(payload.chunkSize, 20),
    maxComments: readInteger(payload.maxComments, 300),
    maxVideosPerChannel: readInteger(payload.maxVideosPerChannel, 5),
    model: readString(payload.model, 'anthropic/claude-sonnet-4-6'),
    scrapeRunId,
    scrapeTargetIds: readString(payload.scrapeTargetIds),
    siteId,
    youtubeApiKey: readString(payload.youtubeApiKey, env.YOUTUBE_API_KEY ?? ''),
  };
}

function buildWorkflowOverrides(db: any, env: YoutubeWorkflowEnv) {
  return {
    db,
    fetchImpl: fetch,
    logger: console,
    openai: new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    }),
  };
}

export async function executeYoutubeRunWorkflow(message: YoutubeQueueMessage, deps: YoutubeWorkflowDeps) {
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
        workerName: 'cloudflare:youtube-run',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const execution = await deps.step.do('execute', async () => {
      const [scrapeRun] = await db
        .insert(ytScrapeRuns)
        .values({
          commentsCollected: 0,
          logs: [],
          painPointsExtracted: 0,
          siteId: message.siteId,
          status: 'running',
          targetsScraped: [],
        })
        .returning();

      const options = buildWorkflowOptions(reservedJob, scrapeRun.id, message.siteId, deps.env ?? {});
      const result = deps.runYoutubeJob
        ? await deps.runYoutubeJob(options, { db, logger: console })
        : await runYoutubeScraperJob(options, buildWorkflowOverrides(db, deps.env ?? {}));

      return {
        ...result,
        scrapeRunId: scrapeRun.id,
      };
    });

    return deps.step.do('finalize', async () => {
      const result = buildWorkflowSuccessResult({
        jobId: message.jobId,
        result: execution,
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

export interface YoutubeRunWorkflowBinding extends Pick<CloudflareWorkflow<YoutubeRunWorkflowMessage>, 'create'> {}

export async function startYoutubeRunWorkflow(binding: YoutubeRunWorkflowBinding, message: YoutubeRunWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class YoutubeRunWorkflow extends WorkflowEntrypointBase {
  async run(event: CloudflareWorkflowEvent<YoutubeRunWorkflowMessage>, step: WorkflowStepLike) {
    return executeYoutubeRunWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
