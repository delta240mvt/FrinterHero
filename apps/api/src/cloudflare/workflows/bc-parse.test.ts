import assert from 'node:assert/strict';
import test from 'node:test';

import { appJobs } from '../../../../../src/db/schema.ts';
import { executeBcParseWorkflow } from './bc-parse.ts';

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

test('executeBcParseWorkflow reserves, executes, and finalizes the job', async () => {
  const db = new FakeCloudflareDb([
    {
      attemptCount: 0,
      createdAt: new Date('2026-03-27T10:00:00.000Z'),
      id: 43,
      payload: { projectId: 1 },
      progress: {},
      result: null,
      siteId: 7,
      status: 'pending',
      topic: 'bc-parse',
      type: 'bc-parse',
      updatedAt: new Date('2026-03-27T10:00:00.000Z'),
    },
  ]);
  const step = new FakeWorkflowStep();

  const result = await executeBcParseWorkflow(
    {
      jobId: '43',
      payload: { projectId: 1 },
      siteId: 7,
      siteSlug: 'frinter',
      topic: 'bc-parse',
    },
    {
      db: db as any,
      runBcParseJob: async () => ({
        nicheKeywordsFound: 10,
        audiencePainKeywordsFound: 5,
        featureMapItems: 3,
        protocolLines: ['nicheKeywordsFound:10'],
      }),
      step,
    },
  );

  assert.deepEqual(step.calls, ['reserve', 'execute', 'finalize']);
  assert.equal(result.status, 'completed');
  assert.equal((result.result as Record<string, unknown>).nicheKeywordsFound, 10);
  assert.equal((db.jobs[0].status as string), 'completed');
  assert.deepEqual(db.jobs[0].progress, { stage: 'finalized' });
  assert.equal((db.jobs[0].result as Record<string, unknown>).status, 'completed');
});

test('executeBcParseWorkflow handles execution failure', async () => {
  const db = new FakeCloudflareDb([
    {
      attemptCount: 0,
      createdAt: new Date('2026-03-27T10:00:00.000Z'),
      id: 43,
      payload: { projectId: 1 },
      progress: {},
      result: null,
      siteId: 7,
      status: 'pending',
      topic: 'bc-parse',
      type: 'bc-parse',
      updatedAt: new Date('2026-03-27T10:00:00.000Z'),
    },
  ]);
  const step = new FakeWorkflowStep();
  const executionError = new Error('LLM call failed');

  await assert.rejects(
    () =>
      executeBcParseWorkflow(
        {
          jobId: '43',
          payload: { projectId: 1 },
          siteId: 7,
          siteSlug: 'frinter',
          topic: 'bc-parse',
        },
        {
          db: db as any,
          runBcParseJob: async () => {
            throw executionError;
          },
          step,
        },
      ),
    executionError,
  );

  assert.ok(step.calls.includes('finalize'));
  assert.equal((db.jobs[0].status as string), 'failed');
});
