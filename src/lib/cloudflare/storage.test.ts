import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArtifactKey } from './storage.ts';

test('buildArtifactKey creates a deterministic scoped artifact path', () => {
  const key = buildArtifactKey({
    filename: 'report final.json',
    jobId: 'job_123',
    siteSlug: 'focusequalsfreedom',
    topic: 'bc-generate',
  });

  assert.equal(key, 'artifacts/focusequalsfreedom/bc-generate/job_123/report-final.json');
});

test('buildArtifactKey sanitizes nested or unsafe path segments', () => {
  const key = buildArtifactKey({
    filename: '../hero image.png',
    jobId: 'job/123',
    siteSlug: 'frinter',
    topic: 'sh-video',
  });

  assert.equal(key, 'artifacts/frinter/sh-video/job-123/hero-image.png');
});
