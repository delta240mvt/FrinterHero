import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

test('GET /v1/admin/geo/runs without auth returns 401', async () => {
  const { geoRouter } = await import('./geo.ts');
  const app = new Hono();
  app.route('/', geoRouter);
  const res = await app.request('/v1/admin/geo/runs');
  assert.equal(res.status, 401);
});

test('GET /v1/admin/content-gaps without auth returns 401', async () => {
  const { contentGapsRouter } = await import('./content-gaps.ts');
  const app = new Hono();
  app.route('/', contentGapsRouter);
  const res = await app.request('/v1/admin/content-gaps');
  assert.equal(res.status, 401);
});
