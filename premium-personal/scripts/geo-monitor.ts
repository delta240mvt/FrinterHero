import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/client';
import { articles, geoQueries, geoRuns } from '../src/db/schema';
import queriesBank from './queries.json';
import { queryOpenAI, queryClaude, queryPerplexity } from './apis';
import { detectMention, generateDraft, generateSlugFromQuery } from './analysis';
import { notifyDiscord } from './notifier';
import { parseMarkdown, calculateReadingTime } from '../src/utils/markdown';

const MODELS = ['openai', 'claude', 'perplexity'] as const;
type Model = typeof MODELS[number];

async function queryModel(model: Model, query: string): Promise<string> {
  switch (model) {
    case 'openai': return queryOpenAI(query);
    case 'claude': return queryClaude(query);
    case 'perplexity': return queryPerplexity(query);
  }
}

async function runGeoMonitor(): Promise<void> {
  const startTime = new Date();
  console.log(`[GEO] Starting monitor run at ${startTime.toISOString()}`);

  const allQueries = [...queriesBank.en, ...queriesBank.pl];
  let totalGaps = 0;
  let draftsGenerated = 0;
  let queriesProcessed = 0;

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

        queriesProcessed++;

        if (gapDetected) {
          totalGaps++;
          console.log(`[GEO] Gap detected for "${query.slice(0, 40)}..." on ${model}`);

          try {
            const draft = await generateDraft(query, response, model);
            const slug = generateSlugFromQuery(query);
            const htmlContent = parseMarkdown(draft.content);
            const readingTime = calculateReadingTime(htmlContent);

            // Check for duplicate slug
            const uniqueSlug = `${slug}-${Date.now()}`;

            await db.insert(articles).values({
              slug: uniqueSlug,
              title: draft.title,
              description: draft.description,
              content: htmlContent,
              tags: draft.tags,
              status: 'draft',
              readingTime,
              author: 'Przemysław Filipiak',
            });

            draftsGenerated++;
            console.log(`[GEO] Draft created: "${draft.title.slice(0, 50)}..."`);
          } catch (draftErr) {
            console.error(`[GEO] Failed to generate draft for "${query}":`, draftErr);
          }
        } else {
          console.log(`[GEO] ✓ Mention found in ${model} response`);
        }
      } catch (apiErr) {
        console.error(`[GEO] Error querying ${model} for "${query}":`, apiErr);
      }
    }
  }

  const runSummary = {
    runAt: startTime,
    queriesCount: queriesProcessed,
    gapsFound: totalGaps,
    draftsGenerated,
  };

  await db.insert(geoRuns).values(runSummary);

  try {
    await notifyDiscord(runSummary);
  } catch (notifyErr) {
    console.error('[GEO] Discord notification failed:', notifyErr);
  }

  console.log(`[GEO] Run complete at ${new Date().toISOString()}`);
  console.log(`[GEO] Queries processed: ${queriesProcessed}`);
  console.log(`[GEO] Gaps found: ${totalGaps}`);
  console.log(`[GEO] Drafts generated: ${draftsGenerated}`);
}

// Run if called directly
runGeoMonitor().catch(err => {
  console.error('[GEO] Fatal error:', err);
  process.exit(1);
});

export { runGeoMonitor };
