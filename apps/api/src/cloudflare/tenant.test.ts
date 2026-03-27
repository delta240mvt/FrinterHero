import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTenantRequest } from './tenant.ts';

test('resolveTenantRequest maps frinter host to frinter site slug', () => {
  const result = resolveTenantRequest(new URL('https://frinter.pl/admin'), {
    FRINTER_HOST: 'frinter.pl',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });

  assert.equal(result.siteSlug, 'frinter');
  assert.equal(result.hostname, 'frinter.pl');
});

test('resolveTenantRequest rejects unknown hostnames', () => {
  assert.throws(
    () =>
      resolveTenantRequest(new URL('https://unknown.example/admin'), {
        FRINTER_HOST: 'frinter.pl',
        FOCUS_HOST: 'focusequalsfreedom.com',
        PRZEM_HOST: 'przemyslawfilipiak.com',
      }),
    /Unknown tenant host/,
  );
});

test('resolveTenantRequest matches mixed-case hosts and strips www prefix', () => {
  const result = resolveTenantRequest(new URL('https://WWW.Frinter.PL/admin'), {
    FRINTER_HOST: ' www.FRINTER.pl ',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
  });

  assert.equal(result.siteSlug, 'frinter');
  assert.equal(result.hostname, 'frinter.pl');
});

test('resolveTenantRequest rejects blank tenant host bindings', () => {
  assert.throws(
    () =>
      resolveTenantRequest(new URL('https://frinter.pl/admin'), {
        FRINTER_HOST: '   ',
        FOCUS_HOST: 'focusequalsfreedom.com',
        PRZEM_HOST: 'przemyslawfilipiak.com',
      }),
    /FRINTER_HOST/,
  );
});
