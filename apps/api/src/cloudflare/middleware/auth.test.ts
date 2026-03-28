import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.ts';

test('hashPassword produces pbkdf2 format', async () => {
  const hash = await hashPassword('secret');
  assert.ok(hash.startsWith('pbkdf2:sha256:'));
  assert.equal(hash.split(':').length, 5);
});

test('verifyPassword returns true for correct password', async () => {
  const hash = await hashPassword('mypassword');
  assert.equal(await verifyPassword('mypassword', hash), true);
});

test('verifyPassword returns false for wrong password', async () => {
  const hash = await hashPassword('correct');
  assert.equal(await verifyPassword('wrong', hash), false);
});
