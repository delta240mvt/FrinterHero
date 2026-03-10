import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/client';
import { articles, geoQueries, geoRuns, contentGaps } from '../src/db/schema';
import queriesBank from './queries.json';
import { queryOpenAI, queryClaude, queryGemini } from './apis';
import { detectMention } from './analysis';
import { detectGaps, type GeoQueryResult } from './gap-analysis';
import { generateDraft } from './draft-generator';
import { notifyDiscord } from './notifier';
import { parseMarkdown, calculateReadingTime } from '../src/utils/markdown';
import { eq, desc, inArray } from 'drizzle-orm';

const MAX_AUTO_DRAFTS = 5;

const MODELS = ['openai', 'claude', 'gemini'] as const;
type Model = typeof MODELS[number];

async function queryModel(model: Model, query: string): Promise<string> {
  switch (model) {
    case 'openai': return queryOpenAI(query);
    case 'claude': return queryClaude(query);
    case 'gemini': return queryGemini(query);
  }
}

async function runGeoMonitor(): Promise<void> {
  const startTime = new Date();
  console.log(`[GEO] Starting monitor run at ${startTime.toISOString()}`);

  const allQueries = [...queriesBank.en, ...queriesBank.pl];
  let draftsGenerated = 0;
  let queriesProcessed = 0;
  const geoQueryResults: GeoQueryResult[] = [];

  // Insert geoRun record first so we have an ID for FK references in gaps
  const [geoRun] = await db.insert(geoRuns).values({
    runAt: startTime,
    queriesCount: 0,
    gapsFound: 0,
    draftsGenerated: 0,
    gapsDeduped: 0,
  }).returning();

  for (const query of allQueries) {
    for (const model of MODELS) {
      console.log(`[GEO] Querying ${model}: "${query.slice(0, 50)}..."`);

      try {
        const response = await queryModel(model, query);

        const hasMention = detectMention(response);
        const gapDetected = !hasMention;

        await db.insert(geoQueries).values({
          query,
          model,
          response,
          hasMention,
          gapDetected,
        });

        geoQueryResults.push({ query, model, response, gapDetected });
        queriesProcessed++;

        if (!gapDetected) {
          console.log(`[GEO] ✓ Mention found in ${model} response`);
        } else {
          console.log(`[GEO] Gap detected for "${query.slice(0, 40)}..." on ${model}`);
        }
      } catch (apiErr) {
        console.error(`[GEO] Error querying ${model} for "${query}":`, apiErr);
      }
    }
  }

  // Stage 2: Run gap analysis on collected results
  console.log('[GEO] Running gap analysis...');
  const { gapsFound, gapsDeduped, gapIds } = await detectGaps(geoQueryResults, geoRun.id);
  console.log(`[GEO] Gaps persisted: ${gapsFound}, deduped: ${gapsDeduped}`);

  // Stage 3: Generate Proposals (Short suggestions, NO full drafts to save tokens)
  if (gapIds.length > 0) {
    const topCount = Math.min(MAX_AUTO_DRAFTS, gapIds.length);
    console.log(`[GEO] Generating proposals (mini-drafts) for top ${topCount} gaps...`);
    const topGaps = await db
      .select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle, relatedQueries: contentGaps.relatedQueries })
      .from(contentGaps)
      .where(inArray(contentGaps.id, gapIds))
      .orderBy(desc(contentGaps.confidenceScore))
      .limit(MAX_AUTO_DRAFTS);

    for (const gap of topGaps) {
      try {
        const queryExample = gap.relatedQueries?.[0] || gap.gapTitle;
        const prompt = `You are a focus/productivity expert. Create a very short, concrete article proposal/mini-draft (max 150 words) answering the query: "${queryExample}".
It should resemble the final article but highly condensed. Include:
1. Proposed Title
2. Short TL;DR
3. 2-3 H2 headers with a 1-sentence description of what will be written there.
Do NOT write the whole article. Be concise. Write in the primary language of the query.`;

        const shortProposal = await queryOpenAI(prompt);

        await db.update(contentGaps)
          .set({ suggestedAngle: shortProposal })
          .where(eq(contentGaps.id, gap.id));

        console.log(`[GEO] Proposal created: "${gap.gapTitle.slice(0, 50)}..." waiting for author input.`);
        draftsGenerated++; // Repurposing field conceptually: number of proposals prepared
      } catch (err) {
        console.error(`[GEO] Failed to generate proposal for ${gap.id}:`, err);
      }
    }
  }

  // Update geoRun with final counts
  await db.update(geoRuns)
    .set({
      queriesCount: queriesProcessed,
      gapsFound,
      draftsGenerated,
      gapsDeduped,
    })
    .where(eq(geoRuns.id, geoRun.id));

  const runSummary = {
    runAt: startTime,
    queriesCount: queriesProcessed,
    gapsFound,
    draftsGenerated,
  };

  try {
    await notifyDiscord(runSummary);
  } catch (notifyErr) {
    console.error('[GEO] Discord notification failed:', notifyErr);
  }

  console.log(`[GEO] Run complete at ${new Date().toISOString()}`);
  console.log(`[GEO] Queries processed: ${queriesProcessed}`);
  console.log(`[GEO] Gaps found: ${gapsFound} (${gapsDeduped} deduped)`);
  console.log(`[GEO] Proposals generated: ${draftsGenerated}`);
}

// Run if called directly
runGeoMonitor().catch(err => {
  console.error('[GEO] Fatal error:', err);
  process.exit(1);
});

export { runGeoMonitor };
