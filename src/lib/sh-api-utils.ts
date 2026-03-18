/**
 * TASK-09: Shared helpers for Social Hub API routes.
 * Eliminates copy-pasted auth(), JSON_HEADERS and response builders.
 */

import type { AstroCookies } from 'astro';

export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Returns true if the session cookie is present */
export function isAuthenticated(cookies: AstroCookies): boolean {
  return !!cookies.get('session')?.value;
}

/** 200 / custom-status JSON response */
export const jsonOk = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

/** Error JSON response */
export const jsonError = (message: string, status = 500): Response =>
  new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });

/** 401 Unauthorized shorthand */
export const jsonUnauthorized = (): Response =>
  jsonError('Unauthorized', 401);
