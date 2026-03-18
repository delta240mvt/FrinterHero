/**
 * bc-video-discovery.ts — Discovers top 3 relevant videos per confirmed channel.
 *
 * No LLM. Uses YouTube Data API v3 (YOUTUBE_API_KEY).
 * Quota: N search.list (N = confirmed channels, 100 units each) + N videos.list batches (1 unit each).
 *
 * Input env: BC_PROJECT_ID, YOUTUBE_API_KEY
 * Output: inserts bcTargetVideos, stdout VIDEOS_FOUND:N
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcTargetChannels, bcTargetVideos } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const YT_API_KEY = process.env.YOUTUBE_API_KEY!;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-VIDEOS] ${msg}`);
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
  const projectSiteId = project.siteId ?? null;

  const confirmedChannels = await db.select().from(bcTargetChannels)
    .where(and(
      eq(bcTargetChannels.projectId, BC_PROJECT_ID),
      eq(bcTargetChannels.isConfirmed, true),
    ));

  if (!confirmedChannels.length) {
    console.error('[ERROR] No confirmed channels — confirm channels first');
    process.exit(1);
  }

  const keywords: string[] = Array.isArray(project.nicheKeywords)
    ? (project.nicheKeywords as string[]).slice(0, 6)
    : [];
  const query = keywords.join(' ');

  log(`Finding relevant + popular videos per channel for ${confirmedChannels.length} channels`);
  log(`Query: "${query}"`);

  // Clear existing videos for this project
  await db.delete(bcTargetVideos).where(eq(bcTargetVideos.projectId, BC_PROJECT_ID));

  let totalVideos = 0;

  for (const channel of confirmedChannels) {
    log(`Channel: ${channel.channelName} (${channel.channelId})`);

    try {
      // ── Pool A: keyword-relevant videos ──────────────────────────────────
      let relevantItems: any[] = [];
      if (query) {
        const searchData = await ytGet('search', {
          part: 'id,snippet',
          channelId: channel.channelId,
          q: query,
          type: 'video',
          order: 'relevance',
          maxResults: '10',
        });
        relevantItems = (searchData?.items ?? []).filter((item: any) => item?.id?.videoId);
        log(`  Keyword search (relevance): ${relevantItems.length} candidates`);
      }

      // ── Pool B: most popular (highest view count) ─────────────────────────
      const popularData = await ytGet('search', {
        part: 'id,snippet',
        channelId: channel.channelId,
        type: 'video',
        order: 'viewCount',
        maxResults: '10',
      });
      const popularItems: any[] = (popularData?.items ?? []).filter((item: any) => item?.id?.videoId);
      log(`  Popular search (viewCount): ${popularItems.length} candidates`);

      // ── Merge & deduplicate ───────────────────────────────────────────────
      const seen = new Set<string>();
      const merged: Array<{ item: any; pool: 'relevant' | 'popular' }> = [];
      for (const item of relevantItems) {
        const vid = item.id.videoId;
        if (!seen.has(vid)) { seen.add(vid); merged.push({ item, pool: 'relevant' }); }
      }
      for (const item of popularItems) {
        const vid = item.id.videoId;
        if (!seen.has(vid)) { seen.add(vid); merged.push({ item, pool: 'popular' }); }
      }

      // Fallback if both pools empty
      if (!merged.length) {
        log(`  No videos found for ${channel.channelName}`);
        continue;
      }

      // ── Fetch stats for all candidates (1 API unit) ───────────────────────
      const videoIds = merged.map(({ item }) => item.id.videoId);
      const statsData = await ytGet('videos', {
        part: 'statistics,contentDetails',
        id: videoIds.join(','),
      });
      const statsMap: Record<string, any> = {};
      for (const item of (statsData?.items ?? [])) {
        statsMap[item.id] = item;
      }

      // ── Score: top 3 relevant + top 2 popular (deduped) ───────────────────
      const scoredRelevant = merged
        .filter(({ pool }) => pool === 'relevant')
        .map(({ item }, index) => {
          const videoId = item.id.videoId;
          const stats = statsMap[videoId];
          const commentCount = parseInt(stats?.statistics?.commentCount || '0', 10);
          const viewCount = parseInt(stats?.statistics?.viewCount || '0', 10);
          const rankScore = (1 - index / Math.max(relevantItems.length, 10)) * 0.7;
          const engagementScore = commentCount > 100 ? 0.3 : commentCount > 10 ? 0.15 : 0;
          return { videoId, item, commentCount, viewCount, relevanceScore: Math.min(1.0, rankScore + engagementScore) };
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 3);

      const relevantIds = new Set(scoredRelevant.map(v => v.videoId));
      const scoredPopular = merged
        .filter(({ pool, item }) => pool === 'popular' && !relevantIds.has(item.id.videoId))
        .map(({ item }) => {
          const videoId = item.id.videoId;
          const stats = statsMap[videoId];
          const commentCount = parseInt(stats?.statistics?.commentCount || '0', 10);
          const viewCount = parseInt(stats?.statistics?.viewCount || '0', 10);
          return { videoId, item, commentCount, viewCount, relevanceScore: 0.5 };
        })
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 2);

      const finalVideos = [...scoredRelevant, ...scoredPopular];

      for (const video of finalVideos) {
        const item = video.item;
        await db.insert(bcTargetVideos).values({
          siteId: projectSiteId,
          projectId: BC_PROJECT_ID,
          channelId: channel.id,
          videoId: video.videoId,
          videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
          title: (item.snippet?.title || video.videoId).substring(0, 500),
          description: item.snippet?.description ? item.snippet.description.substring(0, 500) : null,
          viewCount: video.viewCount,
          commentCount: video.commentCount,
          publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
          relevanceScore: video.relevanceScore,
        });
        totalVideos++;
      }

      log(`  Inserted ${finalVideos.length} videos (${scoredRelevant.length} relevant + ${scoredPopular.length} popular)`);
    } catch (e: any) {
      log(`[WARN] Failed for channel ${channel.channelName}: ${e.message}`);
    }
  }

  // Update project status
  await db.update(bcProjects).set({
    status: 'scraping',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, BC_PROJECT_ID));

  log(`Done. Total videos: ${totalVideos}`);
  process.stdout.write(`VIDEOS_FOUND:${totalVideos}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
