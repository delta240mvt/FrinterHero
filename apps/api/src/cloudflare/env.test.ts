import assert from 'node:assert/strict';
import test from 'node:test';

import { readApiEnv } from './env.ts';

test('readApiEnv requires Cloudflare bindings', () => {
  assert.throws(() => readApiEnv({}), /API_BASE_URL|HYPERDRIVE|ASSETS_BUCKET|JOB_QUEUE/);
});

test('readApiEnv returns the validated bindings', () => {
  const hyperdrive = { connectionString: 'postgres://example' };
  const assetsBucket = { put: async () => null };
  const jobQueue = { send: async () => undefined };

  const env = {
    APP_ENV: 'development',
    API_BASE_URL: 'http://127.0.0.1:8787',
    HYPERDRIVE: hyperdrive,
    ASSETS_BUCKET: assetsBucket,
    JOB_QUEUE: jobQueue,
  };

  assert.deepEqual(readApiEnv(env), {
    API_BASE_URL: 'http://127.0.0.1:8787',
    APP_ENV: 'development',
    ASSETS_BUCKET: assetsBucket,
    FOCUS_HOST: 'focusequalsfreedom.com',
    FRINTER_HOST: 'frinter.pl',
    HYPERDRIVE: hyperdrive,
    JOB_QUEUE: jobQueue,
    NODE_API_URL: '',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });
});
