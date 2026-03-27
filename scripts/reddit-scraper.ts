import * as dotenv from 'dotenv';
import * as path from 'path';
import { runRedditScraperJob } from '../src/lib/jobs/reddit';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const options = {
  scrapeTargets: process.env.SCRAPE_TARGETS || '',
  scrapeRunId: parseInt(process.env.SCRAPE_RUN_ID || '0', 10),
  siteId: parseInt(process.env.SITE_ID || '0', 10) || null,
  maxItems: parseInt(process.env.REDDIT_MAX_ITEMS_PER_TARGET || '3', 10),
  chunkSize: parseInt(process.env.REDDIT_CHUNK_SIZE || '10', 10),
  model: process.env.REDDIT_ANALYSIS_MODEL || 'anthropic/claude-sonnet-4-6',
};

runRedditScraperJob(options)
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch(async (error: any) => {
    console.error('[FATAL]', error.message);
    process.exit(1);
  });
