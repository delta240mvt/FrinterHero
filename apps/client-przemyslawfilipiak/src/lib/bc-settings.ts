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
  lpMaxTokens: number;
  scraperMaxTokens: number;
  clusterMaxTokens: number;
  generatorMaxTokens: number;
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
  lpMaxTokens: 6144,
  scraperMaxTokens: 4096,
  clusterMaxTokens: 3072,
  generatorMaxTokens: 8192,
};
