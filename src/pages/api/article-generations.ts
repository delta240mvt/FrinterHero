import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articleGenerations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const articleId = url.searchParams.get('article_id');
  const gapId = url.searchParams.get('gap_id');

  try {
    const conditions: any[] = [];
    if (articleId) conditions.push(eq(articleGenerations.articleId, parseInt(articleId, 10)));
    if (gapId) conditions.push(eq(articleGenerations.gapId, parseInt(gapId, 10)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const generations = await db.select({
      id: articleGenerations.id,
      articleId: articleGenerations.articleId,
      gapId: articleGenerations.gapId,
      generatedByModel: articleGenerations.generatedByModel,
      generationTimestamp: articleGenerations.generationTimestamp,
      publicationTimestamp: articleGenerations.publicationTimestamp,
      contentChanged: articleGenerations.contentChanged,
      kbEntriesUsed: articleGenerations.kbEntriesUsed,
      modelsQueried: articleGenerations.modelsQueried,
      authorNotes: articleGenerations.authorNotes,
    }).from(articleGenerations).where(whereClause);

    // Return summary (omit full prompt and content for performance)
    const summaries = generations.map(g => ({
      ...g,
      original_content_length: 0, // omitted in list view
      final_content_length: 0,
    }));

    return new Response(JSON.stringify({ generations: summaries }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ArticleGenerations API] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
