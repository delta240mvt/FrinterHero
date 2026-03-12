/**
 * Seed script: inserts 5 default YouTube video targets for Stage 0 scraping.
 * Run with: npx tsx scripts/seed-yt-targets.ts
 */
import { db } from '../src/db/client';
import { ytTargets } from '../src/db/schema';

const SEED_TARGETS = [
  {
    type: 'video' as const,
    url: 'https://www.youtube.com/watch?v=JDqMpJi4LNA',
    videoId: 'JDqMpJi4LNA',
    label: 'Ali Abdaal: Time Management',
    isActive: true,
    priority: 80,
    maxComments: 300,
  },
  {
    type: 'video' as const,
    url: 'https://www.youtube.com/watch?v=KSHU_7MIc1M',
    videoId: 'KSHU_7MIc1M',
    label: 'Huberman Lab: Focus',
    isActive: true,
    priority: 80,
    maxComments: 300,
  },
  {
    type: 'video' as const,
    url: 'https://www.youtube.com/watch?v=wfKv4qPBqZc',
    videoId: 'wfKv4qPBqZc',
    label: 'Andrew Huberman: Morning Routine',
    isActive: true,
    priority: 75,
    maxComments: 300,
  },
  {
    type: 'video' as const,
    url: 'https://www.youtube.com/watch?v=J5vlPPpVIJU',
    videoId: 'J5vlPPpVIJU',
    label: 'Cal Newport: Deep Work',
    isActive: true,
    priority: 75,
    maxComments: 300,
  },
  {
    type: 'video' as const,
    url: 'https://www.youtube.com/watch?v=dABmkdRvN-A',
    videoId: 'dABmkdRvN-A',
    label: 'Thomas Frank: Productivity',
    isActive: true,
    priority: 70,
    maxComments: 300,
  },
];

async function seed() {
  console.log('[seed-yt] Inserting YouTube targets...');
  for (const target of SEED_TARGETS) {
    try {
      await db.insert(ytTargets).values(target).onConflictDoNothing();
      console.log(`[seed-yt] ✓ ${target.label}`);
    } catch (e: any) {
      console.error(`[seed-yt] ✗ ${target.label}:`, e.message);
    }
  }
  console.log('[seed-yt] Done.');
  process.exit(0);
}

seed();
