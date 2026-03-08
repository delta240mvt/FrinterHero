import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get('session')?.value;

  if (token) {
    try {
      await db.delete(sessions).where(eq(sessions.token, token));
    } catch {
      // Best effort
    }
    cookies.delete('session', { path: '/' });
  }

  return redirect('/admin/login');
};
