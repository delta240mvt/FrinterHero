import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { sessions } from '@/db/schema';
import { verifyPassword, generateToken } from '@/utils/auth';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Password required' }), { status: 400 });
    }

    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
    }

    const isValid = await verifyPassword(password, hash);

    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(sessions).values({ token, expiresAt });

    const cookieValue = `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Set-Cookie': cookieValue },
    });
  } catch (err) {
    console.error('[Auth] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
