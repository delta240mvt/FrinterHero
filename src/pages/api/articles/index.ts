import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles } from '@/db/schema';
import { eq, desc, like, and, count } from 'drizzle-orm';
import { generateSlug } from '@/utils/slug';
import { parseMarkdown, calculateReadingTime } from '@/utils/markdown';

export const GET: APIRoute = async ({ url }) => {
  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = db.select().from(articles).$dynamic();
    let countQuery = db.select({ total: count() }).from(articles).$dynamic();

    const conditions = [];
    if (status) conditions.push(eq(articles.status, status as any));
    if (search) conditions.push(like(articles.title, `%${search}%`));

    if (conditions.length === 1) {
      query = query.where(conditions[0]);
      countQuery = countQuery.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
      countQuery = countQuery.where(and(...conditions));
    }

    const results = await query.orderBy(desc(articles.createdAt)).limit(limit).offset(offset);
    const [{ total }] = await countQuery;

    return new Response(JSON.stringify({ results, total, page, limit }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Articles GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const slug = body.slug || generateSlug(body.title);
    const htmlContent = body.content ? parseMarkdown(body.content) : '';
    const readingTime = calculateReadingTime(htmlContent);

    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (body.tags || []);

    const [result] = await db.insert(articles).values({
      slug,
      title: body.title,
      description: body.description || null,
      content: htmlContent,
      tags,
      featured: body.featured || false,
      status: body.status || 'draft',
      readingTime,
      author: body.author || 'Przemysław Filipiak',
      publishedAt: body.status === 'published' ? new Date() : null,
    }).returning({ id: articles.id });

    return new Response(JSON.stringify({ id: result.id, slug }), { status: 201 });
  } catch (err) {
    console.error('[Articles POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
