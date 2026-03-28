import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/admin/dashboard without auth returns 401', async () => {
  const { adminRouter } = await import('./admin.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', adminRouter);
  const res = await app.request('/v1/admin/dashboard');
  assert.equal(res.status, 401);
});

test('GET /v1/sites/frinter/public-config with no db returns 404 or 500', async () => {
  const { sitesRouter } = await import('./sites.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', sitesRouter);
  const res = await app.request('/v1/sites/frinter/public-config');
  assert.ok([404, 500].includes(res.status));
});
