import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import {
  articles,
  bcExtractedPainPoints,
  bcPainClusters,
  contentGaps,
  knowledgeEntries,
  redditExtractedGaps,
  ytExtractedGaps,
} from '@/db/schema';

export interface ShSourceData {
  sourceType: string;
  sourceId: number;
  title: string;
  content: string;      // full text for AI prompt
  preview: string;      // short excerpt for UI
  metadata: Record<string, any>; // extra fields (emotion, intensity, etc.)
}

function makePreview(text: string, maxLen = 200): string {
  if (!text) return '';
  const trimmed = text.trim();
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen - 1) + '…';
}

export async function loadSource(
  sourceType: string,
  sourceId: number,
): Promise<ShSourceData | null> {
  switch (sourceType) {
    case 'article': {
      const [row] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [row.title, row.description, row.content]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.title,
        content,
        preview: makePreview(row.description ?? row.content),
        metadata: {
          status: row.status,
          tags: row.tags,
          author: row.author,
          publishedAt: row.publishedAt,
          slug: row.slug,
        },
      };
    }

    case 'pain_point': {
      const [row] = await db
        .select()
        .from(bcExtractedPainPoints)
        .where(eq(bcExtractedPainPoints.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [
        row.painPointTitle,
        row.painPointDescription,
        row.customerLanguage,
        row.vocData
          ? `Problem: ${row.vocData.problemLabel}. Emotion: ${row.vocData.dominantEmotion}. Success vision: ${row.vocData.successVision}.`
          : null,
        row.vocabularyQuotes?.length
          ? `Quotes: ${row.vocabularyQuotes.join(' | ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.painPointTitle,
        content,
        preview: makePreview(row.painPointDescription),
        metadata: {
          category: row.category,
          emotionalIntensity: row.emotionalIntensity,
          frequency: row.frequency,
          status: row.status,
          projectId: row.projectId,
          vocData: row.vocData,
        },
      };
    }

    case 'pain_cluster': {
      const [row] = await db
        .select()
        .from(bcPainClusters)
        .where(eq(bcPainClusters.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [
        row.clusterTheme,
        row.synthesizedProblemLabel,
        row.synthesizedSuccessVision,
        row.dominantEmotion ? `Dominant emotion: ${row.dominantEmotion}` : null,
        row.bestQuotes?.length ? `Best quotes: ${row.bestQuotes.join(' | ')}` : null,
        row.failedSolutions?.length
          ? `Failed solutions: ${row.failedSolutions.join(', ')}`
          : null,
        row.triggerMoments?.length
          ? `Trigger moments: ${row.triggerMoments.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.clusterTheme,
        content,
        preview: makePreview(row.synthesizedProblemLabel ?? row.clusterTheme),
        metadata: {
          dominantEmotion: row.dominantEmotion,
          aggregateIntensity: row.aggregateIntensity,
          painPointIds: row.painPointIds,
          projectId: row.projectId,
          iterationId: row.iterationId,
        },
      };
    }

    case 'content_gap': {
      const [row] = await db
        .select()
        .from(contentGaps)
        .where(eq(contentGaps.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [
        row.gapTitle,
        row.gapDescription,
        row.suggestedAngle ? `Suggested angle: ${row.suggestedAngle}` : null,
        row.authorNotes ? `Author notes: ${row.authorNotes}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.gapTitle,
        content,
        preview: makePreview(row.gapDescription),
        metadata: {
          confidenceScore: row.confidenceScore,
          status: row.status,
          suggestedAngle: row.suggestedAngle,
          relatedQueries: row.relatedQueries,
          sourceModels: row.sourceModels,
        },
      };
    }

    case 'kb_entry': {
      const [row] = await db
        .select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.id, sourceId))
        .limit(1);
      if (!row) return null;
      return {
        sourceType,
        sourceId,
        title: row.title,
        content: row.content,
        preview: makePreview(row.content),
        metadata: {
          type: row.type,
          importanceScore: row.importanceScore,
          tags: row.tags,
          projectName: row.projectName,
          sourceUrl: row.sourceUrl,
        },
      };
    }

    case 'reddit_gap': {
      const [row] = await db
        .select()
        .from(redditExtractedGaps)
        .where(eq(redditExtractedGaps.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [
        row.painPointTitle,
        row.painPointDescription,
        row.vocabularyQuotes?.length
          ? `Vocabulary quotes: ${row.vocabularyQuotes.join(' | ')}`
          : null,
        row.suggestedArticleAngle
          ? `Suggested angle: ${row.suggestedArticleAngle}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.painPointTitle,
        content,
        preview: makePreview(row.painPointDescription),
        metadata: {
          category: row.category,
          emotionalIntensity: row.emotionalIntensity,
          frequency: row.frequency,
          status: row.status,
          scrapeRunId: row.scrapeRunId,
        },
      };
    }

    case 'yt_gap': {
      const [row] = await db
        .select()
        .from(ytExtractedGaps)
        .where(eq(ytExtractedGaps.id, sourceId))
        .limit(1);
      if (!row) return null;
      const content = [
        row.painPointTitle,
        row.painPointDescription,
        row.vocabularyQuotes?.length
          ? `Vocabulary quotes: ${row.vocabularyQuotes.join(' | ')}`
          : null,
        row.sourceVideoTitle ? `Source video: ${row.sourceVideoTitle}` : null,
        row.suggestedArticleAngle
          ? `Suggested angle: ${row.suggestedArticleAngle}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        sourceType,
        sourceId,
        title: row.painPointTitle,
        content,
        preview: makePreview(row.painPointDescription),
        metadata: {
          category: row.category,
          emotionalIntensity: row.emotionalIntensity,
          frequency: row.frequency,
          status: row.status,
          sourceVideoId: row.sourceVideoId,
          sourceVideoTitle: row.sourceVideoTitle,
          scrapeRunId: row.scrapeRunId,
        },
      };
    }

    default:
      return null;
  }
}

export function formatSourceForPrompt(source: ShSourceData): string {
  const lines: string[] = [
    `[SOURCE: ${source.sourceType.toUpperCase()} #${source.sourceId}]`,
    `Title: ${source.title}`,
  ];

  // Append relevant metadata lines
  const meta = source.metadata;
  if (meta.category) lines.push(`Category: ${meta.category}`);
  if (meta.emotionalIntensity != null) lines.push(`Emotional intensity: ${meta.emotionalIntensity}/10`);
  if (meta.dominantEmotion) lines.push(`Dominant emotion: ${meta.dominantEmotion}`);
  if (meta.confidenceScore != null) lines.push(`Confidence score: ${meta.confidenceScore}/100`);
  if (meta.importanceScore != null) lines.push(`Importance score: ${meta.importanceScore}/100`);
  if (meta.tags?.length) lines.push(`Tags: ${(meta.tags as string[]).join(', ')}`);
  if (meta.author) lines.push(`Author: ${meta.author}`);
  if (meta.status) lines.push(`Status: ${meta.status}`);

  lines.push('', 'Content:', source.content);

  return lines.join('\n');
}
