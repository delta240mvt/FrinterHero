import { publishBrief } from '../sh-distributor';

export interface ShPublishOptions {
  briefId: number;
  siteId: number | null;
  accountIds: number[];
  scheduledForRaw: string;
}

export interface ShPublishResult {
  briefId: number;
  publishedCount: number;
  publishLogIds: number[];
  protocolLines: string[];
}

export function parseShPublishOptions(raw: {
  briefId: number;
  siteId: number | null;
  accountIds: number[];
  scheduledForRaw: string;
}): { briefId: number; siteId: number | null; accountIds?: number[]; scheduledFor?: Date } {
  if (!raw.briefId) {
    throw new Error('SH_BRIEF_ID is required');
  }

  const scheduledFor = raw.scheduledForRaw ? new Date(raw.scheduledForRaw) : undefined;
  return {
    briefId: raw.briefId,
    siteId: raw.siteId,
    accountIds: raw.accountIds.length > 0 ? raw.accountIds : undefined,
    scheduledFor: scheduledFor && !Number.isNaN(scheduledFor.getTime()) ? scheduledFor : undefined,
  };
}

export async function runShPublishJob(options: ShPublishOptions): Promise<ShPublishResult> {
  const parsed = parseShPublishOptions(options);
  const publishLogs = await publishBrief(
    parsed.briefId,
    {
      accountIds: parsed.accountIds,
      scheduledFor: parsed.scheduledFor,
    },
    parsed.siteId,
  );

  return {
    briefId: parsed.briefId,
    publishedCount: publishLogs.length,
    publishLogIds: publishLogs.map((row) => row.id),
    protocolLines: [
      `RESULT_JSON:${JSON.stringify({
        briefId: parsed.briefId,
        publishedCount: publishLogs.length,
        publishLogIds: publishLogs.map((row) => row.id),
      })}`,
    ],
  };
}
