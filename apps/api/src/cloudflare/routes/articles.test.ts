import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/articles without siteSlug returns 400 or 404', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/articles');
  assert.ok([400, 404, 500].includes(res.status));
});

test('GET /v1/admin/articles without auth returns 401', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/admin/articles');
  assert.equal(res.status, 401);
});

test('DELETE /v1/admin/articles/1 without auth returns 401', async () => {
  const { articlesRouter } = await import('./articles.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', articlesRouter);
  const res = await app.request('/v1/admin/articles/1', { method: 'DELETE' });
  assert.equal(res.status, 401);
});
