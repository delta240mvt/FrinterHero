import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fetchInternalApiJson, proxyInternalApiRequest } from './internal-api';

function snapshotEnv() {
  return {
    API_BASE_URL: process.env.API_BASE_URL,
    SITE_SLUG: process.env.SITE_SLUG,
    fetch: globalThis.fetch,
  };
}

function restoreEnv(env: ReturnType<typeof snapshotEnv>) {
  process.env.API_BASE_URL = env.API_BASE_URL;
  process.env.SITE_SLUG = env.SITE_SLUG;
  globalThis.fetch = env.fetch;
}

function makeCookies(value: string) {
  return {
    get: () => ({ value, json: value, number: Number(value), boolean: value === 'true' }),
  } as unknown as Parameters<typeof proxyInternalApiRequest>[0]['cookies'];
}

describe('internal-api helpers', () => {
  it('adds the current site slug when proxying an internal request', async () => {
    const env = snapshotEnv();
    process.env.API_BASE_URL = 'https://api.example.test';
    process.env.SITE_SLUG = 'frinter';

    let capturedRequest: Request | null = null;
    globalThis.fetch = (async (input, init) => {
      capturedRequest = new Request(input, init);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      const request = new Request('https://app.example.test/api/source?existing=1', {
        method: 'POST',
        headers: { cookie: 'session=abc' },
        body: JSON.stringify({ hello: 'world' }),
      });

      const options = {
        request,
        cookies: makeCookies('session=abc') as Parameters<typeof proxyInternalApiRequest>[0]['cookies'],
        pathname: '/v1/test',
        includeSiteSlug: true,
      } satisfies Parameters<typeof proxyInternalApiRequest>[0];

      const response = await proxyInternalApiRequest(options);

      assert.equal(response.status, 204);
      if (!capturedRequest) throw new Error('expected a captured request');
      const captured = capturedRequest as Request;
      const url = new URL(captured.url);
      assert.equal(url.origin, 'https://api.example.test');
      assert.equal(url.pathname, '/v1/test');
      assert.equal(url.searchParams.get('existing'), '1');
      assert.equal(url.searchParams.get('siteSlug'), 'frinter');
      assert.equal(captured.headers.get('cookie'), 'session=abc');
      assert.equal(await captured.text(), JSON.stringify({ hello: 'world' }));
      assert.equal(captured.method, 'POST');
    } finally {
      restoreEnv(env);
    }
  });

  it('adds the current site slug when fetching internal JSON', async () => {
    const env = snapshotEnv();
    process.env.API_BASE_URL = 'https://api.example.test';
    process.env.SITE_SLUG = 'focusequalsfreedom';

    let capturedRequest: Request | null = null;
    globalThis.fetch = (async (input, init) => {
      capturedRequest = new Request(input, init);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const request = new Request('https://app.example.test/api/source?existing=1');
      const options = {
        request,
        pathname: '/v1/jobs/latest',
        query: { topic: 'youtube', limit: 5 },
        includeSiteSlug: true,
      } satisfies Parameters<typeof fetchInternalApiJson>[0];

      const { response, data } = await fetchInternalApiJson(options);

      assert.equal(response.status, 200);
      assert.deepEqual(data, { ok: true });
      if (!capturedRequest) throw new Error('expected a captured request');
      const captured = capturedRequest as Request;
      const url = new URL(captured.url);
      assert.equal(url.origin, 'https://api.example.test');
      assert.equal(url.pathname, '/v1/jobs/latest');
      assert.equal(url.searchParams.get('existing'), '1');
      assert.equal(url.searchParams.get('topic'), 'youtube');
      assert.equal(url.searchParams.get('limit'), '5');
      assert.equal(url.searchParams.get('siteSlug'), 'focusequalsfreedom');
      assert.equal(captured.headers.get('content-type'), 'application/json');
    } finally {
      restoreEnv(env);
    }
  });
});
