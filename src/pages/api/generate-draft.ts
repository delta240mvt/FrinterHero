import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { articles, contentGaps, articleGenerations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateDraft } from '../../../scripts/draft-generator';

const VALID_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-4.1-mini',
  'perplexity/llama-3.1-sonar-small-128k-online',
  'google/gemini-3.1-pro-preview',
];

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { gap_id, author_notes, model } = body;

  if (!gap_id || typeof gap_id !== 'number') {
    return new Response(JSON.stringify({ error: 'gap_id must be a number' }), { status: 400 });
  }
  if (!model || !VALID_MODELS.includes(model)) {
    return new Response(JSON.stringify({ error: `model must be one of: ${VALID_MODELS.join(', ')}` }), { status: 400 });
  }

  try {
    // Verify gap exists
    const [gap] = await db.select().from(contentGaps).where(eq(contentGaps.id, gap_id)).limit(1);
    if (!gap) {
      return new Response(JSON.stringify({ error: 'Gap not found', code: 'INVALID_GAP' }), { status: 400 });
    }

    console.log(`[GenerateDraft API] Generating draft for gap ${gap_id} with ${model}`);

    // Call draft generator
    const result = await generateDraft({ gap_id, author_notes: author_notes || '', model });

    if (!result.success || !result.draft) {
      return new Response(JSON.stringify({
        error: result.error?.message || 'Generation failed',
        code: result.error?.code,
        retry_allowed: result.error?.retry_allowed ?? true,
        details: result.error?.details,
      }), { status: 422 });
    }

    const now = new Date();
    const uniqueSlug = `${result.slug}-${Date.now()}`;

    // Insert article
    const [article] = await db.insert(articles).values({
      slug: uniqueSlug,
      title: result.draft.title,
      description: result.draft.description,
      content: result.htmlContent || '',
      tags: result.draft.tags,
      featured: false,
      status: 'draft',
      readingTime: result.readingTime || 5,
      author: 'Przemysław Filipiak',
      sourceGapId: gap_id,
      generatedByModel: model,
      generationTimestamp: now,
    }).returning();

    // Create audit record
    await db.insert(articleGenerations).values({
      articleId: article.id,
      gapId: gap_id,
      generatedByModel: model,
      generationPrompt: result.megaPrompt || '',
      originalContent: result.draft.content, // store raw markdown as original
      authorNotes: author_notes || '',
      kbEntriesUsed: result.kbEntriesUsed || [],
      modelsQueried: [model],
      generationTimestamp: now,
    });

    console.log(`[GenerateDraft API] Created article ${article.id} from gap ${gap_id}`);

    return new Response(JSON.stringify({
      article_id: article.id,
      gap_id,
      status: 'draft',
      title: result.draft.title,
      slug: uniqueSlug,
      description: result.draft.description,
      content: result.htmlContent || '',
      tags: result.draft.tags,
      reading_time: result.readingTime,
      generated_by_model: model,
      generation_timestamp: now.toISOString(),
      kb_entries_used: result.kbEntriesUsed || [],
      featured: false,
      tone_alignment_score: result.validation?.metrics.toneAlignmentScore,
      word_count: result.validation?.metrics.wordCount,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[GenerateDraft API] Error:', { timestamp: new Date().toISOString(), gap_id, model, error: err });
    return new Response(JSON.stringify({ error: 'Internal server error', retry_allowed: true }), { status: 500 });
  }
};
