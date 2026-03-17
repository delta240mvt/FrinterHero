export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/db/client';
import {
  articles,
  bcExtractedPainPoints,
  bcPainClusters,
  contentGaps,
  knowledgeEntries,
  redditExtractedGaps,
  ytExtractedGaps,
} from '@/db/schema';
import { ilike, desc, sql } from 'drizzle-orm';

// ── helpers ─────────────────────────────────────────────────────────────────

function makePreview(text: string | null | undefined, maxLen = 200): string {
  if (!text) return '';
  const t = text.trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen - 1) + '…';
}

type SourceRow = {
  sourceType: string;
  sourceId: number;
  title: string;
  preview: string;
  metadata: Record<string, any>;
};

// ── query functions per source type ─────────────────────────────────────────

async function queryArticles(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      description: articles.description,
      content: articles.content,
      status: articles.status,
      tags: articles.tags,
      author: articles.author,
      publishedAt: articles.publishedAt,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .where(search ? ilike(articles.title, `%${search}%`) : undefined)
    .orderBy(desc(articles.publishedAt))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'article',
    sourceId: r.id,
    title: r.title,
    preview: makePreview(r.description ?? r.content),
    metadata: { status: r.status, tags: r.tags, author: r.author, publishedAt: r.publishedAt },
  }));
}

async function queryPainPoints(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: bcExtractedPainPoints.id,
      painPointTitle: bcExtractedPainPoints.painPointTitle,
      painPointDescription: bcExtractedPainPoints.painPointDescription,
      category: bcExtractedPainPoints.category,
      emotionalIntensity: bcExtractedPainPoints.emotionalIntensity,
      customerLanguage: bcExtractedPainPoints.customerLanguage,
      vocData: bcExtractedPainPoints.vocData,
      status: bcExtractedPainPoints.status,
      projectId: bcExtractedPainPoints.projectId,
    })
    .from(bcExtractedPainPoints)
    .where(search ? ilike(bcExtractedPainPoints.painPointTitle, `%${search}%`) : undefined)
    .orderBy(desc(bcExtractedPainPoints.emotionalIntensity))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'pain_point',
    sourceId: r.id,
    title: r.painPointTitle,
    preview: makePreview(r.painPointDescription),
    metadata: {
      category: r.category,
      emotionalIntensity: r.emotionalIntensity,
      customerLanguage: r.customerLanguage,
      vocData: r.vocData,
      status: r.status,
      projectId: r.projectId,
    },
  }));
}

async function queryPainClusters(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: bcPainClusters.id,
      clusterTheme: bcPainClusters.clusterTheme,
      dominantEmotion: bcPainClusters.dominantEmotion,
      bestQuotes: bcPainClusters.bestQuotes,
      synthesizedProblemLabel: bcPainClusters.synthesizedProblemLabel,
      synthesizedSuccessVision: bcPainClusters.synthesizedSuccessVision,
      aggregateIntensity: bcPainClusters.aggregateIntensity,
      projectId: bcPainClusters.projectId,
      iterationId: bcPainClusters.iterationId,
      createdAt: bcPainClusters.createdAt,
    })
    .from(bcPainClusters)
    .where(search ? ilike(bcPainClusters.clusterTheme, `%${search}%`) : undefined)
    .orderBy(desc(bcPainClusters.createdAt))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'pain_cluster',
    sourceId: r.id,
    title: r.clusterTheme,
    preview: makePreview(r.synthesizedProblemLabel ?? r.clusterTheme),
    metadata: {
      dominantEmotion: r.dominantEmotion,
      bestQuotes: r.bestQuotes,
      synthesizedSuccessVision: r.synthesizedSuccessVision,
      aggregateIntensity: r.aggregateIntensity,
      projectId: r.projectId,
      iterationId: r.iterationId,
    },
  }));
}

async function queryContentGaps(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: contentGaps.id,
      gapTitle: contentGaps.gapTitle,
      gapDescription: contentGaps.gapDescription,
      suggestedAngle: contentGaps.suggestedAngle,
      confidenceScore: contentGaps.confidenceScore,
      status: contentGaps.status,
      relatedQueries: contentGaps.relatedQueries,
      sourceModels: contentGaps.sourceModels,
    })
    .from(contentGaps)
    .where(search ? ilike(contentGaps.gapTitle, `%${search}%`) : undefined)
    .orderBy(desc(contentGaps.confidenceScore))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'content_gap',
    sourceId: r.id,
    title: r.gapTitle,
    preview: makePreview(r.gapDescription),
    metadata: {
      confidenceScore: r.confidenceScore,
      status: r.status,
      suggestedAngle: r.suggestedAngle,
      relatedQueries: r.relatedQueries,
      sourceModels: r.sourceModels,
    },
  }));
}

async function queryKbEntries(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: knowledgeEntries.id,
      title: knowledgeEntries.title,
      content: knowledgeEntries.content,
      type: knowledgeEntries.type,
      importanceScore: knowledgeEntries.importanceScore,
      tags: knowledgeEntries.tags,
      projectName: knowledgeEntries.projectName,
      sourceUrl: knowledgeEntries.sourceUrl,
    })
    .from(knowledgeEntries)
    .where(search ? ilike(knowledgeEntries.title, `%${search}%`) : undefined)
    .orderBy(desc(knowledgeEntries.importanceScore))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'kb_entry',
    sourceId: r.id,
    title: r.title,
    preview: makePreview(r.content),
    metadata: {
      type: r.type,
      importanceScore: r.importanceScore,
      tags: r.tags,
      projectName: r.projectName,
      sourceUrl: r.sourceUrl,
    },
  }));
}

async function queryRedditGaps(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: redditExtractedGaps.id,
      painPointTitle: redditExtractedGaps.painPointTitle,
      painPointDescription: redditExtractedGaps.painPointDescription,
      vocabularyQuotes: redditExtractedGaps.vocabularyQuotes,
      category: redditExtractedGaps.category,
      emotionalIntensity: redditExtractedGaps.emotionalIntensity,
      frequency: redditExtractedGaps.frequency,
      status: redditExtractedGaps.status,
      scrapeRunId: redditExtractedGaps.scrapeRunId,
      createdAt: redditExtractedGaps.createdAt,
    })
    .from(redditExtractedGaps)
    .where(search ? ilike(redditExtractedGaps.painPointTitle, `%${search}%`) : undefined)
    .orderBy(desc(redditExtractedGaps.emotionalIntensity))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'reddit_gap',
    sourceId: r.id,
    title: r.painPointTitle,
    preview: makePreview(r.painPointDescription),
    metadata: {
      vocabularyQuotes: r.vocabularyQuotes,
      category: r.category,
      emotionalIntensity: r.emotionalIntensity,
      frequency: r.frequency,
      status: r.status,
      scrapeRunId: r.scrapeRunId,
    },
  }));
}

async function queryYtGaps(search: string): Promise<SourceRow[]> {
  const rows = await db
    .select({
      id: ytExtractedGaps.id,
      painPointTitle: ytExtractedGaps.painPointTitle,
      painPointDescription: ytExtractedGaps.painPointDescription,
      vocabularyQuotes: ytExtractedGaps.vocabularyQuotes,
      category: ytExtractedGaps.category,
      emotionalIntensity: ytExtractedGaps.emotionalIntensity,
      frequency: ytExtractedGaps.frequency,
      status: ytExtractedGaps.status,
      sourceVideoId: ytExtractedGaps.sourceVideoId,
      sourceVideoTitle: ytExtractedGaps.sourceVideoTitle,
      scrapeRunId: ytExtractedGaps.scrapeRunId,
      createdAt: ytExtractedGaps.createdAt,
    })
    .from(ytExtractedGaps)
    .where(search ? ilike(ytExtractedGaps.painPointTitle, `%${search}%`) : undefined)
    .orderBy(desc(ytExtractedGaps.emotionalIntensity))
    .limit(100);

  return rows.map(r => ({
    sourceType: 'yt_gap',
    sourceId: r.id,
    title: r.painPointTitle,
    preview: makePreview(r.painPointDescription),
    metadata: {
      vocabularyQuotes: r.vocabularyQuotes,
      category: r.category,
      emotionalIntensity: r.emotionalIntensity,
      frequency: r.frequency,
      status: r.status,
      sourceVideoId: r.sourceVideoId,
      sourceVideoTitle: r.sourceVideoTitle,
      scrapeRunId: r.scrapeRunId,
    },
  }));
}

// ── valid source types ───────────────────────────────────────────────────────

const VALID_TYPES = [
  'article',
  'pain_point',
  'pain_cluster',
  'content_gap',
  'kb_entry',
  'reddit_gap',
  'yt_gap',
] as const;

type ValidType = (typeof VALID_TYPES)[number];

const queryMap: Record<ValidType, (search: string) => Promise<SourceRow[]>> = {
  article: queryArticles,
  pain_point: queryPainPoints,
  pain_cluster: queryPainClusters,
  content_gap: queryContentGaps,
  kb_entry: queryKbEntries,
  reddit_gap: queryRedditGaps,
  yt_gap: queryYtGaps,
};

// ── GET handler ──────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ request, cookies }) => {
  const session = cookies.get('session');
  if (!session?.value) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get('type') || '';
  const search = url.searchParams.get('search') || '';

  // Validate type param if provided
  if (typeParam && !(VALID_TYPES as readonly string[]).includes(typeParam)) {
    return new Response(
      JSON.stringify({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }),
      { status: 400 },
    );
  }

  try {
    let results: SourceRow[];

    if (typeParam) {
      // Single-type query
      results = await queryMap[typeParam as ValidType](search);
    } else {
      // All types in parallel, then flatten + limit to 100 total
      const all = await Promise.all(VALID_TYPES.map(t => queryMap[t](search)));
      results = all.flat().slice(0, 100);
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[SocialHub Sources API GET] Error:', { timestamp: new Date().toISOString(), error: err });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
