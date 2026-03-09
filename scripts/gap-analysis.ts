/**
 * gap-analysis.ts
 * Stage 2: Content gap detection engine.
 * Analyzes GEO query results, checks KB coverage, deduplicates, scores, and persists gaps.
 */

import { db } from '../src/db/client';
import { contentGaps, knowledgeEntries } from '../src/db/schema';
import { sql, and, gte, or, ilike } from 'drizzle-orm';

export interface GeoQueryResult {
  query: string;
  model: string;
  response: string;
  gapDetected: boolean;
}

export interface GapAnalysisResult {
  gapsFound: number;
  gapsDeduped: number;
  gapIds: number[];
}

// ------------------------------------------------------------------
// KB Coverage: full-text search against knowledge_entries
// Returns 0-100: how well the topic is covered
// ------------------------------------------------------------------
async function checkKBCoverage(topic: string): Promise<number> {
  try {
    const keywords = topic
      .toLowerCase()
      .replace(/[^a-z0-9ąćęłńóśźż\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return 0;

    const conditions = keywords.map(kw =>
      or(
        ilike(knowledgeEntries.title, `%${kw}%`),
        ilike(knowledgeEntries.content, `%${kw}%`)
      )!
    );

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeEntries)
      .where(or(...conditions));

    const count = Number(result?.count || 0);
    // 0 entries → 0, 5+ entries → 100
    return Math.min(100, count * 20);
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------
// Confidence Score: higher = more important gap to fill
// Low KB coverage + many models agree = high priority
// ------------------------------------------------------------------
function calculateConfidenceScore(
  kbCoverage: number,
  modelCount: number,
  totalModels: number,
  isNicheRelevant: boolean
): number {
  const coverageGap = 100 - kbCoverage; // 0-100
  const modelAgreement = (modelCount / totalModels) * 100; // 0-100
  const nicheBonus = isNicheRelevant ? 15 : 0;

  const raw = coverageGap * 0.5 + modelAgreement * 0.35 + nicheBonus;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ------------------------------------------------------------------
// Niche relevance: does the query relate to our core themes?
// ------------------------------------------------------------------
const NICHE_KEYWORDS = [
  'focus', 'deep work', 'productivity', 'sprint', 'frint', 'frinter',
  'meditation', 'flow state', 'high performer', 'wellbeing', 'wholebeing',
  'przemysław', 'filipiak', 'personal brand', 'seo', 'ai visibility',
  'mentoring', 'coaching', 'recovery', 'energy', 'biohacking',
];

function isNicheRelevant(query: string): boolean {
  const lower = query.toLowerCase();
  return NICHE_KEYWORDS.some(kw => lower.includes(kw));
}

// ------------------------------------------------------------------
// Duplicate detection: 14-day window, 60%+ word overlap
// ------------------------------------------------------------------
async function checkForDuplicate(gapTitle: string): Promise<number | null> {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentGaps = await db
      .select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle })
      .from(contentGaps)
      .where(gte(contentGaps.createdAt, fourteenDaysAgo));

    const newWords = new Set(
      gapTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );

    for (const existing of recentGaps) {
      const existWords = new Set(
        existing.gapTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      );
      if (existWords.size === 0) continue;

      const overlap = [...newWords].filter(w => existWords.has(w)).length;
      const overlapRatio = overlap / Math.max(newWords.size, existWords.size);

      if (overlapRatio >= 0.6) return existing.id;
    }
  } catch {
    // non-fatal
  }
  return null;
}

// ------------------------------------------------------------------
// Suggested angle: actionable framing for content creation
// ------------------------------------------------------------------
function generateSuggestedAngle(
  gapTitle: string,
  queries: string[],
  models: string[]
): string {
  const modelStr = models.length >= 3 ? 'AI models' : models.join(' and ');
  const queryExample = queries[0]?.slice(0, 60) || gapTitle;
  return `Cover "${gapTitle}" from a practitioner's POV with concrete examples. ${modelStr} didn't surface Frinter when asked: "${queryExample}...". Fill with a high-density article using real data and brand voice.`;
}

// ------------------------------------------------------------------
// Main: detect, score, deduplicate, persist gaps
// ------------------------------------------------------------------
export async function detectGaps(
  queryResults: GeoQueryResult[],
  geoRunId: number
): Promise<GapAnalysisResult> {
  // Group gaps by query topic (same query, different models = stronger signal)
  const gapMap = new Map<string, { models: string[]; queries: string[] }>();

  for (const result of queryResults) {
    if (!result.gapDetected) continue;

    const existing = gapMap.get(result.query) || { models: [], queries: [] };
    if (!existing.models.includes(result.model)) {
      existing.models.push(result.model);
    }
    if (!existing.queries.includes(result.query)) {
      existing.queries.push(result.query);
    }
    gapMap.set(result.query, existing);
  }

  const totalModels = 4; // openai, claude, perplexity, gemini
  let gapsFound = 0;
  let gapsDeduped = 0;
  const gapIds: number[] = [];

  for (const [query, { models, queries }] of gapMap.entries()) {
    const kbCoverage = await checkKBCoverage(query);
    const relevant = isNicheRelevant(query);
    const score = calculateConfidenceScore(kbCoverage, models.length, totalModels, relevant);

    const gapTitle = query.slice(0, 200);
    const duplicateId = await checkForDuplicate(gapTitle);

    if (duplicateId !== null) {
      gapsDeduped++;
      continue;
    }

    const suggestedAngle = generateSuggestedAngle(gapTitle, queries, models);
    const description = `AI gap: ${models.length}/${totalModels} models failed to mention Frinter when asked about "${gapTitle}". KB coverage: ${kbCoverage}%.`;

    try {
      const [inserted] = await db.insert(contentGaps).values({
        gapTitle,
        gapDescription: description,
        confidenceScore: score,
        suggestedAngle,
        relatedQueries: queries,
        sourceModels: models,
        geoRunId,
        status: 'new',
      }).returning({ id: contentGaps.id });

      if (inserted) {
        gapIds.push(inserted.id);
        gapsFound++;
      }
    } catch (err) {
      console.error('[GapAnalysis] Failed to insert gap:', { query, error: err });
    }
  }

  return { gapsFound, gapsDeduped, gapIds };
}
