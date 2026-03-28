import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /health returns 200', async () => {
  const { createApp } = await import('./app.ts');
  const app = createApp();
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});
