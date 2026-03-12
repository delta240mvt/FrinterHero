/**
 * Seed script: inserts YouTube channel targets for Stage 0 scraping.
 * System auto-discovers top N videos per channel via YouTube Data API v3.
 * Run with: npx tsx scripts/seed-yt-targets.ts
 */
import { db } from '../src/db/client';
import { ytTargets } from '../src/db/schema';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SEED_TARGETS = [
  // ── Productivity / Deep Work ──
  { label: 'Ali Abdaal',       url: 'https://www.youtube.com/@aliabdaal',       channelHandle: 'aliabdaal',       priority: 90, maxVideosPerChannel: 5 },
  { label: 'Cal Newport',      url: 'https://www.youtube.com/@CalNewportMedia', channelHandle: 'CalNewportMedia', priority: 90, maxVideosPerChannel: 5 },
  { label: 'Thomas Frank',     url: 'https://www.youtube.com/@Thomasfrank',     channelHandle: 'Thomasfrank',     priority: 85, maxVideosPerChannel: 5 },
  { label: 'Andrew Kirby',     url: 'https://www.youtube.com/@AndrewKirby',     channelHandle: 'AndrewKirby',     priority: 80, maxVideosPerChannel: 5 },
  // ── Health / Performance ──
  { label: 'Huberman Lab',     url: 'https://www.youtube.com/@hubermanlab',     channelHandle: 'hubermanlab',     priority: 90, maxVideosPerChannel: 5 },
  { label: 'Rian Doris',       url: 'https://www.youtube.com/@RianDoris',       channelHandle: 'RianDoris',       priority: 75, maxVideosPerChannel: 5 },
  // ── Minimalism / Lifestyle ──
  { label: 'Matt D\'Avella',   url: 'https://www.youtube.com/@mattdavella',     channelHandle: 'mattdavella',     priority: 80, maxVideosPerChannel: 5 },
  { label: 'Better Ideas',     url: 'https://www.youtube.com/@betterideas',     channelHandle: 'betterideas',     priority: 75, maxVideosPerChannel: 5 },
  { label: 'Improvement Pill', url: 'https://www.youtube.com/@ImprovementPill', channelHandle: 'ImprovementPill', priority: 70, maxVideosPerChannel: 5 },
];

async function seed() {
  console.log(`[seed-yt] Inserting ${SEED_TARGETS.length} YouTube channel targets...`);

  // Clear old video-type seeds (from previous version) if any
  for (const target of SEED_TARGETS) {
    try {
      await db.insert(ytTargets).values({
        type: 'channel',
        url: target.url,
        label: target.label,
        channelHandle: target.channelHandle,
        videoId: null,
        isActive: true,
        priority: target.priority,
        maxComments: 300,
        maxVideosPerChannel: target.maxVideosPerChannel,
      }).onConflictDoNothing();
      console.log(`[seed-yt] ✓ ${target.label} (@${target.channelHandle})`);
    } catch (e: any) {
      console.error(`[seed-yt] ✗ ${target.label}:`, e.message);
    }
  }

  console.log('[seed-yt] Done.');
  process.exit(0);
}

seed();
