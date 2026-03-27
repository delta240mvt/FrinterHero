import type { CloudflareSiteSlug } from './bindings.ts';

export const JOB_TOPICS = [
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
] as const;
export type JobTopic = (typeof JOB_TOPICS)[number];

export interface JobExecutionContext {
  jobId: string;
  siteId: number;
  siteSlug: CloudflareSiteSlug;
  topic: JobTopic;
}

export interface JobQueueMessage<TPayload = unknown> extends JobExecutionContext {
  payload: TPayload;
}

export function validateJobExecutionContext<TContext extends JobExecutionContext>(context: TContext): TContext {
  if (!context.jobId.trim()) {
    throw new Error('jobId is required');
  }

  if (!Number.isInteger(context.siteId) || context.siteId <= 0) {
    throw new Error('siteId must be a positive integer');
  }

  return context;
}

export function buildJobQueueMessage<TPayload>(message: JobQueueMessage<TPayload>): JobQueueMessage<TPayload> {
  validateJobExecutionContext(message);
  return message;
}
