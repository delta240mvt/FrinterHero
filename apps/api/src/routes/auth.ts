import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, normalizeSiteSlug, parseCookies,
  getSiteBySlug, getSession, createSessionCookie, clearSessionCookie,
  SESSION_COOKIE, db, eq, crypto, bcrypt, sessions,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, pathname } = ctx;

  if (method === 'POST' && pathname === '/v1/auth/login') {
    const body = await readJsonBody(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const site = await getSiteBySlug(normalizeSiteSlug(body.siteSlug));
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!password || !hash) return json(res, 400, { error: 'Password required or server misconfigured' }), true;
    if (!site) return json(res, 404, { error: 'Site not found' }), true;
    if (!(await bcrypt.compare(password, hash))) return json(res, 401, { error: 'Invalid credentials' }), true;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({ token, expiresAt, siteId: site.id });
    json(res, 200, { ok: true, siteSlug: site.slug }, { 'Set-Cookie': createSessionCookie(token) });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/auth/me') {
    const session = await getSession(req);
    if (!session) return json(res, 401, { authenticated: false }), true;
    json(res, 200, { authenticated: true, session: { id: session.id, siteId: session.siteId ?? null, expiresAt: session.expiresAt } });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/auth/logout') {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await db.delete(sessions).where(eq(sessions.token, token));
    json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return true;
  }

  return false;
}
