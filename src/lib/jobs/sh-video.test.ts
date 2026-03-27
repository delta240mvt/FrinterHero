import test from 'node:test';
import assert from 'node:assert/strict';
import { describeShVideoFormat } from './sh-video';

test('describeShVideoFormat returns stable labels for known and unknown slugs', () => {
  assert.deepEqual(describeShVideoFormat('talking_head_authority'), {
    slug: 'talking_head_authority',
    label: 'Talking Head Authority',
    description: 'Ekspercki monolog z wysoka klarownoscia i jedna mocna teza.',
  });
  assert.equal(describeShVideoFormat(null), null);
  assert.equal(describeShVideoFormat('custom_slug')?.label, 'custom slug');
});
