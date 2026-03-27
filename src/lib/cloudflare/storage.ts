import type { CloudflareSiteSlug } from './bindings.ts';
import type { JobTopic } from './job-payloads.ts';

export interface ArtifactKeyInput {
  filename: string;
  jobId: string;
  siteSlug: CloudflareSiteSlug;
  topic: JobTopic;
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
