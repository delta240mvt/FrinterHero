import assert from 'node:assert/strict';
import test from 'node:test';

import { appJobs, redditScrapeRuns } from '../../../../../src/db/schema.ts';
import { executeRedditRunWorkflow } from './reddit-run.ts';

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
  readonly redditRuns: Array<Record<string, unknown>> = [];
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
          if (table !== redditScrapeRuns) {
            return [];
          }

          const row = {
            id: this.nextRunId++,
            ...value,
          };
          this.redditRuns.push(row);
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

test('executeRedditRunWorkflow reserves, executes, and finalizes the job', async () => {
  const db = new FakeCloudflareDb([
    {
      id: 9,
      payload: { scrapeTargets: 'r/productivity', maxItems: 4 },
      progress: {},
      result: null,
      siteId: 7,
      status: 'pending',
      topic: 'reddit',
      type: 'reddit',
    },
  ]);
  const step = new FakeWorkflowStep();
  let receivedRunId = 0;

  const result = await executeRedditRunWorkflow(
    {
      jobId: '9',
      payload: { scrapeTargets: 'r/productivity', maxItems: 4 },
      siteId: 7,
      siteSlug: 'frinter',
      topic: 'reddit',
    },
    {
      db: db as any,
      runRedditJob: async (options) => {
        receivedRunId = options.scrapeRunId;
        return {
          painPointsExtracted: 2,
          postsCollected: 6,
          protocolLines: ['painPointsExtracted:2'],
        };
      },
      step,
    },
  );

  assert.deepEqual(step.calls, ['reserve', 'execute', 'finalize']);
  assert.equal(receivedRunId, 1);
  assert.equal(db.redditRuns.length, 1);
  assert.equal(result.result.scrapeRunId, 1);
  assert.equal((db.jobs[0].status as string), 'completed');
});
