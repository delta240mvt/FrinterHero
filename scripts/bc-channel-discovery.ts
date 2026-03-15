/**
 * bc-channel-discovery.ts — Discovers YouTube channels relevant to a project's niche.
 *
 * No LLM. Uses YouTube Data API v3 (YOUTUBE_API_KEY — same as yt-scraper.ts).
 * Quota-optimized: max 3 search.list (300 units) + 1 channels.list batch (1 unit).
 *
 * Input env: BC_PROJECT_ID, YOUTUBE_API_KEY
 * Output: inserts bcTargetChannels, stdout CHANNELS_FOUND:N
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcTargetChannels } from '../src/db/schema';
import { eq } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const YT_API_KEY = process.env.YOUTUBE_API_KEY!;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-CHANNELS] ${msg}`);
}

async function ytGet(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  Object.entries({ ...params, key: YT_API_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `YouTube API ${res.status}`;
    if (res.status === 403 && msg.toLowerCase().includes('quota')) {
      log('QUOTA_EXCEEDED — daily YouTube API quota reached');
      process.stdout.write('QUOTA_EXCEEDED\n');
      process.exit(1);
    }
    throw new Error(msg);
  }
  return res.json();
}

async function run() {
  if (!BC_PROJECT_ID) { console.error('[ERROR] BC_PROJECT_ID required'); process.exit(1); }
  if (!YT_API_KEY)    { console.error('[ERROR] YOUTUBE_API_KEY required'); process.exit(1); }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }

  const keywords: string[] = Array.isArray(project.nicheKeywords)
    ? (project.nicheKeywords as string[]).slice(0, 3)
    : [];

  if (!keywords.length) {
    console.error('[ERROR] No nicheKeywords — run LP parser first');
    process.exit(1);
  }

  log(`Discovering channels for: ${keywords.join(', ')}`);

  // Step 1: search.list per keyword (max 3 calls = 300 units)
  const allChannelIds: string[] = [];
  for (const keyword of keywords) {
    try {
      log(`Searching channels for keyword: "${keyword}"`);
      const data = await ytGet('search', {
        part: 'snippet',
        type: 'channel',
        q: keyword,
        maxResults: '20',
        relevanceLanguage: 'en',
      });
      const ids = (data?.items ?? [])
        .map((item: any) => item?.snippet?.channelId || item?.id?.channelId)
        .filter(Boolean);
      allChannelIds.push(...ids);
      log(`  Found ${ids.length} channel IDs`);
    } catch (e: any) {
      log(`[WARN] Search failed for "${keyword}": ${e.message}`);
    }
  }

  // Deduplicate
  const uniqueIds = [...new Set(allChannelIds)];
  log(`Total unique channel candidates: ${uniqueIds.length}`);

  if (!uniqueIds.length) {
    log('[WARN] No channels found');
    process.stdout.write('CHANNELS_FOUND:0\n');
    return;
  }

  // Step 2: ONE batched channels.list call for all candidates (1 unit)
  const batchSize = 50; // API max
  let channelDetails: any[] = [];
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    try {
      const data = await ytGet('channels', {
        part: 'snippet,statistics',
        id: batch.join(','),
      });
      channelDetails.push(...(data?.items ?? []));
    } catch (e: any) {
      log(`[WARN] channels.list batch failed: ${e.message}`);
    }
  }

  // Filter: subscriberCount > 10,000
  const filtered = channelDetails.filter((ch: any) => {
    const subs = parseInt(ch?.statistics?.subscriberCount || '0', 10);
    return subs > 10000;
  });

  log(`After filter (>10k subs): ${filtered.length} channels`);

  // Take top 15 (maintain API relevance order)
  const top15 = filtered.slice(0, 15);

  if (!top15.length) {
    log('[WARN] No channels passed filter');
    process.stdout.write('CHANNELS_FOUND:0\n');
    return;
  }

  // Delete existing auto-discovered channels for this project
  await db.delete(bcTargetChannels)
    .where(eq(bcTargetChannels.projectId, BC_PROJECT_ID));

  // Insert
  for (let i = 0; i < top15.length; i++) {
    const ch = top15[i];
    const channelId = ch.id;
    const snippet = ch?.snippet ?? {};
    const handle = snippet.customUrl ? snippet.customUrl.replace(/^@/, '') : null;
    await db.insert(bcTargetChannels).values({
      projectId: BC_PROJECT_ID,
      channelId,
      channelHandle: handle,
      channelName: (snippet.title || channelId).substring(0, 255),
      channelUrl: handle
        ? `https://www.youtube.com/@${handle}`
        : `https://www.youtube.com/channel/${channelId}`,
      subscriberCount: parseInt(ch?.statistics?.subscriberCount || '0', 10),
      description: snippet.description ? snippet.description.substring(0, 500) : null,
      discoveryMethod: 'auto',
      isConfirmed: false,
      sortOrder: i,
    });
  }

  log(`Inserted ${top15.length} channels`);
  process.stdout.write(`CHANNELS_FOUND:${top15.length}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
