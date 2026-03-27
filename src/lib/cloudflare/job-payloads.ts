import type { CloudflareSiteSlug } from './bindings.ts';

export type JobTopic =
  | 'geo'
  | 'reddit'
  | 'youtube'
  | 'bc-scrape'
  | 'bc-parse'
  | 'bc-selector'
  | 'bc-cluster'
  | 'bc-generate'
  | 'sh-copy'
  | 'sh-video'
  | 'sh-publish';

export interface JobExecutionContext {
  jobId: string;
  siteId: number;
  siteSlug: CloudflareSiteSlug;
  topic: JobTopic;
}

export interface JobQueueMessage<TPayload = unknown> extends JobExecutionContext {
  payload: TPayload;
}

export function buildJobQueueMessage<TPayload>(message: JobQueueMessage<TPayload>): JobQueueMessage<TPayload> {
  if (!message.jobId.trim()) {
    throw new Error('jobId is required');
  }

  if (!Number.isInteger(message.siteId) || message.siteId <= 0) {
    throw new Error('siteId must be a positive integer');
  }

  return message;
}
