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
import {
  SH_VIRAL_ENGINE_DEFAULTS,
  buildShViralEngineEnv,
  buildShViralEngineRuntime,
  mergeShViralEngineConfig,
  normalizeShViralEngineConfig,
  type ShViralEngineConfig,
  type ShViralEngineRuntime,
} from './sh-viral-engine-types';

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
  viralEngine: ShViralEngineConfig;
}

export const SH_SETTINGS_DEFAULTS: ShSettingsConfig = {
  copywriterModel: 'claude-sonnet-4-6',
  copywriterThinkingBudget: 10000,
  videoProvider: 'wavespeed',
  videoModel: 'wan-2.2-ultra-fast',
  ttsProvider: 'elevenlabs',
  distributionProvider: 'upload-post',
  autoSchedule: false,
  defaultHashtags: ['#productivity', '#deepwork', '#focus'],
  brandVoiceFile: '/llms-full.txt',
  maxPostLength: 280,
  defaultSuggestionPrompt: '',
  toneOverrides: '',
  avatarImageUrl: '',
  elevenlabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  viralEngine: SH_VIRAL_ENGINE_DEFAULTS,
};

export async function getShSettings(): Promise<ShSettingsConfig> {
  const rows = await db.select().from(shSettings).limit(1);
  if (!rows.length) return normalizeShSettingsConfig(SH_SETTINGS_DEFAULTS);
  return normalizeShSettingsConfig(rows[0].config);
}

export async function saveShSettings(config: ShSettingsConfig): Promise<void> {
  const normalized = normalizeShSettingsConfig(config);
  const rows = await db.select({ id: shSettings.id }).from(shSettings).limit(1);
  if (rows.length) {
    await db.update(shSettings).set({ config: normalized, updatedAt: new Date() });
  } else {
    await db.insert(shSettings).values({ config: normalized });
  }
}

/**
 * Converts settings to env vars that SH scripts read.
 * Passed to child_process.spawn({ env: { ...process.env, ...buildShEnv(s) } })
 */
export function buildShEnv(s: ShSettingsConfig): Record<string, string> {
  const normalized = normalizeShSettingsConfig(s);
  const viralRuntime = buildShViralEngineRuntime(normalized.viralEngine, undefined, { scope: 'global' });

  return {
    SH_COPYWRITER_MODEL: normalized.copywriterModel,
    SH_COPYWRITER_THINKING_BUDGET: String(normalized.copywriterThinkingBudget),
    SH_VIDEO_PROVIDER: normalized.videoProvider,
    SH_VIDEO_MODEL: normalized.videoModel,
    SH_TTS_PROVIDER: normalized.ttsProvider,
    SH_DISTRIBUTION_PROVIDER: normalized.distributionProvider,
    SH_AUTO_SCHEDULE: normalized.autoSchedule ? 'true' : 'false',
    SH_DEFAULT_HASHTAGS: normalized.defaultHashtags.join(','),
    SH_BRAND_VOICE_FILE: normalized.brandVoiceFile,
    SH_MAX_POST_LENGTH: String(normalized.maxPostLength),
    SH_DEFAULT_SUGGESTION_PROMPT: normalized.defaultSuggestionPrompt,
    SH_TONE_OVERRIDES: normalized.toneOverrides,
    SH_AVATAR_IMAGE_URL: normalized.avatarImageUrl,
    SH_ELEVENLABS_VOICE_ID: normalized.elevenlabsVoiceId,
    ...buildShViralEngineEnv(viralRuntime),
  };
}

export function normalizeShSettingsConfig(raw: unknown): ShSettingsConfig {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    ...SH_SETTINGS_DEFAULTS,
    copywriterModel: String(source.copywriterModel || SH_SETTINGS_DEFAULTS.copywriterModel),
    copywriterThinkingBudget: clampInt(source.copywriterThinkingBudget, 1024, 64000, SH_SETTINGS_DEFAULTS.copywriterThinkingBudget),
    videoProvider: String(source.videoProvider || SH_SETTINGS_DEFAULTS.videoProvider),
    videoModel: String(source.videoModel || SH_SETTINGS_DEFAULTS.videoModel),
    ttsProvider: String(source.ttsProvider || SH_SETTINGS_DEFAULTS.ttsProvider),
    distributionProvider: String(source.distributionProvider || SH_SETTINGS_DEFAULTS.distributionProvider),
    autoSchedule: toBoolean(source.autoSchedule, SH_SETTINGS_DEFAULTS.autoSchedule),
    defaultHashtags: toStringArray(source.defaultHashtags, SH_SETTINGS_DEFAULTS.defaultHashtags),
    brandVoiceFile: String(source.brandVoiceFile || SH_SETTINGS_DEFAULTS.brandVoiceFile),
    maxPostLength: clampInt(source.maxPostLength, 1, 10000, SH_SETTINGS_DEFAULTS.maxPostLength),
    defaultSuggestionPrompt: String(source.defaultSuggestionPrompt || SH_SETTINGS_DEFAULTS.defaultSuggestionPrompt),
    toneOverrides: String(source.toneOverrides || SH_SETTINGS_DEFAULTS.toneOverrides),
    avatarImageUrl: String(source.avatarImageUrl || SH_SETTINGS_DEFAULTS.avatarImageUrl),
    elevenlabsVoiceId: String(source.elevenlabsVoiceId || SH_SETTINGS_DEFAULTS.elevenlabsVoiceId),
    viralEngine: mergeShViralEngineConfig(
      SH_SETTINGS_DEFAULTS.viralEngine,
      normalizeShViralEngineConfig(source.viralEngine),
    ),
  };
}

export function buildShViralEngineRuntimeFromSettings(
  settings: ShSettingsConfig,
  overrides?: Partial<ShViralEngineConfig> | null,
  meta: {
    scope?: 'global' | 'brief';
    sourceType?: string;
    outputFormat?: string;
    briefId?: number | null;
  } = {},
): ShViralEngineRuntime {
  const normalized = normalizeShSettingsConfig(settings);
  return buildShViralEngineRuntime(normalized.viralEngine, overrides, meta);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.map((item) => String(item).trim()).filter(Boolean);
}
