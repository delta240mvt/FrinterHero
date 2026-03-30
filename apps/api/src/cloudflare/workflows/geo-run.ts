/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import OpenAI from 'openai';
import { and, eq } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs } from '../../../../../src/db/schema.ts';
import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from '../../../../../src/lib/cloudflare/workflow-results.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { runGeoMonitorJob, type GeoMonitorResult } from '../../../../../src/lib/jobs/geo.ts';
import { initWorkflowDb } from './workflow-db-init.ts';

type GeoQueueMessage = JobQueueMessage<Record<string, unknown>>;
export type GeoRunWorkflowMessage = GeoQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface GeoWorkflowEnv {
  DISCORD_WEBHOOK_URL?: string;
  OPENROUTER_API_KEY?: string;
}

interface GeoWorkflowDeps {
  db?: any;
  env?: GeoWorkflowEnv;
  runGeoJob?: (overrides: Record<string, unknown>) => Promise<GeoMonitorResult>;
  step: WorkflowStepLike;
}


function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createQueryFn(apiKey: string | undefined, model: string) {
  return async (query: string) => {
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for GEO workflows');
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    const response = await client.chat.completions.create({
      max_tokens: 1000,
      messages: [{ role: 'user', content: query }],
      model,
    });

    return response.choices[0]?.message?.content ?? '';
  };
}

function createGeoWorkflowOverrides(env: GeoWorkflowEnv): Record<string, unknown> {
  const queryOpenAI = createQueryFn(env.OPENROUTER_API_KEY, 'openai/gpt-4.1-mini');
  const queryClaude = createQueryFn(env.OPENROUTER_API_KEY, 'anthropic/claude-sonnet-4-6');
  const queryGemini = createQueryFn(env.OPENROUTER_API_KEY, 'google/gemini-3.1-pro-preview');

  return {
    logger: console,
    notifyDiscord: async (summary: {
      draftsGenerated: number;
      gapsFound: number;
      queriesCount: number;
      runAt: Date;
    }) => {
      if (!env.DISCORD_WEBHOOK_URL) {
        return;
      }

      const response = await fetch(env.DISCORD_WEBHOOK_URL, {
        body: JSON.stringify({
          embeds: [
            {
              title: 'GEO Monitor Run Complete',
              fields: [
                { inline: true, name: 'Queries Run', value: String(summary.queriesCount) },
                { inline: true, name: 'Gaps Found', value: String(summary.gapsFound) },
                { inline: true, name: 'Drafts Generated', value: String(summary.draftsGenerated) },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status}`);
      }
    },
    queryClaude,
    queryGemini,
    queryOpenAI,
  };
}

async function loadWorkflowJob(db: any, message: GeoQueueMessage) {
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

export async function executeGeoRunWorkflow(message: GeoQueueMessage, deps: GeoWorkflowDeps) {
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
        workerName: 'cloudflare:geo-run',
      })
      .where(and(eq(appJobs.id, job.id), eq(appJobs.siteId, message.siteId)));

    return job;
  });

  try {
    const jobResult = await deps.step.do('execute', async () => {
      const runGeoJob = deps.runGeoJob ?? runGeoMonitorJob;
      return runGeoJob({
        db,
        ...createGeoWorkflowOverrides(deps.env ?? {}),
      });
    });

    return deps.step.do('finalize', async () => {
      const result = buildWorkflowSuccessResult({
        jobId: message.jobId,
        result: {
          ...jobResult,
          runAt: jobResult.runAt.toISOString(),
        },
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

export interface GeoRunWorkflowBinding extends Pick<CloudflareWorkflow<GeoRunWorkflowMessage>, 'create'> {}

export async function startGeoRunWorkflow(binding: GeoRunWorkflowBinding, message: GeoRunWorkflowMessage) {
  return binding.create({
    id: `job-${message.jobId}`,
    params: message,
  });
}

export class GeoRunWorkflow extends WorkflowEntrypoint<GeoWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<GeoRunWorkflowMessage>, step: WorkflowStepLike) {
    initWorkflowDb(this.env as unknown as Record<string, unknown>);
    return executeGeoRunWorkflow(event.payload, {
      env: this.env,
      step,
    });
  }
}
