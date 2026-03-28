import assert from 'node:assert/strict';
import test from 'node:test';

import worker from './index.ts';

// Minimal stub env with all workflow bindings
function createMinimalEnv(recorded: Array<{ binding: string; options: unknown }> = []) {
  function binding(name: string) {
    return {
      async create(options: unknown) {
        recorded.push({ binding: name, options });
        return { id: `${name}-instance` };
      },
    };
  }
  return {
    GEO_RUN_WORKFLOW: binding('geo'),
    REDDIT_RUN_WORKFLOW: binding('reddit'),
    YOUTUBE_RUN_WORKFLOW: binding('youtube'),
    BC_SCRAPE_WORKFLOW: binding('bc-scrape'),
    BC_PARSE_WORKFLOW: binding('bc-parse'),
    BC_SELECTOR_WORKFLOW: binding('bc-selector'),
    BC_CLUSTER_WORKFLOW: binding('bc-cluster'),
    BC_GENERATE_WORKFLOW: binding('bc-generate'),
    SH_COPY_WORKFLOW: binding('sh-copy'),
    SH_VIDEO_WORKFLOW: binding('sh-video'),
    SH_PUBLISH_WORKFLOW: binding('sh-publish'),
  } as never;
}

function createQueueMessage(topic: string) {
  return {
    jobId: `job-${topic}`,
    payload: { source: topic },
    siteId: 7,
    siteSlug: 'frinter' as const,
    topic,
  };
}

function createWorkflowBinding(recorded: Array<{ binding: string; options: unknown }>, binding: string) {
  return {
    async create(options: unknown) {
      recorded.push({ binding, options });
      return { id: `${binding}-instance` };
    },
  };
}

test('worker.queue starts GEO, Reddit, and YouTube workflows via bound workflow deps', async () => {
  const recorded: Array<{ binding: string; options: unknown }> = [];
  const acked: string[] = [];

  await worker.queue(
    {
      messages: ['geo', 'reddit', 'youtube'].map((topic) => ({
        ack() {
          acked.push(topic);
        },
        body: createQueueMessage(topic),
      })),
    },
    {
      GEO_RUN_WORKFLOW: createWorkflowBinding(recorded, 'geo'),
      REDDIT_RUN_WORKFLOW: createWorkflowBinding(recorded, 'reddit'),
      YOUTUBE_RUN_WORKFLOW: createWorkflowBinding(recorded, 'youtube'),
      BC_SCRAPE_WORKFLOW: createWorkflowBinding(recorded, 'bc-scrape'),
      BC_PARSE_WORKFLOW: createWorkflowBinding(recorded, 'bc-parse'),
      BC_SELECTOR_WORKFLOW: createWorkflowBinding(recorded, 'bc-selector'),
      BC_CLUSTER_WORKFLOW: createWorkflowBinding(recorded, 'bc-cluster'),
      BC_GENERATE_WORKFLOW: createWorkflowBinding(recorded, 'bc-generate'),
      SH_COPY_WORKFLOW: createWorkflowBinding(recorded, 'sh-copy'),
      SH_VIDEO_WORKFLOW: createWorkflowBinding(recorded, 'sh-video'),
      SH_PUBLISH_WORKFLOW: createWorkflowBinding(recorded, 'sh-publish'),
    } as never,
  );

  assert.deepEqual(
    recorded,
    [
      { binding: 'geo', options: { id: 'job-job-geo', params: createQueueMessage('geo') } },
      { binding: 'reddit', options: { id: 'job-job-reddit', params: createQueueMessage('reddit') } },
      { binding: 'youtube', options: { id: 'job-job-youtube', params: createQueueMessage('youtube') } },
    ],
  );
  assert.deepEqual(acked, ['geo', 'reddit', 'youtube']);
});

test('worker.queue dispatches bc-scrape topic to the correct workflow binding', async () => {
  const recorded: Array<{ binding: string; options: unknown }> = [];
  let acked = false;

  await worker.queue(
    {
      messages: [
        {
          ack() {
            acked = true;
          },
          body: createQueueMessage('bc-scrape'),
        },
      ],
    },
    {
      GEO_RUN_WORKFLOW: createWorkflowBinding(recorded, 'geo'),
      REDDIT_RUN_WORKFLOW: createWorkflowBinding(recorded, 'reddit'),
      YOUTUBE_RUN_WORKFLOW: createWorkflowBinding(recorded, 'youtube'),
      BC_SCRAPE_WORKFLOW: createWorkflowBinding(recorded, 'bc-scrape'),
      BC_PARSE_WORKFLOW: createWorkflowBinding(recorded, 'bc-parse'),
      BC_SELECTOR_WORKFLOW: createWorkflowBinding(recorded, 'bc-selector'),
      BC_CLUSTER_WORKFLOW: createWorkflowBinding(recorded, 'bc-cluster'),
      BC_GENERATE_WORKFLOW: createWorkflowBinding(recorded, 'bc-generate'),
      SH_COPY_WORKFLOW: createWorkflowBinding(recorded, 'sh-copy'),
      SH_VIDEO_WORKFLOW: createWorkflowBinding(recorded, 'sh-video'),
      SH_PUBLISH_WORKFLOW: createWorkflowBinding(recorded, 'sh-publish'),
    } as never,
  );

  assert.equal(acked, true);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].binding, 'bc-scrape');
});

test('worker.fetch returns a response and does not throw when logging', async () => {
  const request = new Request('http://localhost/health');
  const response = await worker.fetch(request, {} as never, {} as never);
  // /health should return a valid HTTP response (not throw)
  assert.ok(response instanceof Response);
  assert.ok(response.status >= 200 && response.status < 600);
});

test('worker.fetch returns a structured JSON 500 on unhandled exception', async () => {
  // Simulate an unhandled exception by monkey-patching honoApp.fetch temporarily
  const { honoApp } = await import('./app.ts');
  const original = honoApp.fetch.bind(honoApp);
  (honoApp as unknown as { fetch: unknown }).fetch = () => { throw new Error('boom'); };
  try {
    const request = new Request('http://localhost/api/any-route');
    const response = await worker.fetch(request, {} as never, {} as never);
    assert.equal(response.status, 500);
    const body = await response.json() as { error: string };
    assert.equal(body.error, 'Internal server error');
  } finally {
    (honoApp as unknown as { fetch: unknown }).fetch = original;
  }
});

test('worker.queue emits structured log and does not swallow errors for missing bindings', async () => {
  let threw = false;
  try {
    await worker.queue({ messages: [] }, {} as never);
  } catch {
    threw = true;
  }
  assert.equal(threw, true, 'queue should re-throw when bindings are missing');
});
