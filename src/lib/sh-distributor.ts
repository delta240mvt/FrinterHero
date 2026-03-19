/**
 * sh-distributor.ts — SocialHub distribution layer.
 *
 * Wraps the Upload-Post.com API to publish content briefs to multiple
 * social accounts. Handles caption adaptation per platform and DB bookkeeping.
 *
 * Upload-Post API reference:
 *   POST https://api.upload-post.com/api/upload
 *   Headers: { Authorization: 'Apikey {UPLOADPOST_API_KEY}' }
 *   Body (FormData): video (file | URL), title, user (account user ID from authPayload), platform[]
 */

import { db } from '../db/client';
import {
  shContentBriefs,
  shGeneratedCopy,
  shMediaAssets,
  shPublishLog,
  shSocialAccounts,
} from '../db/schema';
import { eq, and, inArray, isNull, or } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishOptions {
  /** URL to media file (image or video) */
  mediaUrl: string;
  /** Full assembled caption: hookLine + bodyText + hashtags + cta */
  caption: string;
  /** instagram | tiktok | threads | twitter | linkedin */
  platform: string;
  /** Raw authPayload stored in shSocialAccounts.authPayload */
  accountAuthPayload: any;
  scheduledFor?: Date;
}

export interface PublishResult {
  postId: string;
  postUrl?: string;
}

// ---------------------------------------------------------------------------
// Caption builder
// ---------------------------------------------------------------------------

/**
 * Assembles and trims copy for the target platform.
 *
 * Character limits / hashtag rules per platform:
 *   twitter/x  — 280 chars max, strip to 2–3 hashtags
 *   instagram  — 2200 chars (we use full), 20–30 hashtags
 *   threads    — 500 chars max, no hashtags
 *   linkedin   — 3000 chars (we use full), professional tone (no emoji pruning here)
 *   tiktok     — 2200 chars max, keep full hashtag list
 */
export function buildCaption(
  copy: { hookLine: string; bodyText: string; hashtags: string[]; cta?: string | null },
  platform: string,
): string {
  const pl = platform.toLowerCase().replace(/\s+/g, '');

  const hashtagList = (copy.hashtags ?? []).map((h) =>
    h.startsWith('#') ? h : `#${h}`,
  );

  switch (pl) {
    case 'twitter':
    case 'x': {
      // 280 chars, 2–3 hashtags
      const tags = hashtagList.slice(0, 3).join(' ');
      const cta = copy.cta ? ` ${copy.cta}` : '';
      const body = `${copy.hookLine}\n\n${copy.bodyText}${cta}`;
      const full = tags ? `${body}\n\n${tags}` : body;
      return full.slice(0, 280);
    }

    case 'threads': {
      // 500 chars, no hashtags
      const cta = copy.cta ? ` ${copy.cta}` : '';
      const full = `${copy.hookLine}\n\n${copy.bodyText}${cta}`;
      return full.slice(0, 500);
    }

    case 'instagram': {
      // Up to 2200 chars, 20–30 hashtags
      const tags = hashtagList.slice(0, 30).join(' ');
      const cta = copy.cta ? `\n\n${copy.cta}` : '';
      const body = `${copy.hookLine}\n\n${copy.bodyText}${cta}`;
      const full = tags ? `${body}\n\n${tags}` : body;
      return full.slice(0, 2200);
    }

    case 'linkedin': {
      // Up to 3000 chars, professional, keep hashtags
      const tags = hashtagList.join(' ');
      const cta = copy.cta ? `\n\n${copy.cta}` : '';
      const body = `${copy.hookLine}\n\n${copy.bodyText}${cta}`;
      const full = tags ? `${body}\n\n${tags}` : body;
      return full.slice(0, 3000);
    }

    case 'tiktok':
    default: {
      // 2200 chars, full hashtag list
      const tags = hashtagList.join(' ');
      const cta = copy.cta ? `\n\n${copy.cta}` : '';
      const body = `${copy.hookLine}\n\n${copy.bodyText}${cta}`;
      const full = tags ? `${body}\n\n${tags}` : body;
      return full.slice(0, 2200);
    }
  }
}

// ---------------------------------------------------------------------------
// Upload-Post API client
// ---------------------------------------------------------------------------

/**
 * Sends a single publish request to the Upload-Post.com API.
 * Returns the external post ID (and URL when provided).
 */
export async function publishToUploadPost(opts: PublishOptions): Promise<PublishResult> {
  const apiKey = process.env.UPLOADPOST_API_KEY;
  if (!apiKey) {
    throw new Error('[sh-distributor] UPLOADPOST_API_KEY environment variable is not set');
  }

  const auth = opts.accountAuthPayload ?? {};
  // Upload-Post expects the account's user ID from the authPayload
  const userId: string = auth.userId ?? auth.user_id ?? auth.id ?? '';
  if (!userId) {
    throw new Error('[sh-distributor] accountAuthPayload missing userId field');
  }

  const formData = new FormData();
  formData.append('video', opts.mediaUrl);           // URL to media file
  formData.append('title', opts.caption.slice(0, 255)); // title field
  formData.append('user', userId);
  formData.append('platform[]', opts.platform);

  if (opts.scheduledFor) {
    // Upload-Post accepts ISO 8601 scheduled time
    formData.append('schedule', opts.scheduledFor.toISOString());
  }

  const res = await fetch('https://api.upload-post.com/api/upload', {
    method: 'POST',
    headers: {
      Authorization: `Apikey ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[sh-distributor] Upload-Post API error ${res.status}: ${text}`);
  }

  const data = await res.json() as Record<string, any>;

  // Upload-Post returns { id, url, ... } — field names may vary by version
  const postId: string =
    String(data.id ?? data.postId ?? data.post_id ?? data.upload_id ?? '');
  const postUrl: string | undefined =
    data.url ?? data.postUrl ?? data.post_url ?? undefined;

  if (!postId) {
    throw new Error('[sh-distributor] Upload-Post returned no post ID: ' + JSON.stringify(data));
  }

  return { postId, postUrl };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Full publish flow for a single content brief:
 *   1. Load brief + targetAccountIds
 *   2. Load target accounts from shSocialAccounts
 *   3. Load approved copy (status = 'approved') from shGeneratedCopy
 *   4. Load completed media asset from shMediaAssets
 *   5. For each target account, call publishToUploadPost
 *   6. Insert an shPublishLog record per account
 *   7. Advance brief status to 'published'
 *   8. Return array of inserted publish log records
 */
export async function publishBrief(
  briefId: number,
  overrides?: { accountIds?: number[]; scheduledFor?: Date },
  siteId?: number | null,
): Promise<typeof shPublishLog.$inferSelect[]> {
  const siteScoped = <T>(column: T) =>
    siteId ? or(eq(column as never, siteId), isNull(column as never)) : undefined;

  // 1. Load brief
  const [brief] = await db
    .select()
    .from(shContentBriefs)
    .where(and(eq(shContentBriefs.id, briefId), siteScoped(shContentBriefs.siteId)))
    .limit(1);

  if (!brief) {
    throw new Error(`[sh-distributor] Brief ${briefId} not found`);
  }

  // 2. Resolve target account IDs (override wins over brief's stored list)
  const accountIds: number[] =
    overrides?.accountIds?.length
      ? overrides.accountIds
      : ((brief.targetAccountIds as number[]) ?? []);

  if (!accountIds.length) {
    throw new Error(`[sh-distributor] Brief ${briefId} has no target accounts`);
  }

  const accounts = await db
    .select()
    .from(shSocialAccounts)
    .where(and(inArray(shSocialAccounts.id, accountIds), siteScoped(shSocialAccounts.siteId)));

  if (!accounts.length) {
    throw new Error(`[sh-distributor] No active accounts found for ids: ${accountIds.join(',')}`);
  }

  // 3. Load approved copy (first approved variant wins)
  const [copy] = await db
    .select()
    .from(shGeneratedCopy)
    .where(
      and(
        eq(shGeneratedCopy.briefId, briefId),
        siteScoped(shGeneratedCopy.siteId),
        eq(shGeneratedCopy.status, 'approved'),
      ),
    )
    .limit(1);

  if (!copy) {
    throw new Error(`[sh-distributor] Brief ${briefId} has no approved copy`);
  }

  // 4. Load completed media asset
  const [media] = await db
    .select()
    .from(shMediaAssets)
    .where(
      and(
        eq(shMediaAssets.briefId, briefId),
        siteScoped(shMediaAssets.siteId),
        eq(shMediaAssets.status, 'completed'),
      ),
    )
    .limit(1);

  if (!media || !media.mediaUrl) {
    throw new Error(`[sh-distributor] Brief ${briefId} has no completed media asset`);
  }

  const scheduledFor = overrides?.scheduledFor;

  // 5–6. Publish to each account and record the result
  const publishLogs: typeof shPublishLog.$inferSelect[] = [];

  for (const account of accounts) {
    const caption = buildCaption(
      {
        hookLine: copy.hookLine,
        bodyText: copy.bodyText,
        hashtags: (copy.hashtags as string[]) ?? [],
        cta: copy.cta,
      },
      account.platform,
    );

    let externalPostId: string | undefined;
    let externalPostUrl: string | undefined;
    let errorMessage: string | undefined;
    let logStatus = 'published';
    let publishedAt: Date | undefined = new Date();

    try {
      const result = await publishToUploadPost({
        mediaUrl: media.mediaUrl,
        caption,
        platform: account.platform,
        accountAuthPayload: account.authPayload,
        scheduledFor,
      });
      externalPostId = result.postId;
      externalPostUrl = result.postUrl;

      if (scheduledFor) {
        logStatus = 'scheduled';
        publishedAt = undefined;
      }
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      logStatus = 'failed';
      publishedAt = undefined;
      console.error(`[sh-distributor] Failed to publish brief ${briefId} to account ${account.id} (${account.platform}):`, err);
    }

    const [inserted] = await db
      .insert(shPublishLog)
      .values({
        siteId: siteId ?? brief.siteId ?? null,
        briefId,
        mediaAssetId: media.id,
        accountId: account.id,
        platform: account.platform,
        externalPostId: externalPostId ?? null,
        externalPostUrl: externalPostUrl ?? null,
        publishedAt: publishedAt ?? null,
        scheduledFor: scheduledFor ?? null,
        status: logStatus,
        errorMessage: errorMessage ?? null,
      })
      .returning();

    publishLogs.push(inserted);
  }

  // 7. Advance brief status to 'published' (even if some accounts failed)
  await db
    .update(shContentBriefs)
    .set({ status: 'published' })
    .where(and(eq(shContentBriefs.id, briefId), siteScoped(shContentBriefs.siteId)));

  // 8. Return all log records
  return publishLogs;
}
