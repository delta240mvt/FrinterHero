export const prerender = false;
import type { APIRoute } from 'astro';
import { getShSettings, saveShSettings, normalizeShSettingsConfig } from '@/lib/sh-settings';
import { jsonError, jsonOk, jsonUnauthorized, isAuthenticated } from '@/lib/sh-api-utils';

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();
  const settings = await getShSettings();
  return jsonOk(settings);
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!isAuthenticated(cookies)) return jsonUnauthorized();

  let body: any;
  try { body = await request.json(); } catch {
    return jsonError('Invalid JSON', 400);
  }

  const config = normalizeShSettingsConfig(body);

  await saveShSettings(config);
  return jsonOk({ ok: true, config });
};
