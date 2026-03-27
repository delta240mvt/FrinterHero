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
    'API_BASE_URL',
    'FRINTER_HOST',
    'FOCUS_HOST',
    'PRZEM_HOST',
  ]);
});

test('getTenantHostEntries normalizes mixed-case and www-prefixed hostnames', () => {
  const entries = getTenantHostEntries({
    FRINTER_HOST: 'WWW.Frinter.PL',
    FOCUS_HOST: ' www.FocusEqualsFreedom.com ',
    PRZEM_HOST: 'PRZEMYSLAWFILIPIAK.COM',
  });

  assert.deepEqual(
    entries.map((entry) => entry.hostname),
    ['frinter.pl', 'focusequalsfreedom.com', 'przemyslawfilipiak.com'],
  );
});

test('getTenantHostEntries rejects blank tenant host bindings', () => {
  assert.throws(
    () =>
      getTenantHostEntries({
        FRINTER_HOST: '',
        FOCUS_HOST: 'focusequalsfreedom.com',
        PRZEM_HOST: 'przemyslawfilipiak.com',
      }),
    /FRINTER_HOST/,
  );
});
