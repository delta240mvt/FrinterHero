import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBcSelections } from './bc-selector';

test('sanitizeBcSelections keeps only pain point ids that belong to the project', () => {
  const selections = sanitizeBcSelections(
    '{"selected":[{"painPointId":3,"rank":1,"selectionReason":"best"},{"painPointId":99,"rank":2,"selectionReason":"bad"}]}',
    new Set([3, 7]),
  );

  assert.deepEqual(selections, [{ painPointId: 3, rank: 1, selectionReason: 'best' }]);
});
