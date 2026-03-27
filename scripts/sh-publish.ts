import * as dotenv from 'dotenv';
import * as path from 'path';
import { runShPublishJob } from '../src/lib/jobs/sh-publish';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

runShPublishJob({
  briefId: Number.parseInt(process.env.SH_BRIEF_ID ?? '0', 10),
  accountIds: (process.env.SH_ACCOUNT_IDS ?? '')
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0),
  siteId: Number.parseInt(process.env.SITE_ID ?? '0', 10) || null,
  scheduledForRaw: (process.env.SH_SCHEDULED_FOR ?? '').trim(),
})
  .then((result) => {
    for (const line of result.protocolLines) {
      process.stdout.write(`${line}\n`);
    }
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SH_PUBLISH_ERROR:${message}\n`);
    process.exit(1);
  });
