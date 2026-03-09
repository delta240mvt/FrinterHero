import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles, contentGaps, articleGenerations, knowledgeEntries, knowledgeSources } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

async function sendDiscordNotification(title: string, slug: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📝 New article published: **${title}**\nhttps://frinterhere.app/blog/${slug}`,
    }),
  });
}

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id || '0', 10);
  if (isNaN(id) || id <= 0) {
    return new Response(JSON.stringify({ error: 'Invalid article id' }), { status: 400 });
  }

  let body: any = {};
  try { body = await request.json(); } catch {}

  try {
    const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
    if (!article) return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404 });
    if (article.status === 'published') {
      return new Response(JSON.stringify({ error: 'Article already published' }), { status: 409 });
    }

    const now = new Date();
    const publishedAt = body.publishedAt ? new Date(body.publishedAt) : now;

    // Update article status (atomic transaction via sequential updates)
    await db.update(articles)
      .set({ status: 'published', publishedAt, updatedAt: now })
      .where(eq(articles.id, id));

    // Update source gap status if applicable
    if (article.sourceGapId) {
      await db.update(contentGaps)
        .set({ status: 'acknowledged', acknowledgedAt: now })
        .where(eq(contentGaps.id, article.sourceGapId));
    }

    // Update article_generations record with publication timestamp and final content
    const [existingGen] = await db.select({ id: articleGenerations.id, originalContent: articleGenerations.originalContent })
      .from(articleGenerations)
      .where(eq(articleGenerations.articleId, id))
      .limit(1);

    if (existingGen) {
      const contentChanged = existingGen.originalContent !== article.content;
      await db.update(articleGenerations)
        .set({
          publicationTimestamp: now,
          finalContent: article.content,
          contentChanged,
        })
        .where(eq(articleGenerations.id, existingGen.id));
    }

    // Optional: Add published article to KB (content flywheel)
    const addToKB = body.add_to_kb !== false; // default true
    if (addToKB && article.content && article.title) {
      try {
        // Create/get KB source for published articles
        let [kbSource] = await db.select().from(knowledgeSources)
          .where(and(eq(knowledgeSources.sourceName, 'published-articles'), eq(knowledgeSources.status, 'active')))
          .limit(1);

        if (!kbSource) {
          [kbSource] = await db.insert(knowledgeSources).values({
            sourceType: 'internal_article',
            sourceName: 'published-articles',
            status: 'active',
          }).returning();
        }

        // Check for duplicate KB entry
        const [existingKB] = await db.select({ id: knowledgeEntries.id })
          .from(knowledgeEntries)
          .where(and(eq(knowledgeEntries.title, article.title), eq(knowledgeEntries.sourceId, kbSource.id)))
          .limit(1);

        if (!existingKB) {
          await db.insert(knowledgeEntries).values({
            type: 'published_article',
            title: article.title,
            content: article.content.replace(/<[^>]+>/g, '').slice(0, 5000), // strip HTML, limit size
            sourceUrl: `/blog/${article.slug}`,
            tags: article.tags || [],
            importanceScore: article.featured ? 85 : 75,
            sourceId: kbSource.id,
          });
        }
      } catch (kbErr) {
        console.error('[Publish] KB flywheel insertion failed (non-fatal):', { articleId: id, error: kbErr });
      }
    }

    // Send Discord notification (non-fatal)
    try {
      await sendDiscordNotification(article.title, article.slug);
    } catch (notifyErr) {
      console.error('[Publish] Discord notification failed (non-fatal):', { articleId: id, error: notifyErr });
    }

    return new Response(JSON.stringify({
      id,
      status: 'published',
      publishedAt: publishedAt.toISOString(),
      url: `/blog/${article.slug}`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Publish API] Error:', { timestamp: new Date().toISOString(), articleId: id, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
