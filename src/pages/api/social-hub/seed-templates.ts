export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shTemplates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getDefaultTemplates } from '@/lib/sh-image-gen';

/**
 * GET /api/social-hub/seed-templates
 * Seeds / upserts the default SH templates into the DB.
 * Call once from browser to populate templates.
 * Protected by session cookie.
 */
export const GET: APIRoute = async ({ cookies }) => {
  if (!cookies.get('session')?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const templates = getDefaultTemplates();
  const results: string[] = [];

  for (const t of templates) {
    const existing = await db
      .select({ id: shTemplates.id })
      .from(shTemplates)
      .where(eq(shTemplates.slug, t.slug))
      .limit(1);

    if (existing.length > 0) {
      await db.update(shTemplates)
        .set({ name: t.name, category: t.category, aspectRatio: t.aspectRatio, jsxTemplate: t.jsxTemplate, isActive: true })
        .where(eq(shTemplates.slug, t.slug));
      results.push(`updated: ${t.slug}`);
    } else {
      await db.insert(shTemplates).values({ ...t, isActive: true });
      results.push(`inserted: ${t.slug}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
