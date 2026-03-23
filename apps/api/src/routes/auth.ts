import type { RouteContext } from '../helpers.js';
import {
  json, readJsonBody, normalizeSiteSlug, parseCookies,
  getSiteBySlug, getSiteById, getSession, requireAuth, createSessionCookie, clearSessionCookie,
  SESSION_COOKIE, db, eq, crypto, bcrypt, sessions,
} from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { req, res, method, pathname } = ctx;

  if (method === 'POST' && pathname === '/v1/auth/login') {
    const body = await readJsonBody(req);
    const password = typeof body.password === 'string' ? body.password : '';
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!password || !hash) return json(res, 400, { error: 'Password required or server misconfigured' }), true;
    if (!(await bcrypt.compare(password, hash))) return json(res, 401, { error: 'Invalid credentials' }), true;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const requestedSiteSlug = normalizeSiteSlug(body.siteSlug);
    const site = requestedSiteSlug ? await getSiteBySlug(requestedSiteSlug) : null;
    await db.insert(sessions).values({ token, expiresAt, siteId: null });
    json(res, 200, { ok: true, siteSlug: site?.slug ?? null }, { 'Set-Cookie': createSessionCookie(token) });
    return true;
  }

  if (method === 'POST' && pathname === '/v1/auth/set-tenant') {
    const session = await requireAuth(req, res);
    if (!session) return true;
    const body = await readJsonBody(req);
    const slug = normalizeSiteSlug(body.siteSlug);
    if (!slug) return json(res, 400, { error: 'siteSlug is required' }), true;
    const site = await getSiteBySlug(slug);
    if (!site) return json(res, 404, { error: 'Site not found' }), true;
    // Scoped session check: if session.siteId is set, only allow switching to that site
    if (session.siteId && session.siteId !== site.id) {
      return json(res, 403, { error: 'Forbidden for selected site' }), true;
    }
    await db.update(sessions).set({ activeSiteId: site.id }).where(eq(sessions.token, parseCookies(req.headers.cookie)[SESSION_COOKIE]));
    json(res, 200, { ok: true, activeSiteId: site.id, siteSlug: site.slug });
    return true;
  }

  if (method === 'GET' && pathname === '/v1/auth/me') {
    const session = await getSession(req);
    if (!session) return json(res, 401, { authenticated: false }), true;
    let activeSiteSlug: string | null = null;
    if (session.activeSiteId) {
      const activeSite = await getSiteById(session.activeSiteId);
      activeSiteSlug = activeSite?.slug ?? null;
    }
    json(res, 200, {
      authenticated: true,
      session: {
        id: session.id,
        siteId: session.siteId ?? null,
        activeSiteId: session.activeSiteId ?? null,
        activeSiteSlug,
        expiresAt: session.expiresAt,
      },
    });
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
