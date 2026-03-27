import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBcScrapePainPoints } from './bc-scrape';

test('normalizeBcScrapePainPoints normalizes typed output from LLM json', () => {
  const items = normalizeBcScrapePainPoints(
    '{"painPoints":[{"title":"Overload","description":"Too much","emotionalIntensity":11,"frequency":0,"vocabularyQuotes":["i am overwhelmed"],"category":"systems","sourceCommentIndices":[1],"vocData":{"problemLabel":"too much","dominantEmotion":"overwhelm","failedSolutions":["timers"],"triggerMoment":"monday","successVision":"clarity"}}]}',
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].emotionalIntensity, 10);
  assert.equal(items[0].frequency, 1);
  assert.equal(items[0].category, 'systems');
});
