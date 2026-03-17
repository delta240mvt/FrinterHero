export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import { shContentBriefs, shSocialAccounts } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { loadSource } from '@/lib/sh-source-loader';
import { matchKbEntries } from '@/lib/sh-kb-matcher';

function auth(cookies: any) {
  return !!cookies.get('session')?.value;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

  const { sourceType, sourceId, targetAccountIds } = body ?? {};

  if (!sourceType || sourceId == null) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: sourceType, sourceId' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  if (!Array.isArray(targetAccountIds) || targetAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'targetAccountIds must be a non-empty array' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  const parsedAccountIds: number[] = targetAccountIds
    .map((id: any) => parseInt(String(id), 10))
    .filter((id: number) => !isNaN(id) && id > 0);

  if (parsedAccountIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No valid targetAccountIds provided' }),
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    // Load source once — shared snapshot for all 3 briefs
    const source = await loadSource(sourceType, Number(sourceId));
    if (!source) {
      return new Response(
        JSON.stringify({ error: `Source not found: ${sourceType} #${sourceId}` }),
        { status: 404, headers: JSON_HEADERS },
      );
    }

    // Resolve account platforms for targetPlatforms array
    const accounts = await db
      .select({ id: shSocialAccounts.id, platform: shSocialAccounts.platform })
      .from(shSocialAccounts)
      .where(inArray(shSocialAccounts.id, parsedAccountIds));

    const platformsForAccounts = [...new Set(accounts.map(a => a.platform))];

    // Match KB entries once — shared across all 3 briefs
    const kbMatches = await matchKbEntries(source.content, 3);
    const kbEntriesUsed = kbMatches.map((e: any) => e.id);

    // Three brief definitions for the repurpose chain
    const briefDefs = [
      {
        outputFormat: 'image' as const,
        templateSlug: 'retro-quote-card',
        suggestionPrompt: 'Create a retro-style quote card (1:1) highlighting the core insight.',
      },
      {
        outputFormat: 'image' as const,
        templateSlug: 'pain-point-story',
        suggestionPrompt: 'Create a story-format pain point visual (9:16) for Instagram/TikTok.',
      },
      {
        outputFormat: 'text' as const,
        templateSlug: null,
        suggestionPrompt: 'Write a short-form text post distilling the key message.',
      },
    ];

    // Insert all 3 briefs. repurposeGroupId = first brief's id (set after first insert).
    const createdIds: number[] = [];

    for (const def of briefDefs) {
      const [created] = await db
        .insert(shContentBriefs)
        .values({
          sourceType,
          sourceId:          Number(sourceId),
          sourceTitle:       source.title,
          sourceSnapshot:    source.content,
          suggestionPrompt:  def.suggestionPrompt,
          outputFormat:      def.outputFormat,
          targetPlatforms:   platformsForAccounts,
          targetAccountIds:  parsedAccountIds,
          kbEntriesUsed,
          brandVoiceUsed:    true,
          // repurposeGroupId is set to first brief's id; filled in after first insert
          repurposeGroupId:  createdIds.length > 0 ? createdIds[0] : null,
          status:            'draft',
        })
        .returning({ id: shContentBriefs.id });

      createdIds.push(created.id);
    }

    // Back-fill repurposeGroupId on first brief now that we know its id
    await db
      .update(shContentBriefs)
      .set({ repurposeGroupId: createdIds[0] })
      .where(inArray(shContentBriefs.id, [createdIds[0]]));

    return new Response(
      JSON.stringify({
        briefs:            createdIds,
        repurposeGroupId:  createdIds[0],
      }),
      { status: 201, headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[SocialHub Repurpose POST]', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
