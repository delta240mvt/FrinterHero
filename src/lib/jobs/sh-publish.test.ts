import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShPublishOptions } from './sh-publish';

test('parseShPublishOptions normalizes account ids and scheduled time', () => {
  const parsed = parseShPublishOptions({
    briefId: 7,
    siteId: 2,
    accountIds: [3, 5],
    scheduledForRaw: '2026-03-27T10:00:00.000Z',
  });

  assert.equal(parsed.briefId, 7);
  assert.deepEqual(parsed.accountIds, [3, 5]);
  assert.equal(parsed.scheduledFor?.toISOString(), '2026-03-27T10:00:00.000Z');
});
