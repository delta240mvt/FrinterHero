import assert from 'node:assert/strict';
import test from 'node:test';

import { appJobs, ytScrapeRuns } from '../../../../../src/db/schema.ts';
import { executeYoutubeRunWorkflow } from './youtube-run.ts';

function extractComparisons(condition: any, pairs: Array<{ column: string; value: unknown }> = []) {
  if (!condition?.queryChunks) {
    return pairs;
  }

  let pendingColumn: string | null = null;
  for (const chunk of condition.queryChunks) {
    if (chunk?.queryChunks) {
      extractComparisons(chunk, pairs);
      continue;
    }

    if (chunk?.name && chunk?.table) {
      pendingColumn = chunk.name;
      continue;
    }

    if (pendingColumn && chunk?.constructor?.name === 'Param') {
      pairs.push({ column: pendingColumn, value: chunk.value });
      pendingColumn = null;
    }
  }

  return pairs;
}

function matchesRow(row: Record<string, unknown>, comparisons: Array<{ column: string; value: unknown }>) {
  return comparisons.every(({ column, value }) => {
    const camelColumn = column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return row[column] === value || row[camelColumn] === value;
  });
}

class FakeWorkflowStep {
  readonly calls: string[] = [];

  async do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  async do<T>(name: string, _options: unknown, callback: () => Promise<T>): Promise<T>;
  async do<T>(name: string, callbackOrOptions: unknown, maybeCallback?: () => Promise<T>): Promise<T> {
    this.calls.push(name);
    const callback = typeof callbackOrOptions === 'function' ? callbackOrOptions : maybeCallback;

    if (!callback) {
      throw new Error(`No callback provided for step: ${name}`);
    }

    return callback();
  }
}

class FakeCloudflareDb {
  readonly youtubeRuns: Array<Record<string, unknown>> = [];
  nextRunId = 1;

  constructor(readonly jobs: Array<Record<string, unknown>>) {}

  select() {
    return {
      from: (table: unknown) => {
        const rows = table === appJobs ? this.jobs : [];

        return {
          where: (condition: unknown) => {
            const comparisons = extractComparisons(condition);
            const filtered = rows.filter((row) => matchesRow(row, comparisons));

            return {
              limit: async (count: number) => filtered.slice(0, count),
            };
          },
        };
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (table !== ytScrapeRuns) {
            return [];
          }

          const row = {
            id: this.nextRunId++,
            ...value,
          };
          this.youtubeRuns.push(row);
          return [row];
        },
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          if (table !== appJobs) {
            return { rowCount: 0 };
          }

          const comparisons = extractComparisons(condition);
          let rowCount = 0;
          for (const row of this.jobs) {
            if (matchesRow(row, comparisons)) {
              Object.assign(row, values);
              rowCount++;
            }
          }

          return { rowCount };
        },
      }),
    };
  }
}

test('executeYoutubeRunWorkflow reserves, executes, and finalizes the job', async () => {
  const db = new FakeCloudflareDb([
    {
      id: 15,
      payload: { scrapeTargetIds: '3,5', maxComments: 25 },
      progress: {},
      result: null,
      siteId: 8,
      status: 'pending',
      topic: 'youtube',
      type: 'youtube',
    },
  ]);
  const step = new FakeWorkflowStep();
  let receivedRunId = 0;

  const result = await executeYoutubeRunWorkflow(
    {
      jobId: '15',
      payload: { scrapeTargetIds: '3,5', maxComments: 25 },
      siteId: 8,
      siteSlug: 'focusequalsfreedom',
      topic: 'youtube',
    },
    {
      db: db as any,
      env: {
        YOUTUBE_API_KEY: 'workflow-key',
      },
      runYoutubeJob: async (options) => {
        receivedRunId = options.scrapeRunId;
        return {
          commentsCollected: 11,
          painPointsExtracted: 4,
          protocolLines: ['commentsCollected:11'],
        };
      },
      step,
    },
  );

  assert.deepEqual(step.calls, ['reserve', 'execute', 'finalize']);
  assert.equal(receivedRunId, 1);
  assert.equal(db.youtubeRuns.length, 1);
  assert.equal(result.result.scrapeRunId, 1);
  assert.equal((db.jobs[0].status as string), 'completed');
});
