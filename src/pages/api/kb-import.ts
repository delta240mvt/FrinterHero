import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { knowledgeEntries, knowledgeSources } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { importMarkdownFiles } from '@/utils/kb-importer';

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files: Array<{ filename: string; content: string }> = [];

    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.name.endsWith('.md')) {
        const content = await value.text();
        files.push({ filename: value.name, content });
      }
    }

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: 'No .md files provided' }), { status: 400 });
    }

    const { valid, errors } = importMarkdownFiles(files);

    // Create knowledge source record for this batch
    const [source] = await db.insert(knowledgeSources).values({
      sourceType: 'imported_markdown',
      sourceName: `batch-import-${Date.now()}`,
      status: 'active',
    }).returning();

    let successCount = 0;
    const failedEntries: Array<{ filename: string; reason: string }> = [
      ...errors.map(e => ({ filename: e.filename, reason: e.errors.join('; ') })),
    ];

    for (const entry of valid) {
      try {
        const existing = await db.select({ id: knowledgeEntries.id })
          .from(knowledgeEntries)
          .where(and(eq(knowledgeEntries.title, entry.title), eq(knowledgeEntries.sourceId, source.id)))
          .limit(1);

        if (existing.length > 0) {
          failedEntries.push({ filename: entry.filename, reason: 'Duplicate entry (same title + source)' });
          continue;
        }

        await db.insert(knowledgeEntries).values({
          type: entry.type,
          title: entry.title,
          content: entry.content,
          tags: entry.tags,
          importanceScore: entry.importanceScore,
          sourceUrl: entry.sourceUrl || null,
          sourceId: source.id,
        });
        successCount++;
      } catch (err) {
        console.error('[KB Import] Failed to insert entry:', { filename: entry.filename, error: err });
        failedEntries.push({ filename: entry.filename, reason: 'Database insertion error' });
      }
    }

    return new Response(JSON.stringify({
      total_files: files.length,
      successful: successCount,
      failed: failedEntries.length,
      source_id: source.id,
      errors: failedEntries,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[KB Import API] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
