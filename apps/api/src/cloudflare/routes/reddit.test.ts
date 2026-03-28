import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/reddit/targets without auth returns 401', async () => {
  const { redditRouter } = await import('./reddit.ts');
  const app = new Hono();
  app.route('/', redditRouter);
  const res = await app.request('/v1/admin/reddit/targets');
  assert.equal(res.status, 401);
});

test('POST /v1/admin/reddit/gaps/auto-filter without auth returns 401', async () => {
  const { redditRouter } = await import('./reddit.ts');
  const app = new Hono();
  app.route('/', redditRouter);
  const res = await app.request('/v1/admin/reddit/gaps/auto-filter', { method: 'POST' });
  assert.equal(res.status, 401);
});
