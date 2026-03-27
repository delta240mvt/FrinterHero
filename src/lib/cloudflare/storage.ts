import type { CloudflareSiteSlug } from './bindings.ts';
import type { JobTopic } from './job-payloads.ts';

export interface ArtifactKeyInput {
  filename: string;
  jobId: string;
  siteSlug: CloudflareSiteSlug;
  topic: JobTopic;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
}

export interface ArtifactMetadata {
  key: string;
  contentType: string;
  size: number;
}

export function sanitizeStorageSegment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('-')
    ?.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') ?? '';
}

export function buildArtifactKey({ filename, jobId, siteSlug, topic }: ArtifactKeyInput): string {
  const safeJobId = sanitizeStorageSegment(jobId);
  const safeFilename = sanitizeStorageSegment(filename);

  if (!safeJobId) {
    throw new Error('jobId is required to build an artifact key');
  }

  if (!safeFilename) {
    throw new Error('filename is required to build an artifact key');
  }

  return ['artifacts', siteSlug, topic, safeJobId, safeFilename].join('/');
}

export async function putArtifact(
  bucket: R2BucketLike,
  input: ArtifactKeyInput,
  body: ArrayBuffer | ReadableStream | string,
  contentType = 'application/octet-stream',
): Promise<ArtifactMetadata> {
  const key = buildArtifactKey(input);

  await bucket.put(key, body, { httpMetadata: { contentType } });

  let size: number;
  if (body instanceof ArrayBuffer) {
    size = body.byteLength;
  } else if (typeof body === 'string') {
    size = body.length;
  } else {
    size = 0;
  }

  return { key, contentType, size };
}

export function getArtifactUrl(bucketDomain: string, input: ArtifactKeyInput): string {
  const key = buildArtifactKey(input);
  return `https://${bucketDomain}/${key}`;
}
