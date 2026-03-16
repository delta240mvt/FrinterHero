import type { APIRoute } from 'astro';
import { getBcSettings, saveBcSettings } from '@/lib/bc-settings';
import type { BcSettingsConfig } from '@/lib/bc-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  const settings = await getBcSettings();
  return new Response(JSON.stringify(settings), { headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const config: BcSettingsConfig = {
    provider: body.provider === 'anthropic' ? 'anthropic' : 'openrouter',
    lpModel: String(body.lpModel || 'claude-sonnet-4-6'),
    scraperModel: String(body.scraperModel || 'claude-haiku-4-5-20251001'),
    clusterModel: String(body.clusterModel || 'claude-sonnet-4-6'),
    generatorModel: String(body.generatorModel || 'claude-sonnet-4-6'),
    extendedThinkingEnabled: Boolean(body.extendedThinkingEnabled),
    lpThinkingBudget: Math.max(1024, parseInt(String(body.lpThinkingBudget || 10000), 10)),
    scraperThinkingBudget: Math.max(1024, parseInt(String(body.scraperThinkingBudget || 5000), 10)),
    clusterThinkingBudget: Math.max(1024, parseInt(String(body.clusterThinkingBudget || 16000), 10)),
    generatorThinkingBudget: Math.max(1024, parseInt(String(body.generatorThinkingBudget || 16000), 10)),
    lpMaxTokens: Math.max(512, parseInt(String(body.lpMaxTokens || 6000), 10)),
    scraperMaxTokens: Math.max(512, parseInt(String(body.scraperMaxTokens || 4096), 10)),
    clusterMaxTokens: Math.max(512, parseInt(String(body.clusterMaxTokens || 3000), 10)),
    generatorMaxTokens: Math.max(512, parseInt(String(body.generatorMaxTokens || 8192), 10)),
  };

  await saveBcSettings(config);
  return new Response(JSON.stringify({ ok: true, config }), { headers: JSON_HEADERS });
};
