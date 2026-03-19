export type JobTopic =
  | 'geo'
  | 'draft'
  | 'reddit'
  | 'youtube'
  | 'bc-parse'
  | 'bc-scrape'
  | 'bc-generate'
  | 'bc-selector'
  | 'bc-cluster'
  | 'sh-copy'
  | 'sh-video'
  | 'sh-publish';

export type JobStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export interface SitePublicConfigResponse {
  slug: string;
  displayName: string;
  primaryDomain: string;
  brandConfig: Record<string, unknown>;
  seoConfig: Record<string, unknown>;
  featureFlags: Record<string, boolean>;
}

export interface DraftJobPayload {
  gapId: number;
  model?: string;
  authorNotes?: string;
}

export interface GeoJobPayload {
  force?: boolean;
}

export interface SocialHubSettingsResponse {
  copywriterModel: string;
  copywriterThinkingBudget: number;
  videoProvider: string;
  videoModel: string;
  ttsProvider: string;
  distributionProvider: string;
  autoSchedule: boolean;
  defaultHashtags: string[];
  brandVoiceFile: string;
  maxPostLength: number;
  defaultSuggestionPrompt: string;
  toneOverrides: string;
  avatarImageUrl: string;
  elevenlabsVoiceId: string;
  viralEngine: Record<string, unknown>;
}

export interface SocialHubAccountDto {
  id: number;
  platform: string;
  accountName: string;
  accountHandle: string | null;
  authPayload: unknown;
  isActive: boolean;
  createdAt: string | Date;
}

export interface SocialHubTemplateDto {
  id: number;
  name: string;
  slug: string;
  category: string;
  aspectRatio: string;
  jsxTemplate: string;
  previewUrl: string | null;
  isActive: boolean;
}

export interface SocialHubBriefListItemDto {
  id: number;
  sourceType: string;
  sourceId: number;
  sourceTitle: string | null;
  outputFormat: string;
  targetPlatforms: string[];
  targetAccountIds: number[];
  status: string;
  firstGeneratedCopy: unknown;
  prompt: string | null;
  viralEngine: Record<string, unknown> | null;
}

export interface SocialHubSourceDto {
  sourceType: string;
  sourceId: number;
  title: string;
  preview: string;
  fullText?: string;
  metadata: Record<string, unknown>;
  meta?: string;
}
