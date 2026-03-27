import {
  type JobQueueMessage,
  type JobTopic,
  validateJobExecutionContext,
} from '../../../../../src/lib/cloudflare/job-payloads.ts';
import type { CloudflareSiteSlug } from '../../../../../src/lib/cloudflare/bindings.ts';

const SUPPORTED_TOPICS = new Set<JobTopic>([
  'geo',
  'reddit',
  'youtube',
  'bc-scrape',
  'bc-parse',
  'bc-selector',
  'bc-cluster',
  'bc-generate',
  'sh-copy',
  'sh-video',
  'sh-publish',
]);
const SUPPORTED_SITE_SLUGS = new Set<CloudflareSiteSlug>([
  'frinter',
  'focusequalsfreedom',
  'przemyslawfilipiak',
]);

export interface JobQueueMessageLike<TBody = unknown> {
  body: TBody;
  ack(): void;
}

export interface JobQueueBatchLike<TBody = unknown> {
  messages: Array<JobQueueMessageLike<TBody>>;
}

export interface JobQueueConsumerDeps {
  startGeoWorkflow(message: JobQueueMessage): Promise<unknown>;
  startRedditWorkflow(message: JobQueueMessage): Promise<unknown>;
  startYoutubeWorkflow(message: JobQueueMessage): Promise<unknown>;
  startBcScrapeWorkflow(message: JobQueueMessage): Promise<unknown>;
  startBcParseWorkflow(message: JobQueueMessage): Promise<unknown>;
  startBcSelectorWorkflow(message: JobQueueMessage): Promise<unknown>;
  startBcClusterWorkflow(message: JobQueueMessage): Promise<unknown>;
  startBcGenerateWorkflow(message: JobQueueMessage): Promise<unknown>;
  startShCopyWorkflow(message: JobQueueMessage): Promise<unknown>;
  startShVideoWorkflow(message: JobQueueMessage): Promise<unknown>;
  startShPublishWorkflow(message: JobQueueMessage): Promise<unknown>;
}

function parseJobTopic(value: unknown): JobTopic {
  if (typeof value !== 'string' || !SUPPORTED_TOPICS.has(value as JobTopic)) {
    throw new Error(`Unsupported job topic: ${String(value)}`);
  }

  return value as JobTopic;
}

function parseSiteSlug(value: unknown): CloudflareSiteSlug {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('siteSlug is required');
  }

  if (!SUPPORTED_SITE_SLUGS.has(value as CloudflareSiteSlug)) {
    throw new Error(`Unsupported siteSlug: ${value}`);
  }

  return value as CloudflareSiteSlug;
}

export function parseJobQueueMessage(value: unknown): JobQueueMessage {
  if (!value || typeof value !== 'object') {
    throw new Error('Queue message body must be an object');
  }

  const message = value as Partial<JobQueueMessage>;
  const topic = parseJobTopic(message.topic);
  const siteSlug = parseSiteSlug(message.siteSlug);
  const parsed = validateJobExecutionContext({
    jobId: String(message.jobId ?? ''),
    payload: message.payload,
    siteId: Number(message.siteId),
    siteSlug,
    topic,
  });

  if (!('payload' in message)) {
    throw new Error('payload is required');
  }

  return parsed;
}

export async function dispatchJobQueueMessage(message: JobQueueMessage, deps: JobQueueConsumerDeps): Promise<void> {
  switch (message.topic) {
    case 'geo':
      await deps.startGeoWorkflow(message);
      return;
    case 'reddit':
      await deps.startRedditWorkflow(message);
      return;
    case 'youtube':
      await deps.startYoutubeWorkflow(message);
      return;
    case 'bc-scrape':
      await deps.startBcScrapeWorkflow(message);
      return;
    case 'bc-parse':
      await deps.startBcParseWorkflow(message);
      return;
    case 'bc-selector':
      await deps.startBcSelectorWorkflow(message);
      return;
    case 'bc-cluster':
      await deps.startBcClusterWorkflow(message);
      return;
    case 'bc-generate':
      await deps.startBcGenerateWorkflow(message);
      return;
    case 'sh-copy':
      await deps.startShCopyWorkflow(message);
      return;
    case 'sh-video':
      await deps.startShVideoWorkflow(message);
      return;
    case 'sh-publish':
      await deps.startShPublishWorkflow(message);
      return;
    default: {
      const unsupportedTopic: never = message.topic;
      throw new Error(`Unsupported job topic: ${String(unsupportedTopic)}`);
    }
  }
}

export async function handleJobQueueBatch(batch: JobQueueBatchLike, deps: JobQueueConsumerDeps): Promise<void> {
  for (const entry of batch.messages) {
    const message = parseJobQueueMessage(entry.body);
    await dispatchJobQueueMessage(message, deps);
    entry.ack();
  }
}
