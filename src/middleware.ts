import { defineMiddleware } from 'astro:middleware';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const token = context.cookies.get('session')?.value;

    if (!token) {
      return context.redirect('/admin/login');
    }

    try {
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.token, token))
        .limit(1);

      if (!session || session.expiresAt < new Date()) {
        context.cookies.delete('session', { path: '/' });
        return context.redirect('/admin/login');
      }
    } catch {
      return context.redirect('/admin/login');
    }
  }

  return next();
});
