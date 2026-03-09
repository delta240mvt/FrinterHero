import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const TIMEOUT_MS = 30000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function createClient() {
  const { OpenAI } = require('openai');
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

async function query(model: string, prompt: string): Promise<string> {
  const client = createClient();
  const response = await withTimeout(
    client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    }),
    TIMEOUT_MS
  );
  return response.choices[0]?.message?.content || '';
}

export async function queryOpenAI(prompt: string): Promise<string> {
  return query('openai/gpt-4.1-mini', prompt);
}

export async function queryClaude(prompt: string): Promise<string> {
  return query('anthropic/claude-sonnet-4-6', prompt);
}

export async function queryPerplexity(prompt: string): Promise<string> {
  return query('perplexity/llama-3.1-sonar-small-128k-online', prompt);
}

export async function queryGemini(prompt: string): Promise<string> {
  return query('google/gemini-3.1-pro-preview', prompt);
}
