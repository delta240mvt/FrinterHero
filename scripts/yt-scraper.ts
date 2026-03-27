import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { ytScrapeRuns } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { runYoutubeScraperJob } from '../src/lib/jobs/youtube';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const options = {
  scrapeTargetIds: process.env.SCRAPE_TARGET_IDS || '',
  scrapeRunId: parseInt(process.env.SCRAPE_RUN_ID || '0', 10),
  siteId: parseInt(process.env.SITE_ID || '0', 10) || null,
  maxComments: parseInt(process.env.YT_MAX_COMMENTS_PER_TARGET || '300', 10),
  chunkSize: parseInt(process.env.YT_CHUNK_SIZE || '20', 10),
  model: process.env.YT_ANALYSIS_MODEL || 'anthropic/claude-sonnet-4-6',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  maxVideosPerChannel: parseInt(process.env.YT_MAX_VIDEOS_PER_CHANNEL || '5', 10),
};

runYoutubeScraperJob(options)
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch(async (error: any) => {
    console.error('[FATAL]', error.message);
    if (options.scrapeRunId) {
      try {
        await db
          .update(ytScrapeRuns)
          .set({
            status: 'failed',
            errorMessage: String(error.message),
            finishedAt: new Date(),
          })
          .where(eq(ytScrapeRuns.id, options.scrapeRunId));
      } catch {
        // Preserve best-effort failure reporting.
      }
    }
    process.exit(1);
  });
