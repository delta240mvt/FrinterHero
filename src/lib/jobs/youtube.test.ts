import test from 'node:test';
import assert from 'node:assert/strict';
import { extractYoutubeChannelIdentifier } from './youtube';

test('extractYoutubeChannelIdentifier supports handles, channel urls, and invalid values', () => {
  assert.equal(extractYoutubeChannelIdentifier('@frinterhero'), 'frinterhero');
  assert.equal(
    extractYoutubeChannelIdentifier('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'),
    'UCabcdefghijklmnopqrstuv',
  );
  assert.equal(extractYoutubeChannelIdentifier('not a url'), null);
});
