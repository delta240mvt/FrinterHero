export interface CloudflareJobRecord {
  id: number;
  siteId: number | null;
  type: string;
  topic: string;
  status: string;
  progress?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  attemptCount?: number | null;
  maxAttempts?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
}

function serializeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

export function serializeJobResult(job: CloudflareJobRecord) {
  return {
    attemptCount: job.attemptCount ?? 0,
    createdAt: serializeDate(job.createdAt),
    error: job.error ?? null,
    finishedAt: serializeDate(job.finishedAt),
    jobId: job.id,
    maxAttempts: job.maxAttempts ?? 0,
    progress: job.progress ?? {},
    result: job.result ?? null,
    siteId: job.siteId ?? null,
    startedAt: serializeDate(job.startedAt),
    status: job.status,
    topic: job.topic,
    type: job.type,
    updatedAt: serializeDate(job.updatedAt),
  };
}
