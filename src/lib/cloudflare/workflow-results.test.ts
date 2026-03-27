import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkflowFailureResult, buildWorkflowSuccessResult } from './workflow-results.ts';

test('buildWorkflowSuccessResult returns a standardized completed payload', () => {
  const result = buildWorkflowSuccessResult({
    jobId: 'job_123',
    result: { rowsWritten: 12 },
    siteId: 4,
    siteSlug: 'przemyslawfilipiak',
    topic: 'geo',
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.jobId, 'job_123');
  assert.equal(result.siteId, 4);
  assert.equal(result.siteSlug, 'przemyslawfilipiak');
  assert.deepEqual(result.result, { rowsWritten: 12 });
});

test('buildWorkflowFailureResult returns a standardized failed payload', () => {
  const result = buildWorkflowFailureResult({
    error: 'Timeout',
    jobId: 'job_999',
    retryable: true,
    siteId: 2,
    siteSlug: 'frinter',
    topic: 'youtube',
  });

  assert.deepEqual(result, {
    error: 'Timeout',
    jobId: 'job_999',
    retryable: true,
    siteId: 2,
    siteSlug: 'frinter',
    status: 'failed',
    topic: 'youtube',
  });
});
