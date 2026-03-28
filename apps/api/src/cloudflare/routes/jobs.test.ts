import test from 'node:test';
import assert from 'node:assert/strict';

test('POST /v1/jobs/invalid-topic returns 404', async () => {
  const { jobsRouter } = await import('./jobs.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', jobsRouter);
  const res = await app.request('/v1/jobs/notreal', { method: 'POST' });
  assert.equal(res.status, 404);
});
