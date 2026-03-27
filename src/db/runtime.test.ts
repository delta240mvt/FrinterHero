import assert from 'node:assert/strict';
import test from 'node:test';

import { selectDbRuntime } from './runtime.ts';

test('selectDbRuntime defaults to node and allows cloudflare override', () => {
  assert.equal(selectDbRuntime({}), 'node');
  assert.equal(selectDbRuntime({ CF_PAGES: '1' }), 'cloudflare');
  assert.equal(selectDbRuntime({ CLOUDFLARE_ACCOUNT_ID: 'acct' }), 'cloudflare');
  assert.equal(selectDbRuntime({ WORKERS_RS: '1' }), 'cloudflare');
});
