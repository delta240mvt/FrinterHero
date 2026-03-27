import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBcLpResponse } from './bc-parse';

test('parseBcLpResponse extracts html, audience pain keywords, and feature map', () => {
  const response = [
    '```json',
    JSON.stringify({
      headline: 'Focus longer',
      sectionWeaknesses: { hero: null },
      nicheKeywords: ['focus', 'deep work'],
      founderVision: 'Help people protect energy.',
    }),
    '```',
    '```html',
    '<section class="hero"></section>',
    '```',
    `AUDIENCE_PAIN_KEYWORDS:${JSON.stringify(["why can't i focus", 'brain fog after lunch'])}`,
    'FEATURE_MAP:[{"featureName":"Sprint","whatItDoes":"times work","userBenefit":"keeps momentum"}]',
  ].join('\n');

  const parsed = parseBcLpResponse(response, 'fallback', true);
  assert.equal(parsed.lpTemplateHtml, '<section class="hero"></section>');
  assert.deepEqual(parsed.audiencePainKeywords, ['why can\'t i focus', 'brain fog after lunch']);
  assert.equal(parsed.featureMap.length, 1);
  assert.equal(parsed.founderVision, 'Help people protect energy.');
});
