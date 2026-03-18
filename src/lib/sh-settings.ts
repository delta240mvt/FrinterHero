/**
 * sh-settings.ts — Social Hub LLM + provider configuration helper.
 *
 * Stores copywriter model, video/TTS providers, distribution config and
 * brand defaults in sh_settings DB table (single row).
 * API routes read settings before spawning scripts and inject as env vars.
 *
 * Only API keys stay in .env.
 */

import { db } from '../db/client';
import { shSettings } from '../db/schema';

export interface ShSettingsConfig {
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
}

export const SH_SETTINGS_DEFAULTS: ShSettingsConfig = {
  copywriterModel: 'claude-sonnet-4-5',
  copywriterThinkingBudget: 10000,
  videoProvider: 'wavespeed',
  videoModel: 'wan-2.2-ultra-fast',
  ttsProvider: 'elevenlabs',
  distributionProvider: 'upload-post',
  autoSchedule: false,
  defaultHashtags: ['#productivity', '#deepwork', '#focus'],
  brandVoiceFile: 'public/llms-full.txt',
  maxPostLength: 280,
  defaultSuggestionPrompt: '',
  toneOverrides: '',
  avatarImageUrl: '',
  elevenlabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
};

export async function getShSettings(): Promise<ShSettingsConfig> {
  const rows = await db.select().from(shSettings).limit(1);
  if (!rows.length) return { ...SH_SETTINGS_DEFAULTS };
  return { ...SH_SETTINGS_DEFAULTS, ...(rows[0].config as ShSettingsConfig) };
}

export async function saveShSettings(config: ShSettingsConfig): Promise<void> {
  const rows = await db.select({ id: shSettings.id }).from(shSettings).limit(1);
  if (rows.length) {
    await db.update(shSettings).set({ config, updatedAt: new Date() });
  } else {
    await db.insert(shSettings).values({ config });
  }
}

/**
 * Converts settings to env vars that SH scripts read.
 * Passed to child_process.spawn({ env: { ...process.env, ...buildShEnv(s) } })
 */
export function buildShEnv(s: ShSettingsConfig): Record<string, string> {
  return {
    SH_COPYWRITER_MODEL: s.copywriterModel,
    SH_COPYWRITER_THINKING_BUDGET: String(s.copywriterThinkingBudget),
    SH_VIDEO_PROVIDER: s.videoProvider,
    SH_VIDEO_MODEL: s.videoModel,
    SH_TTS_PROVIDER: s.ttsProvider,
    SH_DISTRIBUTION_PROVIDER: s.distributionProvider,
    SH_AUTO_SCHEDULE: s.autoSchedule ? 'true' : 'false',
    SH_DEFAULT_HASHTAGS: s.defaultHashtags.join(','),
    SH_BRAND_VOICE_FILE: s.brandVoiceFile,
    SH_MAX_POST_LENGTH: String(s.maxPostLength),
    SH_DEFAULT_SUGGESTION_PROMPT: s.defaultSuggestionPrompt,
    SH_TONE_OVERRIDES: s.toneOverrides,
    SH_AVATAR_IMAGE_URL: s.avatarImageUrl,
    SH_ELEVENLABS_VOICE_ID: s.elevenlabsVoiceId,
  };
}
