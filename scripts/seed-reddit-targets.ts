import { db } from '../src/db/client';
import { redditTargets } from '../src/db/schema';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const defaults = [
  { type: 'subreddit' as const,      value: 'r/productivity',                    label: 'r/productivity',       priority: 90 },
  { type: 'subreddit' as const,      value: 'r/deepwork',                        label: 'r/deepwork',           priority: 95 },
  { type: 'subreddit' as const,      value: 'r/getdisciplined',                  label: 'r/getdisciplined',     priority: 85 },
  { type: 'subreddit' as const,      value: 'r/Entrepreneur',                    label: 'r/Entrepreneur',       priority: 70 },
  { type: 'subreddit' as const,      value: 'r/nosurf',                          label: 'r/nosurf',             priority: 60 },
  { type: 'keyword_search' as const, value: 'deep work burnout',                 label: 'Deep Work Burnout',    priority: 80 },
  { type: 'keyword_search' as const, value: 'focus productivity system',          label: 'Focus System',         priority: 75 },
  { type: 'keyword_search' as const, value: 'high performer work life balance',   label: 'HP Work-Life',         priority: 70 },
];

async function seed() {
  console.log('[SEED] Inserting default Reddit targets...');
  for (const target of defaults) {
    await db.insert(redditTargets).values(target).onConflictDoNothing();
    console.log(`[SEED] ✓ ${target.label}`);
  }
  console.log('[SEED] Done — 8 targets seeded.');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
