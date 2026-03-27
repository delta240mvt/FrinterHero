import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShCopyVariants, normalizeShHashtags } from './sh-copy';

test('normalizeShHashtags keeps only non-empty hashtag strings', () => {
  assert.deepEqual(normalizeShHashtags(['#one', ' ', null], ['#fallback']), ['#one']);
});

test('normalizeShCopyVariants parses the expected structured variants array', () => {
  const variants = normalizeShCopyVariants(
    '[{"variantIndex":0,"hookLine":"Hook","bodyText":"Body","hashtags":["#one"],"cta":"Go","imageLayoutDescription":"Image","videoScript":"Video"}]',
  );
  assert.equal(variants.length, 1);
  assert.equal(variants[0].hookLine, 'Hook');
});
