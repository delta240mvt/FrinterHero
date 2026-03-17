export const prerender = false;
import type { APIRoute } from 'astro';
import { getShSettings, saveShSettings } from '@/lib/sh-settings';
import type { ShSettingsConfig } from '@/lib/sh-settings';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  const settings = await getShSettings();
  return new Response(JSON.stringify(settings), { headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const config: ShSettingsConfig = {
    copywriterModel: String(body.copywriterModel || 'claude-sonnet-4-6'),
    copywriterThinkingBudget: Math.max(1024, parseInt(String(body.copywriterThinkingBudget || 10000), 10)),
    videoProvider: String(body.videoProvider || 'wavespeed'),
    videoModel: String(body.videoModel || 'wan-2.2-ultra-fast'),
    ttsProvider: String(body.ttsProvider || 'elevenlabs'),
    distributionProvider: String(body.distributionProvider || 'upload-post'),
    autoSchedule: Boolean(body.autoSchedule),
    defaultHashtags: Array.isArray(body.defaultHashtags) ? body.defaultHashtags.map(String) : ['#productivity', '#deepwork', '#focus'],
    brandVoiceFile: String(body.brandVoiceFile || 'public/llms-full.txt'),
    maxPostLength: Math.max(1, parseInt(String(body.maxPostLength || 280), 10)),
    defaultSuggestionPrompt: String(body.defaultSuggestionPrompt || ''),
    toneOverrides: String(body.toneOverrides || ''),
    avatarImageUrl: String(body.avatarImageUrl || ''),
    elevenlabsVoiceId: String(body.elevenlabsVoiceId || 'EXAVITQu4vr4xnSDxMaL'),
  };

  await saveShSettings(config);
  return new Response(JSON.stringify({ ok: true, config }), { headers: JSON_HEADERS });
};
