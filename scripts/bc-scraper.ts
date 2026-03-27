import * as dotenv from 'dotenv';
import * as path from 'path';
import { runBcScrapeJob } from '../src/lib/jobs/bc-scrape';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const options = {
  projectId: parseInt(process.env.BC_PROJECT_ID || '0', 10),
  videoId: parseInt(process.env.BC_VIDEO_ID || '0', 10),
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  maxComments: parseInt(process.env.BC_MAX_COMMENTS_PER_VIDEO || '100', 10),
  chunkSize: parseInt(process.env.BC_CHUNK_SIZE || '20', 10),
};

runBcScrapeJob(options)
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch((error: any) => {
    console.error('[FATAL]', error.message);
    process.exit(1);
  });
