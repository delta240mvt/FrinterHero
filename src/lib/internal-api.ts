import type { AstroCookies } from 'astro';

const DEFAULT_INTERNAL_API_BASE_URL = 'https://new-pp-api-2026-03-19-new-pp-copy.up.railway.app';
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function getInternalApiBaseUrl() {
  return process.env.API_BASE_URL ?? DEFAULT_INTERNAL_API_BASE_URL;
}

export function getCurrentSiteSlug() {
  return process.env.SITE_SLUG ?? 'przemyslawfilipiak';
}

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const pairs = (cookieHeader ?? '').split(';');
  const parsed: Record<string, string> = {};
  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    if (!rawKey) continue;
    parsed[rawKey] = decodeURIComponent(rawValue.join('='));
  }
  return parsed;
}

export function isAuthenticated(cookies: AstroCookies) {
  return !!cookies.get('session')?.value;
}

export function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

export function jsonUnauthorized() {
  return jsonError('Unauthorized', 401);
}

export function buildInternalApiUrl(pathname: string, search = '') {
  const baseUrl = getInternalApiBaseUrl();
  const url = new URL(pathname, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  url.search = search;
  return url;
}

function cloneForwardHeaders(source: Headers, cookieHeader: string | null) {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return headers;
}

function cloneResponseHeaders(source: Headers) {
  const headers = new Headers();
  for (const [key, value] of source.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.append(key, value);
  }
  return headers;
}

export async function proxyInternalApiRequest({
  request,
  cookies,
  pathname,
  method,
  requireAuth = true,
}: {
  request: Request;
  cookies: AstroCookies;
  pathname: string;
  method?: string;
  requireAuth?: boolean;
}) {
  if (requireAuth && !isAuthenticated(cookies)) return jsonUnauthorized();
  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  const resolvedMethod = method ?? request.method;
  const headers = cloneForwardHeaders(request.headers, request.headers.get('cookie'));
  let body: string | undefined;
  if (resolvedMethod !== 'GET' && resolvedMethod !== 'HEAD') {
    body = await request.text();
  }
  const response = await fetch(targetUrl, {
    method: resolvedMethod,
    headers,
    body,
    redirect: 'manual',
  });
  return new Response(response.body, {
    status: response.status,
    headers: cloneResponseHeaders(response.headers),
  });
}

export async function fetchInternalApiJson({
  request,
  pathname,
  method = 'GET',
  body,
  query,
}: {
  request: Request;
  pathname: string;
  method?: string;
  body?: Record<string, unknown> | null;
  query?: Record<string, string | number | boolean | null | undefined>;
}) {
  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === '') continue;
      targetUrl.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(targetUrl, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? null),
    redirect: 'manual',
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
