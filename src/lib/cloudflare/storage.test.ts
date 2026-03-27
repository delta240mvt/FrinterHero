import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArtifactKey, getArtifactUrl, putArtifact } from './storage.ts';
import type { R2BucketLike } from './storage.ts';

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

test('putArtifact calls bucket.put with correct key and contentType and returns metadata', async () => {
  const calls: Array<{ key: string; value: unknown; options: unknown }> = [];

  const fakeBucket: R2BucketLike = {
    async put(key, value, options) {
      calls.push({ key, value, options });
    },
    async get(_key) {
      return null;
    },
  };

  const body = new ArrayBuffer(42);
  const metadata = await putArtifact(
    fakeBucket,
    { filename: 'output.json', jobId: 'job-abc', siteSlug: 'frinter', topic: 'bc-generate' },
    body,
    'application/json',
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'artifacts/frinter/bc-generate/job-abc/output.json');
  assert.deepEqual(calls[0].options, { httpMetadata: { contentType: 'application/json' } });
  assert.equal(metadata.key, 'artifacts/frinter/bc-generate/job-abc/output.json');
  assert.equal(metadata.contentType, 'application/json');
  assert.equal(metadata.size, 42);
});

test('putArtifact with string body returns size equal to string length', async () => {
  const fakeBucket: R2BucketLike = {
    async put(_key, _value, _options) {},
    async get(_key) {
      return null;
    },
  };

  const body = 'hello world';
  const metadata = await putArtifact(
    fakeBucket,
    { filename: 'result.txt', jobId: 'job-xyz', siteSlug: 'focusequalsfreedom', topic: 'sh-publish' },
    body,
    'text/plain',
  );

  assert.equal(metadata.size, body.length);
  assert.equal(metadata.contentType, 'text/plain');
  assert.equal(metadata.key, 'artifacts/focusequalsfreedom/sh-publish/job-xyz/result.txt');
});

test('getArtifactUrl returns https URL with bucket domain and artifact key', () => {
  const url = getArtifactUrl('assets.frinter.app', {
    filename: 'hero-image.png',
    jobId: 'job-999',
    siteSlug: 'frinter',
    topic: 'sh-video',
  });

  assert.equal(url, 'https://assets.frinter.app/artifacts/frinter/sh-video/job-999/hero-image.png');
});
