import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBcVariantPlan } from './bc-generate';

test('buildBcVariantPlan falls back to approved pain points when no clusters exist', () => {
  const variants = buildBcVariantPlan([], [
    { id: 1, painPointTitle: 'Too scattered', emotionalIntensity: 9, vocabularyQuotes: ['scattered'], desiredOutcome: 'clear day' },
    { id: 2, painPointTitle: 'Brain fog', emotionalIntensity: 8, vocabularyQuotes: ['foggy'], desiredOutcome: 'clean energy' },
  ]);

  assert.equal(variants.length, 3);
  assert.equal(variants[1].cluster?.painPointIds[0], 1);
  assert.equal(variants[2].cluster?.painPointIds[0], 2);
});
