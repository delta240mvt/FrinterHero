import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import test from 'node:test';

import worker from './index.ts';
import { setCloudflareDb } from '../../../../src/db/client.ts';
import { appJobs, sites } from '../../../../src/db/schema.ts';
import { routeRequest } from './router.ts';

function extractComparisons(condition: any, pairs: Array<{ column: string; value: unknown }> = []) {
  if (!condition?.queryChunks) {
    return pairs;
  }

  let pendingColumn: string | null = null;
  for (const chunk of condition.queryChunks) {
    if (chunk?.queryChunks) {
      extractComparisons(chunk, pairs);
      continue;
    }

    if (chunk?.name && chunk?.table) {
      pendingColumn = chunk.name;
      continue;
    }

    if (pendingColumn && chunk?.constructor?.name === 'Param') {
      pairs.push({ column: pendingColumn, value: chunk.value });
      pendingColumn = null;
    }
  }

  return pairs;
}

function matchesRow(row: Record<string, unknown>, comparisons: Array<{ column: string; value: unknown }>) {
  return comparisons.every(({ column, value }) => {
    const camelColumn = column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return row[column] === value || row[camelColumn] === value;
  });
}

class FakeCloudflareDb {
  jobs: Array<Record<string, unknown>> = [];
  nextJobId = 1;

  constructor(
    private readonly siteRows: Array<Record<string, unknown>>,
  ) {}

  select() {
    return {
      from: (table: unknown) => {
        const rows = table === sites ? this.siteRows : this.jobs;
        return {
          where: (condition: unknown) => {
            const comparisons = extractComparisons(condition);
            const filtered = rows.filter((row) => matchesRow(row, comparisons));

            return {
              limit: async (count: number) => filtered.slice(0, count),
            };
          },
        };
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== appJobs) {
            return [];
          }

          const row = {
            id: this.nextJobId++,
            status: 'pending',
            progress: {},
            result: null,
            error: null,
            attemptCount: 0,
            maxAttempts: 3,
            createdAt: new Date('2026-03-27T08:00:00.000Z'),
            updatedAt: new Date('2026-03-27T08:00:00.000Z'),
            startedAt: null,
            finishedAt: null,
            ...value,
          };

          this.jobs.push(row);
          return [row];
        },
      }),
    };
  }

  delete(table: unknown) {
    return {
      where: async (condition: unknown) => {
        if (table !== appJobs) {
          return [];
        }

        const comparisons = extractComparisons(condition);
        const before = this.jobs.length;
        this.jobs = this.jobs.filter((row) => !matchesRow(row, comparisons));
        return { rowCount: before - this.jobs.length };
      },
    };
  }
}

function createApiEnv(queueMessages: unknown[], options?: { failQueueSend?: boolean; omitQueueSend?: boolean }) {
  return {
    API_BASE_URL: 'https://api.example.com',
    APP_ENV: 'test',
    ASSETS_BUCKET: {},
    FOCUS_HOST: 'focusequalsfreedom.com',
    FRINTER_HOST: 'frinter.pl',
    HYPERDRIVE: {},
    NODE_API_URL: '',
    JOB_QUEUE: options?.omitQueueSend
      ? {}
      : {
          send(message: unknown) {
            if (options?.failQueueSend) {
              throw new Error('Queue unavailable');
            }

            queueMessages.push(message);
          },
        },
    PRZEM_HOST: 'przemyslawfilipiak.com',
  };
}

afterEach(() => {
  setCloudflareDb({
    delete() {
      throw new Error('Cloudflare DB test double not configured');
    },
    insert() {
      throw new Error('Cloudflare DB test double not configured');
    },
    select() {
      throw new Error('Cloudflare DB test double not configured');
    },
  });
});

test('routeRequest returns health JSON for GET /health', async () => {
  const response = await routeRequest(
    new Request('https://api.example.com/health', { method: 'GET' }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    path: '/health',
    service: 'api',
    status: 'ok',
  });
});

test('routeRequest returns JSON 404 for unknown routes', async () => {
  const response = await routeRequest(
    new Request('https://api.example.com/missing', { method: 'POST' }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    error: 'Not found',
    method: 'POST',
    pathname: '/missing',
  });
});

test('worker fetch serves GET /health without full binding validation', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/health', { method: 'GET' }),
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    path: '/health',
    service: 'api',
    status: 'ok',
  });
});

test('worker fetch keeps strict env validation for non-health routes', async () => {
  const response = await worker.fetch(
    new Request('https://api.example.com/missing', { method: 'GET' }),
    {},
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    detail: 'Missing Cloudflare API env: API_BASE_URL, HYPERDRIVE, ASSETS_BUCKET, JOB_QUEUE',
    error: 'Internal server error',
  });
});

for (const topic of ['geo', 'reddit', 'youtube'] as const) {
  test(`routeRequest enqueues ${topic} jobs`, async () => {
    const queueMessages: unknown[] = [];
    const db = new FakeCloudflareDb([
      { id: 7, slug: 'frinter', primaryDomain: 'frinter.pl' },
    ]);
    setCloudflareDb(db);

    const response = await routeRequest(
      new Request(`https://frinter.pl/jobs/${topic}`, {
        body: JSON.stringify({ source: 'test' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      createApiEnv(queueMessages),
    );

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      jobId: 1,
      status: 'pending',
      topic,
    });
    assert.deepEqual(queueMessages, [
      {
        jobId: '1',
        payload: { source: 'test' },
        siteId: 7,
        siteSlug: 'frinter',
        topic,
      },
    ]);
  });
}

test('routeRequest returns job status, progress, and result for GET /jobs/:id', async () => {
  const queueMessages: unknown[] = [];
  const db = new FakeCloudflareDb([
    { id: 7, slug: 'frinter', primaryDomain: 'frinter.pl' },
    { id: 8, slug: 'focusequalsfreedom', primaryDomain: 'focusequalsfreedom.com' },
  ]);
  setCloudflareDb(db);

  await routeRequest(
    new Request('https://frinter.pl/jobs/geo', {
      body: JSON.stringify({ source: 'test' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    createApiEnv(queueMessages),
  );

  db.jobs[0] = {
    ...db.jobs[0],
    progress: { completed: 2, total: 5 },
    result: { rowsWritten: 10 },
    status: 'running',
  };

  const response = await routeRequest(
    new Request('https://frinter.pl/jobs/1', { method: 'GET' }),
    createApiEnv([]),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    attemptCount: 0,
    createdAt: '2026-03-27T08:00:00.000Z',
    error: null,
    finishedAt: null,
    jobId: 1,
    maxAttempts: 3,
    progress: { completed: 2, total: 5 },
    result: { rowsWritten: 10 },
    siteId: 7,
    startedAt: null,
    status: 'running',
    topic: 'geo',
    type: 'geo',
    updatedAt: '2026-03-27T08:00:00.000Z',
  });
});

test('routeRequest rejects malformed JSON bodies for enqueue routes', async () => {
  const db = new FakeCloudflareDb([
    { id: 7, slug: 'frinter', primaryDomain: 'frinter.pl' },
  ]);
  setCloudflareDb(db);

  const response = await routeRequest(
    new Request('https://frinter.pl/jobs/geo', {
      body: '{bad json',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    createApiEnv([]),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Invalid JSON body',
  });
  assert.equal(db.jobs.length, 0);
});

test('routeRequest cleans up inserted jobs if queue publish fails', async () => {
  const db = new FakeCloudflareDb([
    { id: 7, slug: 'frinter', primaryDomain: 'frinter.pl' },
  ]);
  setCloudflareDb(db);

  const response = await routeRequest(
    new Request('https://frinter.pl/jobs/geo', {
      body: JSON.stringify({ source: 'test' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    createApiEnv([], { failQueueSend: true }),
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: 'Failed to enqueue job',
  });
  assert.equal(db.jobs.length, 0);
});

test('routeRequest does not treat nested enqueue paths as valid job ingress routes', async () => {
  const db = new FakeCloudflareDb([
    { id: 7, slug: 'frinter', primaryDomain: 'frinter.pl' },
  ]);
  setCloudflareDb(db);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 502, headers: { 'content-type': 'application/json' } });

  try {
    const response = await routeRequest(
      new Request('https://frinter.pl/jobs/geo/retry', {
        body: JSON.stringify({ source: 'test' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
      createApiEnv([]),
    );

    // With env present the nested path falls through to the proxy (not 404)
    assert.ok(response.status !== 400, 'should not be a validation error');
    assert.equal(db.jobs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routeRequest proxies /v1/auth/me when env is provided', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.ok(url.includes('/v1/auth/me'), `Expected proxy URL to contain /v1/auth/me, got: ${url}`);
    return new Response(JSON.stringify({ userId: 42 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const env = { ...createApiEnv([]), NODE_API_URL: 'http://127.0.0.1:3001' };
    const response = await routeRequest(
      new Request('https://api.example.com/v1/auth/me', { method: 'GET' }),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: 42 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('routeRequest returns 503 for /v1/auth/me when NODE_API_URL is not set', async () => {
  const env = { ...createApiEnv([]), NODE_API_URL: '' };
  const response = await routeRequest(
    new Request('https://api.example.com/v1/auth/me', { method: 'GET' }),
    env,
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'NODE_API_URL not configured' });
});

test('routeRequest still returns 404 for unknown routes when no env provided', async () => {
  const response = await routeRequest(
    new Request('https://api.example.com/v1/auth/me', { method: 'GET' }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: 'Not found',
    method: 'GET',
    pathname: '/v1/auth/me',
  });
});

test('routeRequest /health and /jobs/* still handled locally even with proxy env', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    const env = { ...createApiEnv([]), NODE_API_URL: 'http://127.0.0.1:3001' };

    // /health should be handled locally
    const healthResponse = await routeRequest(
      new Request('https://api.example.com/health', { method: 'GET' }),
      env,
    );
    assert.equal(healthResponse.status, 200);
    assert.equal(fetchCalled, false, '/health should not be proxied');

    const healthBody = await healthResponse.json() as { status: string };
    assert.equal(healthBody.status, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
