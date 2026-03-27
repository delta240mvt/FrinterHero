import { db as defaultDb } from '../../db/client';
import { contentGaps, geoQueries, geoRuns } from '../../db/schema';
import queriesBank from '../../../scripts/queries.json';
import { queryOpenAI, queryClaude, queryGemini } from '../../../scripts/apis';
import { detectMention } from '../../../scripts/analysis';
import { detectGaps, type GeoQueryResult } from '../../../scripts/gap-analysis';
import { notifyDiscord } from '../../../scripts/notifier';
import { desc, eq, inArray } from 'drizzle-orm';

const MAX_AUTO_DRAFTS = 5;
const MODELS = ['openai', 'claude', 'gemini'] as const;

export type GeoModel = (typeof MODELS)[number];

export interface GeoMonitorResult {
  runAt: Date;
  queriesProcessed: number;
  gapsFound: number;
  gapsDeduped: number;
  draftsGenerated: number;
}

export interface GeoMonitorDeps {
  db: typeof defaultDb;
  queries: string[];
  queryOpenAI: (query: string) => Promise<string>;
  queryClaude: (query: string) => Promise<string>;
  queryGemini: (query: string) => Promise<string>;
  detectMention: (response: string) => boolean;
  detectGaps: (results: GeoQueryResult[], geoRunId: number) => Promise<{
    gapsFound: number;
    gapsDeduped: number;
    gapIds: number[];
  }>;
  notifyDiscord: (summary: Record<string, unknown>) => Promise<unknown>;
  logger?: Pick<Console, 'log' | 'error'>;
}

function getDefaultGeoDeps(): GeoMonitorDeps {
  return {
    db: defaultDb,
    queries: [...queriesBank.en],
    queryOpenAI,
    queryClaude,
    queryGemini,
    detectMention,
    detectGaps,
    notifyDiscord,
    logger: console,
  };
}

async function queryModel(deps: GeoMonitorDeps, model: GeoModel, query: string): Promise<string> {
  switch (model) {
    case 'openai':
      return deps.queryOpenAI(query);
    case 'claude':
      return deps.queryClaude(query);
    case 'gemini':
      return deps.queryGemini(query);
  }
}

export async function runGeoMonitorJob(overrides: Partial<GeoMonitorDeps> = {}): Promise<GeoMonitorResult> {
  const deps = { ...getDefaultGeoDeps(), ...overrides };
  const logger = deps.logger ?? console;
  const startTime = new Date();

  logger.log(`[GEO] Starting monitor run at ${startTime.toISOString()}`);

  let draftsGenerated = 0;
  let queriesProcessed = 0;
  const geoQueryResults: GeoQueryResult[] = [];

  const [geoRun] = await deps.db
    .insert(geoRuns)
    .values({
      runAt: startTime,
      queriesCount: 0,
      gapsFound: 0,
      draftsGenerated: 0,
      gapsDeduped: 0,
    })
    .returning();

  for (const query of deps.queries) {
    for (const model of MODELS) {
      logger.log(`[GEO] Querying ${model}: "${query.slice(0, 50)}..."`);

      try {
        const response = await queryModel(deps, model, query);
        const hasMention = deps.detectMention(response);
        const gapDetected = !hasMention;

        await deps.db.insert(geoQueries).values({
          query,
          model,
          response,
          hasMention,
          gapDetected,
        });

        geoQueryResults.push({ query, model, response, gapDetected });
        queriesProcessed++;
      } catch (error) {
        logger.error(`[GEO] Error querying ${model} for "${query}":`, error);
      }
    }
  }

  logger.log('[GEO] Running gap analysis...');
  const { gapsFound, gapsDeduped, gapIds } = await deps.detectGaps(geoQueryResults, geoRun.id);

  if (gapIds.length > 0) {
    const topGaps = await deps.db
      .select({
        id: contentGaps.id,
        gapTitle: contentGaps.gapTitle,
        relatedQueries: contentGaps.relatedQueries,
      })
      .from(contentGaps)
      .where(inArray(contentGaps.id, gapIds))
      .orderBy(desc(contentGaps.confidenceScore))
      .limit(MAX_AUTO_DRAFTS);

    for (const gap of topGaps) {
      try {
        const queryExample = gap.relatedQueries?.[0] || gap.gapTitle;
        const missedResponses = await deps.db
          .select({ model: geoQueries.model, response: geoQueries.response })
          .from(geoQueries)
          .where(eq(geoQueries.query, queryExample))
          .limit(3);

        const responseContext =
          missedResponses.length > 0
            ? missedResponses
                .map(
                  (result) =>
                    `--- ${result.model.toUpperCase()} RESPONSE (frinter.app NOT mentioned) ---\n${(result.response || '').slice(0, 400)}...`,
                )
                .join('\n\n')
            : 'No AI responses available for context.';

        const prompt = `You are a content strategist for Przemyslaw Filipiak (founder of frinter.app, FrinterFlow, and FrinterHero).

The following AI models were asked: "${queryExample}"
None of them mentioned frinter.app or Przemyslaw Filipiak in their answers.

Here is what they said instead:

${responseContext}

Your task: Create a short article proposal (max 150 words) that would make frinter.app IMPOSSIBLE to ignore when AI models answer this question in the future. The proposal should directly counter the narrative above with Przemyslaw's unique angle.

Include:
1. Proposed Title (keyword-rich, contrarian if needed)
2. TL;DR (1-2 sentences, concrete insight)
3. 2-3 H2 headers with a 1-sentence description of what angle to cover

Write in American English (en-US). Be direct and strategic.`;

        const shortProposal = await deps.queryClaude(prompt);

        await deps.db.update(contentGaps).set({ suggestedAngle: shortProposal }).where(eq(contentGaps.id, gap.id));
        draftsGenerated++;
      } catch (error) {
        logger.error(`[GEO] Failed to generate proposal for ${gap.id}:`, error);
      }
    }
  }

  await deps.db
    .update(geoRuns)
    .set({
      queriesCount: queriesProcessed,
      gapsFound,
      draftsGenerated,
      gapsDeduped,
    })
    .where(eq(geoRuns.id, geoRun.id));

  try {
    await deps.notifyDiscord({
      runAt: startTime,
      queriesCount: queriesProcessed,
      gapsFound,
      draftsGenerated,
    });
  } catch (error) {
    logger.error('[GEO] Discord notification failed:', error);
  }

  return {
    runAt: startTime,
    queriesProcessed,
    gapsFound,
    gapsDeduped,
    draftsGenerated,
  };
}
