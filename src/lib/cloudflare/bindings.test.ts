import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_CLOUDFLARE_BINDINGS,
  REQUIRED_CLOUDFLARE_VARS,
  getTenantHostEntries,
} from './bindings.ts';

test('getTenantHostEntries returns canonical site slug mappings', () => {
  const entries = getTenantHostEntries({
    FRINTER_HOST: 'frinter.pl',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });

  assert.deepEqual(entries, [
    { binding: 'FRINTER_HOST', hostname: 'frinter.pl', siteSlug: 'frinter' },
    { binding: 'FOCUS_HOST', hostname: 'focusequalsfreedom.com', siteSlug: 'focusequalsfreedom' },
    { binding: 'PRZEM_HOST', hostname: 'przemyslawfilipiak.com', siteSlug: 'przemyslawfilipiak' },
  ]);
});

test('bindings constants list the required shared worker bindings', () => {
  assert.deepEqual(REQUIRED_CLOUDFLARE_BINDINGS, ['HYPERDRIVE', 'ASSETS_BUCKET', 'JOB_QUEUE']);
  assert.deepEqual(REQUIRED_CLOUDFLARE_VARS, [
    'APP_ENV',
    'API_BASE_URL',
    'FRINTER_HOST',
    'FOCUS_HOST',
    'PRZEM_HOST',
  ]);
});
