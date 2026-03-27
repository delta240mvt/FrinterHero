import assert from 'node:assert/strict';
import test from 'node:test';

import { buildJobQueueMessage } from './job-payloads.ts';

test('buildJobQueueMessage carries explicit site context and payload', () => {
  const message = buildJobQueueMessage({
    jobId: 'job_123',
    topic: 'youtube',
    siteId: 7,
    siteSlug: 'frinter',
    payload: { query: 'deep work' },
  });

  assert.deepEqual(message, {
    jobId: 'job_123',
    payload: { query: 'deep work' },
    siteId: 7,
    siteSlug: 'frinter',
    topic: 'youtube',
  });
});

test('buildJobQueueMessage rejects missing site scope', () => {
  assert.throws(
    () =>
      buildJobQueueMessage({
        jobId: 'job_123',
        topic: 'reddit',
        siteId: 0,
        siteSlug: 'frinter',
        payload: {},
      }),
    /siteId/,
  );
});
