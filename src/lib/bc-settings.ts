/**
 * bc-settings.ts — Brand Clarity LLM configuration helper.
 *
 * Stores provider/model/thinking config in bc_settings DB table (single row).
 * API routes read settings before spawning scripts and inject as env vars.
 *
 * Only ANTHROPIC_API_KEY and OPENROUTER_API_KEY stay in .env.
 */

import { db } from '../db/client';
import { bcSettings } from '../db/schema';

export interface BcSettingsConfig {
  provider: 'openrouter' | 'anthropic';
  lpModel: string;
  scraperModel: string;
  clusterModel: string;
  generatorModel: string;
  extendedThinkingEnabled: boolean;
  lpThinkingBudget: number;
  scraperThinkingBudget: number;
  clusterThinkingBudget: number;
  generatorThinkingBudget: number;
}

export const BC_SETTINGS_DEFAULTS: BcSettingsConfig = {
  provider: 'openrouter',
  lpModel: 'claude-sonnet-4-6',
  scraperModel: 'claude-haiku-4-5-20251001',
  clusterModel: 'claude-sonnet-4-6',
  generatorModel: 'claude-sonnet-4-6',
  extendedThinkingEnabled: false,
  lpThinkingBudget: 10000,
  scraperThinkingBudget: 5000,
  clusterThinkingBudget: 16000,
  generatorThinkingBudget: 16000,
};

export async function getBcSettings(): Promise<BcSettingsConfig> {
  const rows = await db.select().from(bcSettings).limit(1);
  if (!rows.length) return { ...BC_SETTINGS_DEFAULTS };
  return { ...BC_SETTINGS_DEFAULTS, ...(rows[0].config as BcSettingsConfig) };
}

export async function saveBcSettings(config: BcSettingsConfig): Promise<void> {
  const rows = await db.select({ id: bcSettings.id }).from(bcSettings).limit(1);
  if (rows.length) {
    await db.update(bcSettings).set({ config, updatedAt: new Date() });
  } else {
    await db.insert(bcSettings).values({ config });
  }
}

/**
 * Converts settings to env vars that BC scripts read.
 * Passed to child_process.spawn({ env: { ...process.env, ...buildLlmEnv(s) } })
 */
export function buildLlmEnv(s: BcSettingsConfig): Record<string, string> {
  return {
    BC_LLM_PROVIDER: s.provider,
    BC_LP_ANTHROPIC_MODEL: s.lpModel,
    BC_SCRAPER_ANTHROPIC_MODEL: s.scraperModel,
    BC_CLUSTER_ANTHROPIC_MODEL: s.clusterModel,
    BC_GENERATOR_ANTHROPIC_MODEL: s.generatorModel,
    BC_EXTENDED_THINKING_ENABLED: s.extendedThinkingEnabled ? 'true' : 'false',
    BC_LP_THINKING_BUDGET: String(s.lpThinkingBudget),
    BC_SCRAPER_THINKING_BUDGET: String(s.scraperThinkingBudget),
    BC_CLUSTER_THINKING_BUDGET: String(s.clusterThinkingBudget),
    BC_GENERATOR_THINKING_BUDGET: String(s.generatorThinkingBudget),
  };
}
