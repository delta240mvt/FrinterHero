import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRedditApifyInput, parseRedditTargets } from './reddit';

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
