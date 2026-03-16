/**
 * bc-llm-client.ts — Unified LLM client for Brand Clarity pipeline.
 *
 * Supports two providers:
 *   - "openrouter" (default): uses openai SDK with OpenRouter baseURL
 *   - "anthropic": uses @anthropic-ai/sdk with direct Anthropic API
 *
 * Extended Thinking available ONLY with "anthropic" provider.
 *
 * Config env vars:
 *   BC_LLM_PROVIDER             — "openrouter" | "anthropic"
 *   OPENROUTER_API_KEY          — required for openrouter
 *   ANTHROPIC_API_KEY           — required for anthropic
 *   BC_EXTENDED_THINKING_ENABLED — "true" | "false"
 *   BC_THINKING_BUDGET_DEFAULT  — number (default: 10000)
 *   BC_LP_ANTHROPIC_MODEL       — model for lp-parser + clusterer
 *   BC_SCRAPER_ANTHROPIC_MODEL  — model for scraper
 *   BC_CLUSTER_ANTHROPIC_MODEL  — model for pain-clusterer
 *   BC_GENERATOR_ANTHROPIC_MODEL — model for lp-generator
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BcLlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BcLlmCallOptions {
  model: string;
  maxTokens: number;
  messages: BcLlmMessage[];
  systemPrompt?: string;
  thinkingBudget?: number; // undefined = no extended thinking
}

export interface BcLlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  thinkingContent?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PROVIDER = (process.env.BC_LLM_PROVIDER || 'openrouter') as 'openrouter' | 'anthropic';
const ET_ENABLED = process.env.BC_EXTENDED_THINKING_ENABLED === 'true';
const ET_BUDGET_DEFAULT = parseInt(process.env.BC_THINKING_BUDGET_DEFAULT || '10000', 10);

// ─── Lazy clients ─────────────────────────────────────────────────────────────

let _openrouterClient: OpenAI | null = null;
let _anthropicClient: Anthropic | null = null;

function getOpenrouterClient(): OpenAI {
  if (!_openrouterClient) {
    _openrouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
    });
  }
  return _openrouterClient;
}

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return _anthropicClient;
}

// ─── Thinking config builder ──────────────────────────────────────────────────

function buildThinkingConfig(
  model: string,
  budgetTokens: number,
): Anthropic.ThinkingConfigParam {
  // Opus 4.6: adaptive thinking (budget_tokens deprecated)
  if (model === 'claude-opus-4-6') {
    return { type: 'adaptive' };
  }
  return {
    type: 'enabled',
    budget_tokens: budgetTokens,
  };
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

async function callOpenrouter(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  const client = getOpenrouterClient();

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    msgs.push({ role: 'system', content: options.systemPrompt });
  }
  for (const m of options.messages) {
    msgs.push({ role: m.role, content: m.content });
  }

  const resp = await client.chat.completions.create({
    model: options.model,
    max_tokens: options.maxTokens,
    messages: msgs,
  });

  return {
    content: resp.choices[0]?.message?.content ?? '',
    inputTokens: resp.usage?.prompt_tokens ?? 0,
    outputTokens: resp.usage?.completion_tokens ?? 0,
    model: options.model,
  };
}

// ─── Anthropic SDK call ───────────────────────────────────────────────────────

async function callAnthropic(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  const client = getAnthropicClient();

  const thinking = options.thinkingBudget
    ? buildThinkingConfig(options.model, options.thinkingBudget)
    : undefined;

  // When extended thinking: max_tokens must exceed budget_tokens
  let maxTokens = options.maxTokens;
  if (thinking && 'budget_tokens' in thinking && typeof (thinking as any).budget_tokens === 'number') {
    maxTokens = Math.max(options.maxTokens, (thinking as any).budget_tokens + 1024);
  }

  const resp = await client.messages.create({
    model: options.model,
    max_tokens: maxTokens,
    system: options.systemPrompt,
    ...(thinking ? { thinking } : {}),
    messages: options.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  let textContent = '';
  let thinkingContent: string | undefined;

  for (const block of resp.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'thinking') {
      thinkingContent = block.thinking;
    }
  }

  return {
    content: textContent,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
    model: options.model,
    thinkingContent,
  };
}

// ─── Main exported function ───────────────────────────────────────────────────

export async function callBcLlm(options: BcLlmCallOptions): Promise<BcLlmResponse> {
  if (PROVIDER === 'anthropic') {
    return callAnthropic(options);
  }
  return callOpenrouter(options);
}

// ─── Model selectors per step ─────────────────────────────────────────────────

export function getBcLpModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_LP_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

export function getBcScraperModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_SCRAPER_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  }
  return process.env.BC_SCRAPER_MODEL || 'anthropic/claude-haiku-4-5';
}

export function getBcClusterModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_CLUSTER_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

export function getBcGeneratorModel(): string {
  if (PROVIDER === 'anthropic') {
    return process.env.BC_GENERATOR_ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }
  return process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';
}

// ─── Thinking budget per step ─────────────────────────────────────────────────

export function getBcThinkingBudget(
  step: 'lp' | 'scraper' | 'cluster' | 'generator',
): number | undefined {
  // ET only works with anthropic provider
  if (PROVIDER !== 'anthropic' || !ET_ENABLED) return undefined;

  const envKey = `BC_${step.toUpperCase()}_THINKING_BUDGET`;
  const raw = process.env[envKey];
  return raw ? parseInt(raw, 10) : ET_BUDGET_DEFAULT;
}
