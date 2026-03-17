export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs, shGeneratedCopy } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { loadSource } from '@/lib/sh-source-loader';
import { matchKbEntries } from '@/lib/sh-kb-matcher';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  try {
    const status = url.searchParams.get('status') || '';
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const conditions = status ? [eq(shContentBriefs.status, status)] : [];

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch briefs with total count
    const [briefs, countResult] = await Promise.all([
      db
        .select()
        .from(shContentBriefs)
        .where(whereClause)
        .orderBy(desc(shContentBriefs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(shContentBriefs)
        .where(whereClause),
    ]);

    const total = countResult[0]?.total ?? 0;

    // Fetch first generated copy for each brief (variant_index = 0 or min)
    const briefIds = briefs.map(b => b.id);
    let firstCopyByBriefId: Record<number, typeof shGeneratedCopy.$inferSelect> = {};

    if (briefIds.length > 0) {
      // Fetch all copy rows for these briefs ordered by variantIndex asc, then pick first per brief
      const copies = await db
        .select()
        .from(shGeneratedCopy)
        .where(inArray(shGeneratedCopy.briefId, briefIds))
        .orderBy(shGeneratedCopy.briefId, shGeneratedCopy.variantIndex);

      for (const copy of copies) {
        if (!(copy.briefId in firstCopyByBriefId)) {
          firstCopyByBriefId[copy.briefId] = copy;
        }
      }
    }

    const results = briefs.map(brief => ({
      ...brief,
      firstGeneratedCopy: firstCopyByBriefId[brief.id] ?? null,
    }));

    return new Response(
      JSON.stringify({ results, total, offset, limit }),
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Briefs GET]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!auth(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS });
  }

  const { sourceType, sourceId, suggestionPrompt, outputFormat, targetPlatforms, targetAccountIds } = body;

  if (!sourceType || sourceId == null || !outputFormat) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sourceType, sourceId, outputFormat' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (!Array.isArray(targetPlatforms) || !Array.isArray(targetAccountIds)) {
    return new Response(
      JSON.stringify({ error: 'targetPlatforms and targetAccountIds must be arrays' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    // Load source data
    const source = await loadSource(sourceType, Number(sourceId));
    if (!source) {
      return new Response(
        JSON.stringify({ error: `Source not found: ${sourceType} #${sourceId}` }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    // Match relevant KB entries
    const kbMatches = await matchKbEntries(source.content, 3);
    const kbEntriesUsed = kbMatches.map((e: any) => e.id);

    // Insert brief
    const [created] = await db
      .insert(shContentBriefs)
      .values({
        sourceType,
        sourceId: Number(sourceId),
        sourceTitle: source.title,
        sourceSnapshot: source.content,
        suggestionPrompt: suggestionPrompt ?? null,
        outputFormat,
        targetPlatforms,
        targetAccountIds,
        kbEntriesUsed,
        brandVoiceUsed: true,
        status: 'draft',
      })
      .returning();

    return new Response(JSON.stringify(created), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[SocialHub Briefs POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
