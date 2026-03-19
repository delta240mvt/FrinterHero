import * as dotenv from 'dotenv';
import * as path from 'path';
import { publishBrief } from '../src/lib/sh-distributor';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const briefId = Number.parseInt(process.env.SH_BRIEF_ID ?? '0', 10);
const accountIds = (process.env.SH_ACCOUNT_IDS ?? '')
  .split(',')
  .map((entry) => Number.parseInt(entry.trim(), 10))
  .filter((entry) => Number.isFinite(entry) && entry > 0);
const siteId = Number.parseInt(process.env.SITE_ID ?? '0', 10) || null;
const scheduledForRaw = (process.env.SH_SCHEDULED_FOR ?? '').trim();

function fatal(message: string): never {
  process.stderr.write(`SH_PUBLISH_ERROR:${message}\n`);
  process.exit(1);
}

async function run() {
  if (!briefId) fatal('SH_BRIEF_ID is required');

  const scheduledFor = scheduledForRaw ? new Date(scheduledForRaw) : undefined;
  const publishLogs = await publishBrief(briefId, {
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    scheduledFor: scheduledFor && !Number.isNaN(scheduledFor.getTime()) ? scheduledFor : undefined,
  }, siteId);

  process.stdout.write(`RESULT_JSON:${JSON.stringify({
    briefId,
    publishedCount: publishLogs.length,
    publishLogIds: publishLogs.map((row) => row.id),
  })}\n`);
}

run().catch((error) => {
  fatal(error instanceof Error ? error.message : String(error));
});
