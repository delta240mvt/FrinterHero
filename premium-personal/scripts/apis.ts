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

export async function queryOpenAI(query: string): Promise<string> {
  const { OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await withTimeout(
    openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000,
    }),
    TIMEOUT_MS
  );

  return response.choices[0]?.message?.content || '';
}

export async function queryClaude(query: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await withTimeout(
    anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: query }],
    }),
    TIMEOUT_MS
  );

  const content = response.content[0];
  return content.type === 'text' ? content.text : '';
}

export async function queryPerplexity(query: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [{ role: 'user', content: query }],
        max_tokens: 1000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}
