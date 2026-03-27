import test from 'node:test';
import assert from 'node:assert/strict';
import { extractYoutubeChannelIdentifier, runYoutubeScraperJob } from './youtube';

test('extractYoutubeChannelIdentifier supports handles, channel urls, and invalid values', () => {
  assert.equal(extractYoutubeChannelIdentifier('@frinterhero'), 'frinterhero');
  assert.equal(
    extractYoutubeChannelIdentifier('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'),
    'UCabcdefghijklmnopqrstuv',
  );
  assert.equal(extractYoutubeChannelIdentifier('https://www.youtube.com/user/frinterhero'), 'frinterhero');
  assert.equal(extractYoutubeChannelIdentifier('not a url'), null);
});

test('runYoutubeScraperJob marks the scrape run as failed before rethrowing top-level errors', async () => {
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
      runYoutubeScraperJob(
        {
          scrapeTargetIds: '',
          scrapeRunId: 21,
          siteId: null,
          maxComments: 100,
          chunkSize: 20,
          model: 'test-model',
          youtubeApiKey: '',
          maxVideosPerChannel: 5,
        },
        { db, logger: { log() {} } as Console },
      ),
    /YOUTUBE_API_KEY required/,
  );

  assert.ok(updates.some((update) => update.status === 'failed' && update.errorMessage));
});
