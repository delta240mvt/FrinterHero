import test from 'node:test';
import assert from 'node:assert/strict';

test('GET /v1/admin/knowledge-base without auth returns 401', async () => {
  const { knowledgeRouter } = await import('./knowledge.ts');
  const { Hono } = await import('hono');
  const app = new Hono();
  app.route('/', knowledgeRouter);
  const res = await app.request('/v1/admin/knowledge-base');
  assert.equal(res.status, 401);
});
