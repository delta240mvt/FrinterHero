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

test('resolveScopedSiteSlugForRequest uses admin override for admin api requests on any client', () => {
  process.env.SITE_SLUG = 'focusequalsfreedom';

  const request = new Request('https://focusequalsfreedom.com/api/reddit/gaps', {
    headers: { cookie: 'frinter_admin_site=przemyslawfilipiak' },
  });
  const fallbackRequest = new Request('https://focusequalsfreedom.com/admin', {
    headers: { cookie: 'frinter_admin_site=przemyslawfilipiak' },
  });
  const authRequest = new Request('https://focusequalsfreedom.com/api/auth', {
    headers: { cookie: 'frinter_admin_site=przemyslawfilipiak' },
  });

  assert.equal(resolveScopedSiteSlugForRequest(request), 'przemyslawfilipiak');
  assert.equal(resolveScopedSiteSlugForRequest(fallbackRequest), 'focusequalsfreedom');
  assert.equal(resolveScopedSiteSlugForRequest(authRequest), 'focusequalsfreedom');
});
