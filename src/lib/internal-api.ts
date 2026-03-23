import type { AstroCookies } from 'astro';

const DEFAULT_INTERNAL_API_BASE_URL = 'http://127.0.0.1:3001';
export const ADMIN_ACTIVE_SITE_COOKIE = 'frinter_admin_site';
const ALLOWED_SITE_SLUGS = new Set(['przemyslawfilipiak', 'focusequalsfreedom', 'frinter']);
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

export function normalizeScopedSiteSlug(value: string | null | undefined, fallback = getCurrentSiteSlug()) {
  if (value && ALLOWED_SITE_SLUGS.has(value)) return value;
  return fallback;
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

export function resolveAdminActiveSiteSlug(cookieHeader: string | null | undefined, fallback = getCurrentSiteSlug()) {
  const cookies = parseCookieHeader(cookieHeader);
  return normalizeScopedSiteSlug(cookies[ADMIN_ACTIVE_SITE_COOKIE], fallback);
}

export function createAdminActiveSiteCookie(siteSlug: string) {
  const parts = [
    `${ADMIN_ACTIVE_SITE_COOKIE}=${encodeURIComponent(normalizeScopedSiteSlug(siteSlug))}`,
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 365}`,
    'SameSite=Strict',
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function resolveScopedSiteSlugForRequest(
  request: Request,
  { useAdminActiveSite = false }: { useAdminActiveSite?: boolean } = {},
) {
  const currentSiteSlug = getCurrentSiteSlug();
  const requestPath = new URL(request.url).pathname;
  const shouldUseAdminSite =
    useAdminActiveSite
    || (
      requestPath.startsWith('/api/')
      && requestPath !== '/api/auth'
      && requestPath !== '/api/logout'
    );

  if (shouldUseAdminSite) {
    return resolveAdminActiveSiteSlug(request.headers.get('cookie'), currentSiteSlug);
  }
  return currentSiteSlug;
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
  if (pathname.startsWith('/v1/social-hub') && !url.searchParams.has('siteSlug')) {
    url.searchParams.set('siteSlug', getCurrentSiteSlug());
  }
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
  includeSiteSlug = false,
  useAdminActiveSite = false,
}: {
  request: Request;
  cookies: AstroCookies;
  pathname: string;
  method?: string;
  requireAuth?: boolean;
  includeSiteSlug?: boolean;
  useAdminActiveSite?: boolean;
}) {
  if (requireAuth && !isAuthenticated(cookies)) return jsonUnauthorized();

  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  const resolvedMethod = method ?? request.method;
  const headers = cloneForwardHeaders(request.headers, request.headers.get('cookie'));
  let body: string | undefined;
  const shouldIncludeSiteSlug = includeSiteSlug || pathname.startsWith('/v1/social-hub');
  const resolvedSiteSlug = resolveScopedSiteSlugForRequest(request, { useAdminActiveSite });

  if (shouldIncludeSiteSlug) {
    targetUrl.searchParams.set('siteSlug', resolvedSiteSlug);
  }

  if (resolvedMethod !== 'GET' && resolvedMethod !== 'HEAD') {
    const rawBody = await request.text();
    if (shouldIncludeSiteSlug) {
      const contentType = headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        const payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? { siteSlug: resolvedSiteSlug, ...parsed }
          : { siteSlug: resolvedSiteSlug };
        body = JSON.stringify(payload);
      } else {
        body = rawBody;
      }
    } else {
      body = rawBody;
    }
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
  includeSiteSlug = false,
  useAdminActiveSite = false,
  query,
}: {
  request: Request;
  pathname: string;
  method?: string;
  body?: Record<string, unknown> | null;
  includeSiteSlug?: boolean;
  useAdminActiveSite?: boolean;
  query?: Record<string, string | number | boolean | null | undefined>;
}) {
  const incomingUrl = new URL(request.url);
  const targetUrl = buildInternalApiUrl(pathname, incomingUrl.search);
  const shouldIncludeSiteSlug = includeSiteSlug || pathname.startsWith('/v1/social-hub');
  const resolvedSiteSlug = resolveScopedSiteSlugForRequest(request, { useAdminActiveSite });
  if (shouldIncludeSiteSlug) {
    targetUrl.searchParams.set('siteSlug', resolvedSiteSlug);
  }
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

  const payload = shouldIncludeSiteSlug
    ? { siteSlug: resolvedSiteSlug, ...(body ?? {}) }
    : (body ?? null);

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload),
    redirect: 'manual',
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}
