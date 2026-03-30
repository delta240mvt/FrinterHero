/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs, redditScrapeRuns } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runRedditScraperJob, type RedditScraperOptions, type RedditScraperResult } from '../../../../../src/lib/jobs/reddit.ts';
import { initWorkflowDb } from './workflow-db-init.ts';

type RedditQueueMessage = JobQueueMessage<Record<string, unknown>>;
export type RedditRunWorkflowMessage = RedditQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface RedditWorkflowEnv {
  APIFY_API_TOKEN?: string;
  OPENROUTER_API_KEY?: string;
}

interface RedditWorkflowDeps {
  db?: any;
  env?: RedditWorkflowEnv;
  runRedditJob?: (options: RedditScraperOptions, overrides: Record<string, unknown>) => Promise<RedditScraperResult>;
  step: WorkflowStepLike;
}


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

async function loadWorkflowJob(db: any, message: RedditQueueMessage) {
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

function buildWorkflowOptions(job: Record<string, unknown>, scrapeRunId: number, siteId: number): RedditScraperOptions {
  const payload = asRecord(job.payload);

  return {
    chunkSize: readInteger(payload.chunkSize, 10),
    maxItems: readInteger(payload.maxItems, 3),
    model: readString(payload.model, 'anthropic/claude-sonnet-4-6'),
    scrapeRunId,
    scrapeTargets: readString(payload.scrapeTargets),
    siteId,
  };
}

function buildWorkflowOverrides(db: any, env: RedditWorkflowEnv) {
  return {
    apify: new ApifyClient({ token: env.APIFY_API_TOKEN }),
    db,
    logger: console,
    openai: new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    }),
  };
}

export async function executeRedditRunWorkflow(message: RedditQueueMessage, deps: RedditWorkflowDeps) {
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
        workerName: 'cloudflare:reddit-run',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const execution = await deps.step.do('execute', async () => {
      const [scrapeRun] = await db
        .insert(redditScrapeRuns)
        .values({
          logs: [],
          painPointsExtracted: 0,
          postsCollected: 0,
          siteId: message.siteId,
          status: 'running',
          targetsScraped: [],
        })
        .returning();

      const options = buildWorkflowOptions(reservedJob, scrapeRun.id, message.siteId);
      const result = deps.runRedditJob
        ? await deps.runRedditJob(options, { db, logger: console })
        : await runRedditScraperJob(options, buildWorkflowOverrides(db, deps.env ?? {}));

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

export interface RedditRunWorkflowBinding extends Pick<CloudflareWorkflow<RedditRunWorkflowMessage>, 'create'> {}

export async function startRedditRunWorkflow(binding: RedditRunWorkflowBinding, message: RedditRunWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class RedditRunWorkflow extends WorkflowEntrypoint<RedditWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<RedditRunWorkflowMessage>, step: WorkflowStepLike) {
    initWorkflowDb(this.env as unknown as Record<string, unknown>);
    return executeRedditRunWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
