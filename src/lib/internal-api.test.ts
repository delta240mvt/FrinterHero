import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeScopedSiteSlug,
  resolveAdminActiveSiteSlug,
  resolveScopedSiteSlugForRequest,
} from './internal-api.ts';

test('normalizeScopedSiteSlug accepts only known tenant slugs', () => {
  assert.equal(normalizeScopedSiteSlug('frinter', 'przemyslawfilipiak'), 'frinter');
  assert.equal(normalizeScopedSiteSlug('unknown-tenant', 'przemyslawfilipiak'), 'przemyslawfilipiak');
});

test('resolveAdminActiveSiteSlug reads the frinter admin cookie', () => {
  assert.equal(
    resolveAdminActiveSiteSlug('session=abc; frinter_admin_site=focusequalsfreedom', 'frinter'),
    'focusequalsfreedom',
  );
  assert.equal(resolveAdminActiveSiteSlug('session=abc', 'frinter'), 'frinter');
});

test('resolveScopedSiteSlugForRequest uses admin override only for frinter api requests', () => {
  const request = new Request('https://frinter.app/api/reddit/gaps', {
    headers: { cookie: 'frinter_admin_site=przemyslawfilipiak' },
  });
  const fallbackRequest = new Request('https://frinter.app/admin', {
    headers: { cookie: 'frinter_admin_site=przemyslawfilipiak' },
  });

  process.env.SITE_SLUG = 'frinter';
  assert.equal(resolveScopedSiteSlugForRequest(request), 'przemyslawfilipiak');
  assert.equal(resolveScopedSiteSlugForRequest(fallbackRequest), 'frinter');
});
