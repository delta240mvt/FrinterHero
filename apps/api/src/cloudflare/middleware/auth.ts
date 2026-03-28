import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { sessions } from '../../../../../src/db/schema.ts';
import type { HonoEnv } from '../app.ts';

export const SESSION_COOKIE = 'session';

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

export function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt }, key, 256);
  return `pbkdf2:sha256:100000:${bytesToHex(salt.buffer)}:${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, , iterStr, saltHex, hashHex] = parts;
  const iterations = Number(iterStr);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: hexToBytes(saltHex) as BufferSource }, key, 256);
  return timingSafeEqual(new Uint8Array(derived), hexToBytes(hashHex));
}

export function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export const sessionMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const db = c.get('db');
  const token = getCookie(c, SESSION_COOKIE);
  if (token && db) {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
    c.set('session', session?.expiresAt > new Date() ? session : null);
  } else {
    c.set('session', null);
  }
  await next();
});

export const requireAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const db = c.get('db');
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !db) return c.json({ error: 'Unauthorized' }, 401);
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt <= new Date()) return c.json({ error: 'Unauthorized' }, 401);
  c.set('session', session);
  await next();
});
