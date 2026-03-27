import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGeoMention, runGeoMonitorJob } from './geo';

test('detectGeoMention matches Frinter-related keywords case-insensitively', () => {
  assert.equal(detectGeoMention('Built by PRZEMYSLAW Filipiak.'), true);
  assert.equal(detectGeoMention('No brand mention here.'), false);
});

test('runGeoMonitorJob returns structured counts from typed dependencies', async () => {
  const insertedQueries: Array<{ query: string; model: string }> = [];
  const updates: Array<Record<string, unknown>> = [];
  let insertCount = 0;
  const db = {
    insert() {
      insertCount += 1;
      if (insertCount === 1) {
        return {
          values() {
            return {
              returning: async () => [{ id: 17 }],
            };
          },
        };
      }

      return {
        values(value: { query: string; model: string }) {
          insertedQueries.push(value);
          return Promise.resolve();
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit: async () => [],
                  };
                },
                limit: async () => [],
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Record<string, unknown>) {
          updates.push(value);
          return {
            where: async () => undefined,
          };
        },
      };
    },
  } as any;

  const result = await runGeoMonitorJob({
    db,
    queries: ['focus query'],
    queryOpenAI: async () => 'no mention',
    queryClaude: async () => 'has frinter',
    queryGemini: async () => 'no mention',
    detectMention: (response) => response.includes('frinter'),
    detectGaps: async (results) => ({
      gapsFound: results.filter((item) => item.gapDetected).length,
      gapsDeduped: 1,
      gapIds: [],
    }),
    notifyDiscord: async () => undefined,
    logger: { log() {}, error() {} },
  });

  assert.equal(insertedQueries.length, 3);
  assert.equal(result.queriesProcessed, 3);
  assert.equal(result.gapsFound, 2);
  assert.equal(result.gapsDeduped, 1);
  assert.equal(result.draftsGenerated, 0);
  assert.ok(updates.some((update) => update.queriesCount === 3));
});
