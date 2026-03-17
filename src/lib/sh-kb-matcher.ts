import { db } from '@/db/client';
import { knowledgeEntries } from '@/db/schema';
import { or, ilike, desc } from 'drizzle-orm';

/**
 * Match knowledge-base entries relevant to the given text.
 *
 * Strategy:
 *  1. Split text on whitespace, keep words longer than 4 characters.
 *  2. Take the first 5 such words as keywords.
 *  3. Run ILIKE OR queries against knowledgeEntries.title and .content.
 *  4. Sort by importanceScore DESC and return up to `limit` results.
 */
export async function matchKbEntries(text: string, limit = 3): Promise<any[]> {
  const keywords = text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(w => w.length > 4)
    .slice(0, 5);

  if (keywords.length === 0) {
    // Fallback: return top entries by importance when no usable keywords
    return db
      .select()
      .from(knowledgeEntries)
      .orderBy(desc(knowledgeEntries.importanceScore))
      .limit(limit);
  }

  const conditions = keywords.flatMap(kw => [
    ilike(knowledgeEntries.title, `%${kw}%`),
    ilike(knowledgeEntries.content, `%${kw}%`),
  ]);

  return db
    .select()
    .from(knowledgeEntries)
    .where(or(...conditions))
    .orderBy(desc(knowledgeEntries.importanceScore))
    .limit(limit);
}
