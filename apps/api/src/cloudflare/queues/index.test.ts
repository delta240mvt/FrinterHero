import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUDFLARE_SITE_SLUGS } from '../../../../../src/lib/cloudflare/bindings.ts';
import { JOB_TOPICS, type JobQueueMessage, type JobTopic } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import {
  handleJobQueueBatch,
  parseJobQueueMessage,
  type JobQueueBatchLike,
  type JobQueueConsumerDeps,
} from './index.ts';

function createMessage(topic: JobTopic, siteSlug: JobQueueMessage['siteSlug'] = 'frinter'): JobQueueMessage<{ source: string }> {
  return {
    jobId: `job-${topic}`,
    payload: { source: topic },
    siteId: 7,
    siteSlug,
    topic,
  };
}

function createDeps(recorded: Array<{ starter: string; message: JobQueueMessage }>): JobQueueConsumerDeps {
  return {
    startBcClusterWorkflow: async (message) => {
      recorded.push({ starter: 'bc-cluster', message });
    },
    startBcGenerateWorkflow: async (message) => {
      recorded.push({ starter: 'bc-generate', message });
    },
    startBcParseWorkflow: async (message) => {
      recorded.push({ starter: 'bc-parse', message });
    },
    startBcScrapeWorkflow: async (message) => {
      recorded.push({ starter: 'bc-scrape', message });
    },
    startBcSelectorWorkflow: async (message) => {
      recorded.push({ starter: 'bc-selector', message });
    },
    startGeoWorkflow: async (message) => {
      recorded.push({ starter: 'geo', message });
    },
    startRedditWorkflow: async (message) => {
      recorded.push({ starter: 'reddit', message });
    },
    startShCopyWorkflow: async (message) => {
      recorded.push({ starter: 'sh-copy', message });
    },
    startShPublishWorkflow: async (message) => {
      recorded.push({ starter: 'sh-publish', message });
    },
    startShVideoWorkflow: async (message) => {
      recorded.push({ starter: 'sh-video', message });
    },
    startYoutubeWorkflow: async (message) => {
      recorded.push({ starter: 'youtube', message });
    },
  };
}

test('parseJobQueueMessage validates the shared queue message contract', () => {
  for (const siteSlug of CLOUDFLARE_SITE_SLUGS) {
    const parsed = parseJobQueueMessage(createMessage('geo', siteSlug));
    assert.deepEqual(parsed, createMessage('geo', siteSlug));
  }
  assert.throws(
    () => parseJobQueueMessage({ ...createMessage('geo'), jobId: '' }),
    /jobId is required/,
  );
  assert.throws(
    () => parseJobQueueMessage({ ...createMessage('geo'), siteSlug: '' }),
    /siteSlug is required/,
  );
  assert.throws(
    () => parseJobQueueMessage({ ...createMessage('geo'), siteSlug: 'unknown-site' }),
    /Unsupported siteSlug: unknown-site/,
  );
  assert.throws(
    () => parseJobQueueMessage({ ...createMessage('geo'), topic: 'not-real' }),
    /Unsupported job topic: not-real/,
  );
});

test('handleJobQueueBatch dispatches every supported topic to the matching workflow starter', async () => {
  const recorded: Array<{ starter: string; message: JobQueueMessage }> = [];
  const acked: string[] = [];
  const batch: JobQueueBatchLike = {
    messages: JOB_TOPICS.map((topic) => ({
      ack() {
        acked.push(topic);
      },
      body: createMessage(topic),
    })),
  };

  await handleJobQueueBatch(batch, createDeps(recorded));

  assert.deepEqual(
    recorded.map((entry) => entry.starter),
    JOB_TOPICS,
  );
  assert.deepEqual(acked, JOB_TOPICS);
});

test('handleJobQueueBatch rejects unsupported topics loudly and does not ack the bad message', async () => {
  const recorded: Array<{ starter: string; message: JobQueueMessage }> = [];
  let acked = false;
  const batch: JobQueueBatchLike = {
    messages: [
      {
        ack() {
          acked = true;
        },
        body: {
          ...createMessage('geo'),
          topic: 'unknown-topic',
        },
      },
    ],
  };

  await assert.rejects(() => handleJobQueueBatch(batch, createDeps(recorded)), /Unsupported job topic: unknown-topic/);
  assert.equal(acked, false);
  assert.equal(recorded.length, 0);
});

test('handleJobQueueBatch can ack valid but unsupported-for-this-runtime topics without dispatching them', async () => {
  const recorded: Array<{ starter: string; message: JobQueueMessage }> = [];
  let acked = false;

  await handleJobQueueBatch(
    {
      messages: [
        {
          ack() {
            acked = true;
          },
          body: createMessage('bc-scrape'),
        },
      ],
    },
    createDeps(recorded),
    {
      async onUnsupportedTopic(_message, entry) {
        entry.ack();
      },
      supportedTopics: ['geo', 'reddit', 'youtube'],
    },
  );

  assert.equal(acked, true);
  assert.equal(recorded.length, 0);
});
