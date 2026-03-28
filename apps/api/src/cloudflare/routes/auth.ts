import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { sessions, sites } from '../../../../../src/db/schema.ts';
import {
  SESSION_COOKIE, createSessionCookie, clearSessionCookie,
  requireAuthMiddleware, sessionMiddleware, verifyPassword, bytesToHex,
} from '../middleware/auth.ts';
import type { HonoEnv } from '../app.ts';

export const authRouter = new Hono<HonoEnv>();

authRouter.post('/v1/auth/login', async (c) => {
  const body = await c.req.json<{ password?: string; siteSlug?: string }>().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const hash = c.env?.ADMIN_PASSWORD_HASH;
  if (!password || !hash) return c.json({ error: 'Password required or server misconfigured' }, 400);
  if (!(await verifyPassword(password, hash))) return c.json({ error: 'Invalid credentials' }, 401);

  const db = c.get('db');
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, expiresAt, siteId: null });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': createSessionCookie(token),
    },
  });
});

authRouter.post('/v1/auth/set-tenant', requireAuthMiddleware, async (c) => {
  const session = c.get('session')!;
  const body = await c.req.json<{ siteSlug?: string }>().catch(() => ({}));
  const slug = typeof body.siteSlug === 'string' ? body.siteSlug.trim().toLowerCase() : '';
  if (!slug) return c.json({ error: 'siteSlug is required' }, 400);
  const db = c.get('db');
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) return c.json({ error: 'Site not found' }, 404);
  if (session.siteId && session.siteId !== site.id) return c.json({ error: 'Forbidden for selected site' }, 403);
  const token = getCookie(c, SESSION_COOKIE)!;
  await db.update(sessions).set({ activeSiteId: site.id }).where(eq(sessions.token, token));
  return c.json({ ok: true, activeSiteId: site.id, siteSlug: site.slug });
});

authRouter.get('/v1/auth/me', sessionMiddleware, async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ authenticated: false }, 401);
  let activeSiteSlug: string | null = null;
  if (session.activeSiteId) {
    const db = c.get('db');
    if (db) {
      const [site] = await db.select().from(sites).where(eq(sites.id, session.activeSiteId)).limit(1);
      activeSiteSlug = site?.slug ?? null;
    }
  }
  return c.json({ authenticated: true, session: { id: session.id, siteId: session.siteId ?? null, activeSiteId: session.activeSiteId ?? null, activeSiteSlug, expiresAt: session.expiresAt } });
});

authRouter.post('/v1/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get('db');
    if (db) await db.delete(sessions).where(eq(sessions.token, token));
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': clearSessionCookie() },
  });
});
