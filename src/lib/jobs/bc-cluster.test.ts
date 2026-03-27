import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBcClusters } from './bc-cluster';

test('sanitizeBcClusters accepts json arrays and clamps to three clusters', () => {
  const clusters = sanitizeBcClusters(
    '[{"clusterTheme":"one"},{"clusterTheme":"two"},{"clusterTheme":"three"},{"clusterTheme":"four"}]',
  );
  assert.equal(clusters.length, 3);
  assert.equal(clusters[0].clusterTheme, 'one');
  assert.equal(clusters[2].clusterTheme, 'three');
});
