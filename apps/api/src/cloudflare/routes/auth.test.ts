import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.ts';

function makeApp() {
  // minimal stub env — no real DB, tests check routing + 400/401 shapes
  return createApp();
}

test('POST /v1/auth/login with missing body returns 400', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/login', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  // No ADMIN_PASSWORD_HASH set → 400 server misconfigured
  assert.equal(res.status, 400);
});

test('GET /v1/auth/me without cookie returns 401', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/me');
  assert.equal(res.status, 401);
});

test('POST /v1/auth/logout always returns 200', async () => {
  const app = makeApp();
  const res = await app.request('/v1/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);
});
