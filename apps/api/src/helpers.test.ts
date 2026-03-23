import test from 'node:test';
import assert from 'node:assert/strict';

import { sessionCanAccessSite } from './helpers.ts';

test('sessionCanAccessSite allows global admin sessions', () => {
  assert.equal(sessionCanAccessSite({ siteId: null }, { id: 1 }), true);
});

test('sessionCanAccessSite blocks mismatched tenant-bound sessions', () => {
  assert.equal(sessionCanAccessSite({ siteId: 2 }, { id: 1 }), false);
  assert.equal(sessionCanAccessSite({ siteId: 1 }, { id: 1 }), true);
});
