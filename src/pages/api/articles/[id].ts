import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateSlug } from '@/utils/slug';
import { parseMarkdown, calculateReadingTime } from '@/utils/markdown';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = parseInt(params.id || '0');
    const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);

    if (!article) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(article), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, params }) => {
  try {
    const id = parseInt(params.id || '0');
    const body = await request.json();

    const htmlContent = body.content ? parseMarkdown(body.content) : undefined;
    const readingTime = htmlContent ? calculateReadingTime(htmlContent) : undefined;

    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : body.tags;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (htmlContent !== undefined) updateData.content = htmlContent;
    if (readingTime !== undefined) updateData.readingTime = readingTime;
    if (tags !== undefined) updateData.tags = tags;
    if (body.featured !== undefined) updateData.featured = body.featured;
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === 'published') {
        updateData.publishedAt = new Date();
      }
    }
    if (body.author !== undefined) updateData.author = body.author;

    await db.update(articles).set(updateData).where(eq(articles.id, id));

    // Return updated article including AI generation metadata (sourceGapId, generatedByModel are immutable)
    const [updated] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);

    return new Response(JSON.stringify(updated || { success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Articles PUT]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = parseInt(params.id || '0');
    await db.delete(articles).where(eq(articles.id, id));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Articles DELETE]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
