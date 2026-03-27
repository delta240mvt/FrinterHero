import assert from 'node:assert/strict';
import test from 'node:test';

import { proxyToNodeApi } from './proxy.ts';
import type { ApiEnv } from '../env.ts';

function makeEnv(nodeApiUrl: string): ApiEnv {
  return {
    APP_ENV: 'test',
    API_BASE_URL: 'https://api.example.com',
    NODE_API_URL: nodeApiUrl,
    FRINTER_HOST: 'frinter.pl',
    FOCUS_HOST: 'focusequalsfreedom.com',
    PRZEM_HOST: 'przemyslawfilipiak.com',
    HYPERDRIVE: {},
    ASSETS_BUCKET: {},
    JOB_QUEUE: {},
  };
}

test('proxyToNodeApi returns 503 when NODE_API_URL is not set', async () => {
  const env = makeEnv('');
  const request = new Request('https://api.example.com/v1/auth/me', { method: 'GET' });
  const response = await proxyToNodeApi(request, env);

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), { error: 'NODE_API_URL not configured' });
});

test('proxyToNodeApi forwards request to correct upstream URL', async () => {
  let capturedRequest: Request | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    capturedRequest = input instanceof Request ? input : new Request(input);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const env = makeEnv('http://127.0.0.1:3001');
    const request = new Request('https://api.example.com/v1/auth/me?foo=bar', { method: 'GET' });
    const response = await proxyToNodeApi(request, env);

    assert.equal(response.status, 200);
    assert.ok(capturedRequest, 'fetch should have been called');
    assert.equal(capturedRequest!.url, 'http://127.0.0.1:3001/v1/auth/me?foo=bar');
    assert.equal(capturedRequest!.method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxyToNodeApi preserves request method and body', async () => {
  let capturedRequest: Request | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    capturedRequest = input instanceof Request ? input : new Request(input);
    return new Response(JSON.stringify({ created: true }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const env = makeEnv('http://127.0.0.1:3001');
    const body = JSON.stringify({ username: 'test', password: 'secret' });
    const request = new Request('https://api.example.com/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);
    const response = await proxyToNodeApi(request, env);

    assert.equal(response.status, 201);
    assert.ok(capturedRequest, 'fetch should have been called');
    assert.equal(capturedRequest!.method, 'POST');
    assert.equal(capturedRequest!.url, 'http://127.0.0.1:3001/v1/auth/login');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxyToNodeApi preserves cookie and auth headers', async () => {
  let capturedRequest: Request | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    capturedRequest = input instanceof Request ? input : new Request(input);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const env = makeEnv('http://127.0.0.1:3001');
    const request = new Request('https://api.example.com/v1/auth/me', {
      method: 'GET',
      headers: {
        cookie: 'session=abc123',
        authorization: 'Bearer token456',
      },
    });
    await proxyToNodeApi(request, env);

    assert.ok(capturedRequest, 'fetch should have been called');
    assert.equal(capturedRequest!.headers.get('cookie'), 'session=abc123');
    assert.equal(capturedRequest!.headers.get('authorization'), 'Bearer token456');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxyToNodeApi sets x-forwarded-proto header', async () => {
  let capturedRequest: Request | undefined;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    capturedRequest = input instanceof Request ? input : new Request(input);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const env = makeEnv('http://127.0.0.1:3001');
    const request = new Request('https://api.example.com/v1/auth/me', { method: 'GET' });
    await proxyToNodeApi(request, env);

    assert.ok(capturedRequest, 'fetch should have been called');
    assert.equal(capturedRequest!.headers.get('x-forwarded-proto'), 'https');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxyToNodeApi returns 502 when upstream fetch throws', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  try {
    const env = makeEnv('http://127.0.0.1:3001');
    const request = new Request('https://api.example.com/v1/auth/me', { method: 'GET' });
    const response = await proxyToNodeApi(request, env);

    assert.equal(response.status, 502);
    assert.equal(response.headers.get('content-type'), 'application/json');
    const body = await response.json() as { error: string; detail: string };
    assert.equal(body.error, 'Upstream API unavailable');
    assert.equal(body.detail, 'ECONNREFUSED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
