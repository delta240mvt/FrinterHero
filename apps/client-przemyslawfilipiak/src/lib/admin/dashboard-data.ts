type DashboardFetcher = (path: string) => Promise<any>;

type DashboardRequestMap = {
  articleList: any;
  draftCount: any;
  publishedCount: any;
  archivedCount: any;
  totalCount: any;
  gapNew: any;
  gapProg: any;
  gapProps: any;
  kbCount: any;
  runs: any;
  redditPendingData: any;
};

export async function loadAdminDashboardData({
  fetchJson,
  page,
  limit,
  search,
  statusFilter,
}: {
  fetchJson: DashboardFetcher;
  page: number;
  limit: number;
  search: string;
  statusFilter: string;
}) {
  const articleListPath = `/api/articles?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ''}`;
  const requests: Array<[keyof DashboardRequestMap, string]> = [
    ['articleList', articleListPath],
    ['draftCount', '/api/articles?limit=1&status=draft'],
    ['publishedCount', '/api/articles?limit=1&status=published'],
    ['archivedCount', '/api/articles?limit=1&status=archived'],
    ['totalCount', '/api/articles?limit=1'],
    ['gapNew', '/api/content-gaps?limit=1&status=new'],
    ['gapProg', '/api/content-gaps?limit=1&status=in_progress'],
    ['gapProps', '/api/content-gaps?limit=1&has_proposal=true'],
    ['kbCount', '/api/knowledge-base?limit=1'],
    ['runs', '/api/admin/geo/runs?limit=8'],
    ['redditPendingData', '/api/reddit/gaps?limit=1&status=pending'],
  ];

  const settled = await Promise.allSettled(
    requests.map(async ([key, path]) => [key, await fetchJson(path)] as const),
  );

  const data = {} as Partial<DashboardRequestMap>;
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const [key, value] = result.value;
    data[key] = value;
  }

  return {
    allArticles: data.articleList?.results ?? [],
    stats: {
      draft: data.draftCount?.total ?? 0,
      published: data.publishedCount?.total ?? 0,
      archived: data.archivedCount?.total ?? 0,
    },
    total: data.totalCount?.total ?? 0,
    gapStats: {
      new: data.gapNew?.pagination?.total ?? 0,
      in_progress: data.gapProg?.pagination?.total ?? 0,
      proposals: data.gapProps?.pagination?.total ?? 0,
    },
    kbTotal: data.kbCount?.pagination?.total ?? 0,
    recentRuns: data.runs?.runs ?? [],
    redditPending: data.redditPendingData?.pagination?.total ?? data.redditPendingData?.total ?? 0,
  };
}
