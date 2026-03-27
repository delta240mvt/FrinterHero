import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import test from 'node:test';

import worker from './index.ts';
import { setCloudflareDb } from '../../../../src/db/client.ts';
import { appJobs, sites } from '../../../../src/db/schema.ts';
import { routeRequest } from './router.ts';

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
          where: () => ({
            limit: async (count: number) => rows.slice(0, count),
          }),
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
}

function createApiEnv(queueMessages: unknown[]) {
  return {
    API_BASE_URL: 'https://api.example.com',
    APP_ENV: 'test',
    ASSETS_BUCKET: {},
    FOCUS_HOST: 'focusequalsfreedom.com',
    FRINTER_HOST: 'frinter.pl',
    HYPERDRIVE: {},
    JOB_QUEUE: {
      send(message: unknown) {
        queueMessages.push(message);
      },
    },
    PRZEM_HOST: 'przemyslawfilipiak.com',
  };
}

afterEach(() => {
  setCloudflareDb({
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
