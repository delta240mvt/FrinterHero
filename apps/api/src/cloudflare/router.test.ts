import assert from 'node:assert/strict';
import test from 'node:test';

import worker from './index.ts';
import { routeRequest } from './router.ts';

test('routeRequest returns health JSON for GET /health', async () => {
  const response = await routeRequest(
    new Request('https://api.example.com/health', { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    path: '/health',
    service: 'api',
    status: 'ok',
  });
});

test('routeRequest returns JSON 404 for unknown routes', async () => {
  const response = await routeRequest(
    new Request('https://api.example.com/missing', { method: 'POST' }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    error: 'Not found',
    method: 'POST',
    pathname: '/missing',
  });
});

test('worker fetch serves GET /health without full binding validation', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/health', { method: 'GET' }),
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    path: '/health',
    service: 'api',
    status: 'ok',
  });
});

test('worker fetch keeps strict env validation for non-health routes', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/missing', { method: 'GET' }),
    {},
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    detail: 'Missing Cloudflare API env: API_BASE_URL, HYPERDRIVE, ASSETS_BUCKET, JOB_QUEUE',
    error: 'Internal server error',
  });
});
