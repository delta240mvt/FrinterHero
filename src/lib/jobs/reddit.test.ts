import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRedditApifyInput, parseRedditTargets, runRedditScraperJob } from './reddit';

test('parseRedditTargets preserves typed subreddit and keyword targets', () => {
  const targets = parseRedditTargets('r/productivity, brain fog after lunch ');
  assert.deepEqual(targets, [
    { value: 'r/productivity', type: 'subreddit' },
    { value: 'brain fog after lunch', type: 'keyword_search' },
  ]);
});

test('buildRedditApifyInput creates keyword search payloads in niche subreddits', () => {
  const input = buildRedditApifyInput({ value: 'brain fog after lunch', type: 'keyword_search' }, 3);
  const startUrl = ((input.startUrls as Array<{ url: string }>)[0] || {}).url;
  assert.match(startUrl, /restrict_sr=1/);
  assert.match(startUrl, /brain%20fog%20after%20lunch/);
  assert.equal(input.maxItems, 3);
});

test('runRedditScraperJob marks the scrape run as failed before rethrowing top-level errors', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    update() {
      return {
        set(value: Record<string, unknown>) {
          updates.push(value);
          return {
            where: async () => undefined,
          };
        },
      };
    },
  } as any;

  await assert.rejects(
    () =>
      runRedditScraperJob(
        {
          scrapeTargets: '',
          scrapeRunId: 12,
          siteId: null,
          maxItems: 3,
          chunkSize: 10,
          model: 'test-model',
        },
        { db, logger: { log() {} } as Console },
      ),
    /SCRAPE_TARGETS and SCRAPE_RUN_ID env vars required/,
  );

  assert.ok(updates.some((update) => update.status === 'failed' && update.errorMessage));
});
