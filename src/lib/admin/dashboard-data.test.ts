import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadAdminDashboardData } from './dashboard-data.ts';

describe('loadAdminDashboardData', () => {
  it('keeps article data when a secondary stats endpoint fails', async () => {
    const paths: string[] = [];
    const fetchJson = async (path: string) => {
      paths.push(path);
      if (path.startsWith('/api/articles?page=2')) {
        return { results: [{ id: 7, title: 'Draft A', status: 'draft' }] };
      }
      if (path === '/api/articles?limit=1&status=draft') return { total: 3 };
      if (path === '/api/articles?limit=1&status=published') return { total: 8 };
      if (path === '/api/articles?limit=1&status=archived') return { total: 1 };
      if (path === '/api/articles?limit=1') return { total: 12 };
      if (path === '/api/content-gaps?limit=1&status=new') return { pagination: { total: 4 } };
      if (path === '/api/content-gaps?limit=1&status=in_progress') return { pagination: { total: 2 } };
      if (path === '/api/content-gaps?limit=1&has_proposal=true') return { pagination: { total: 5 } };
      if (path === '/api/knowledge-base?limit=1') return { pagination: { total: 9 } };
      if (path === '/api/admin/geo/runs?limit=8') throw new Error('500');
      if (path === '/api/reddit/gaps?limit=1&status=pending') return { pagination: { total: 6 } };
      throw new Error(`Unexpected path: ${path}`);
    };

    const data = await loadAdminDashboardData({
      fetchJson,
      page: 2,
      limit: 25,
      search: '',
      statusFilter: '',
    });

    assert.deepEqual(data.allArticles, [{ id: 7, title: 'Draft A', status: 'draft' }]);
    assert.deepEqual(data.stats, { draft: 3, published: 8, archived: 1 });
    assert.equal(data.total, 12);
    assert.deepEqual(data.gapStats, { new: 4, in_progress: 2, proposals: 5 });
    assert.equal(data.kbTotal, 9);
    assert.deepEqual(data.recentRuns, []);
    assert.equal(data.redditPending, 6);
    assert.equal(paths.length, 11);
  });
});
