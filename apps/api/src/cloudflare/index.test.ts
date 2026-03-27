import assert from 'node:assert/strict';
import test from 'node:test';

import worker from './index.ts';

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
