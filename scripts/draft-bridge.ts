import { generateDraft } from './scripts/draft-generator';
import { db } from './src/db/client';
import { articles, articleGenerations } from './src/db/schema';

async function run() {
  const gapId = parseInt(process.env.GAP_ID || '0');
  const model = process.env.MODEL || 'anthropic/claude-sonnet-4-6';
  const notes = process.env.AUTHOR_NOTES || '';

  if (!gapId) {
    console.error("[DRAFT] ERROR: Missing GAP_ID");
    process.exit(1);
  }

  console.log(`[DRAFT] Starting job for Gap #${gapId} using ${model}...`);
  
  try {
    const result = await generateDraft({ gap_id: gapId, author_notes: notes, model });
    
    if (!result.success || !result.draft) {
      console.error("[DRAFT] FAILED: " + (result.error?.message || "Unknown validation error"));
      process.exit(1);
    }
    
    console.log("[DRAFT] Validation passed. Saving to DB...");
    const [article] = await db.insert(articles).values({
      slug: result.slug + "-" + Date.now(),
      title: result.draft.title,
      description: result.draft.description,
      content: result.htmlContent || '',
      tags: result.draft.tags,
      status: 'draft',
      readingTime: result.readingTime || 5,
      author: 'Przemysław Filipiak',
      sourceGapId: gapId,
      generatedByModel: model,
      generationTimestamp: new Date(),
    }).returning();

    await db.insert(articleGenerations).values({
      articleId: article.id,
      gapId: gapId,
      generatedByModel: model,
      generationPrompt: result.megaPrompt || '',
      originalContent: result.draft.content,
      authorNotes: notes,
      kbEntriesUsed: result.kbEntriesUsed || [],
      modelsQueried: [model],
      generationTimestamp: new Date(),
    });

    console.log("[DRAFT] SUCCESS: Article ID " + article.id);
    console.log("RESULT_JSON:" + JSON.stringify({ article_id: article.id, title: result.draft.title }));
  } catch (err) {
    console.error("[DRAFT] CRITICAL ERROR: " + err.message);
    process.exit(1);
  }
}

run();
