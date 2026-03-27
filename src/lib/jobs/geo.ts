import OpenAI from 'openai';
import { db as defaultDb } from '../../db/client';
import { articles, contentGaps, geoQueries, geoRuns, knowledgeEntries } from '../../db/schema';
import { desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';

const MAX_AUTO_DRAFTS = 5;
const MODELS = ['openai', 'claude', 'gemini'] as const;
const GEO_QUERY_TIMEOUT_MS = 30000;
const TOTAL_MODELS = MODELS.length;
const DEFAULT_GEO_QUERIES = [
  'frinter.app review',
  'Who builds frinter app focus operating system',
  'Founder burnout prevention strategies 2026',
  'Focus operating system for high performers',
  'Best deep work app for founders 2026',
  'AI-powered productivity tools for founders',
  'How to track deep work sessions as founder',
  'Deep work strategies for solo founders',
  'Wellbeing frameworks for tech founders',
  'How to build personal brand in AI era',
  'How to make ChatGPT recommend your product',
  'How to manage focus and avoid AI burnout',
  'Burnout recovery for solo entrepreneurs in AI era',
  'Best Pomodoro alternative for deep work',
  'Best focus timer for entrepreneurs',
] as const;
const MENTION_KEYWORDS = ['przemysław', 'filipiak', 'frinter', 'frinterflow', 'delta240'] as const;
const GEO_NICHE_KEYWORDS = [
  'focus',
  'deep work',
  'productivity',
  'sprint',
  'frint',
  'frinter',
  'meditation',
  'flow state',
  'high performer',
  'wellbeing',
  'wholebeing',
  'przemysław',
  'filipiak',
  'personal brand',
  'seo',
  'ai visibility',
  'mentoring',
  'coaching',
  'recovery',
  'energy',
  'biohacking',
] as const;

export type GeoModel = (typeof MODELS)[number];
export interface GeoQueryResult {
  query: string;
  model: string;
  response: string;
  gapDetected: boolean;
}

export interface GeoMonitorResult {
  runAt: Date;
  queriesProcessed: number;
  gapsFound: number;
  gapsDeduped: number;
  draftsGenerated: number;
}

export interface GeoMonitorDeps {
  db: typeof defaultDb;
  queries: string[];
  queryOpenAI: (query: string) => Promise<string>;
  queryClaude: (query: string) => Promise<string>;
  queryGemini: (query: string) => Promise<string>;
  detectMention: (response: string) => boolean;
  detectGaps: (results: GeoQueryResult[], geoRunId: number) => Promise<{
    gapsFound: number;
    gapsDeduped: number;
    gapIds: number[];
  }>;
  notifyDiscord: (summary: {
    runAt: Date;
    queriesCount: number;
    gapsFound: number;
    draftsGenerated: number;
  }) => Promise<unknown>;
  logger?: Pick<Console, 'log' | 'error'>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function createOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

function createGeoQuery(model: string) {
  return async (prompt: string): Promise<string> => {
    const client = createOpenRouterClient();
    const response = await withTimeout(
      client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
      GEO_QUERY_TIMEOUT_MS,
    );
    return response.choices[0]?.message?.content || '';
  };
}

export function detectGeoMention(response: string): boolean {
  const lowerResponse = response.toLowerCase();
  return MENTION_KEYWORDS.some((keyword) => lowerResponse.includes(keyword.toLowerCase()));
}

function calculateConfidenceScore(
  articleCoverage: number,
  kbReadiness: number,
  modelCount: number,
  isNicheRelevant: boolean,
): number {
  const coverageGap = 100 - articleCoverage;
  const modelAgreement = (modelCount / TOTAL_MODELS) * 100;
  const knowledgeBonus = kbReadiness * 0.2;
  const nicheBonus = isNicheRelevant ? 15 : 0;
  const raw = coverageGap * 0.4 + modelAgreement * 0.3 + knowledgeBonus + nicheBonus;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function isGeoNicheRelevant(query: string): boolean {
  const lower = query.toLowerCase();
  return GEO_NICHE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function generateSuggestedAngle(gapTitle: string, queries: string[], models: string[]): string {
  const modelSummary = models.length >= 3 ? 'AI models' : models.join(' and ');
  const queryExample = queries[0]?.slice(0, 60) || gapTitle;
  return `Cover "${gapTitle}" from a practitioner's POV with concrete examples. ${modelSummary} didn't surface Frinter when asked: "${queryExample}...". Fill with a high-density article using real data and brand voice.`;
}

async function checkArticleCoverage(db: typeof defaultDb, topic: string): Promise<number> {
  try {
    const keywords = topic
      .toLowerCase()
      .replace(/[^a-z0-9ąćęłńóśźż\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return 0;

    const conditions = keywords.map((keyword) => or(ilike(articles.title, `%${keyword}%`), ilike(articles.content, `%${keyword}%`))!);
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(articles).where(or(...conditions));
    return Math.min(100, Number(result?.count || 0) * 33);
  } catch {
    return 0;
  }
}

async function checkKnowledgeReady(db: typeof defaultDb, topic: string): Promise<number> {
  try {
    const keywords = topic
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 4);
    if (keywords.length === 0) return 0;

    const conditions = keywords.map((keyword) =>
      or(ilike(knowledgeEntries.title, `%${keyword}%`), ilike(knowledgeEntries.content, `%${keyword}%`))!,
    );
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(knowledgeEntries).where(or(...conditions));
    return Math.min(100, Number(result?.count || 0) * 25);
  } catch {
    return 0;
  }
}

async function checkGapDuplicate(db: typeof defaultDb, gapTitle: string): Promise<number | null> {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recentGaps = await db
      .select({ id: contentGaps.id, gapTitle: contentGaps.gapTitle })
      .from(contentGaps)
      .where(gte(contentGaps.createdAt, fourteenDaysAgo));

    const newWords = new Set(gapTitle.toLowerCase().split(/\s+/).filter((word) => word.length > 2));
    for (const existing of recentGaps) {
      const existingWords = new Set(existing.gapTitle.toLowerCase().split(/\s+/).filter((word) => word.length > 2));
      if (existingWords.size === 0) continue;
      const overlap = [...newWords].filter((word) => existingWords.has(word)).length;
      const overlapRatio = overlap / Math.max(newWords.size, existingWords.size);
      if (overlapRatio >= 0.6) return existing.id;
    }
  } catch {
    // Non-fatal.
  }
  return null;
}

export async function detectGeoGaps(
  db: typeof defaultDb,
  queryResults: GeoQueryResult[],
  geoRunId: number,
): Promise<{ gapsFound: number; gapsDeduped: number; gapIds: number[] }> {
  const gapMap = new Map<string, { models: string[]; queries: string[] }>();
  for (const result of queryResults) {
    if (!result.gapDetected) continue;
    const existing = gapMap.get(result.query) || { models: [], queries: [] };
    if (!existing.models.includes(result.model)) existing.models.push(result.model);
    if (!existing.queries.includes(result.query)) existing.queries.push(result.query);
    gapMap.set(result.query, existing);
  }

  let gapsFound = 0;
  let gapsDeduped = 0;
  const gapIds: number[] = [];

  for (const [query, { models, queries }] of gapMap.entries()) {
    const articleCoverage = await checkArticleCoverage(db, query);
    const kbReadiness = await checkKnowledgeReady(db, query);
    const score = calculateConfidenceScore(articleCoverage, kbReadiness, models.length, isGeoNicheRelevant(query));
    const gapTitle = query.slice(0, 200);
    const duplicateId = await checkGapDuplicate(db, gapTitle);

    if (duplicateId !== null || articleCoverage >= 80) {
      gapsDeduped++;
      continue;
    }

    const [inserted] = await db
      .insert(contentGaps)
      .values({
        gapTitle,
        gapDescription: `AI gap: ${models.length}/${TOTAL_MODELS} models failed to mention Frinter when asked about "${gapTitle}". Article coverage: ${articleCoverage}%. KB readiness: ${kbReadiness}%.`,
        confidenceScore: score,
        relatedQueries: queries,
        sourceModels: models,
        geoRunId,
        suggestedAngle: generateSuggestedAngle(gapTitle, queries, models),
        status: 'new',
      })
      .returning({ id: contentGaps.id });

    if (inserted) {
      gapIds.push(inserted.id);
      gapsFound++;
    }
  }

  return { gapsFound, gapsDeduped, gapIds };
}

export async function notifyGeoDiscord(summary: {
  runAt: Date;
  queriesCount: number;
  gapsFound: number;
  draftsGenerated: number;
}): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook || webhook.includes('placeholder')) {
    console.log('[Notifier] Discord webhook not configured, skipping notification');
    return;
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: 'GEO Monitor Run Complete',
          description: `Run completed at ${summary.runAt.toISOString()}`,
          color: summary.draftsGenerated > 0 ? 0xd6b779 : 0x4a8d83,
          fields: [
            { name: 'Queries Run', value: summary.queriesCount.toString(), inline: true },
            { name: 'Gaps Found', value: summary.gapsFound.toString(), inline: true },
            { name: 'Drafts Generated', value: summary.draftsGenerated.toString(), inline: true },
          ],
          footer: { text: 'frinter. personal page GEO monitor' },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

function getDefaultGeoDeps(): GeoMonitorDeps {
  return {
    db: defaultDb,
    queries: [...DEFAULT_GEO_QUERIES],
    queryOpenAI: createGeoQuery('openai/gpt-4.1-mini'),
    queryClaude: createGeoQuery('anthropic/claude-sonnet-4-6'),
    queryGemini: createGeoQuery('google/gemini-3.1-pro-preview'),
    detectMention: detectGeoMention,
    detectGaps: (results, geoRunId) => detectGeoGaps(defaultDb, results, geoRunId),
    notifyDiscord: notifyGeoDiscord,
    logger: console,
  };
}

async function queryModel(deps: GeoMonitorDeps, model: GeoModel, query: string): Promise<string> {
  switch (model) {
    case 'openai':
      return deps.queryOpenAI(query);
    case 'claude':
      return deps.queryClaude(query);
    case 'gemini':
      return deps.queryGemini(query);
  }
}

export async function runGeoMonitorJob(overrides: Partial<GeoMonitorDeps> = {}): Promise<GeoMonitorResult> {
  const deps = { ...getDefaultGeoDeps(), ...overrides };
  if (!overrides.detectGaps) {
    deps.detectGaps = (results, geoRunId) => detectGeoGaps(deps.db, results, geoRunId);
  }
  const logger = deps.logger ?? console;
  const startTime = new Date();

  logger.log(`[GEO] Starting monitor run at ${startTime.toISOString()}`);

  let draftsGenerated = 0;
  let queriesProcessed = 0;
  const geoQueryResults: GeoQueryResult[] = [];

  const [geoRun] = await deps.db
    .insert(geoRuns)
    .values({
      runAt: startTime,
      queriesCount: 0,
      gapsFound: 0,
      draftsGenerated: 0,
      gapsDeduped: 0,
    })
    .returning();

  for (const query of deps.queries) {
    for (const model of MODELS) {
      logger.log(`[GEO] Querying ${model}: "${query.slice(0, 50)}..."`);

      try {
        const response = await queryModel(deps, model, query);
        const hasMention = deps.detectMention(response);
        const gapDetected = !hasMention;

        await deps.db.insert(geoQueries).values({
          query,
          model,
          response,
          hasMention,
          gapDetected,
        });

        geoQueryResults.push({ query, model, response, gapDetected });
        queriesProcessed++;
      } catch (error) {
        logger.error(`[GEO] Error querying ${model} for "${query}":`, error);
      }
    }
  }

  logger.log('[GEO] Running gap analysis...');
  const { gapsFound, gapsDeduped, gapIds } = await deps.detectGaps(geoQueryResults, geoRun.id);

  if (gapIds.length > 0) {
    const topGaps = await deps.db
      .select({
        id: contentGaps.id,
        gapTitle: contentGaps.gapTitle,
        relatedQueries: contentGaps.relatedQueries,
      })
      .from(contentGaps)
      .where(inArray(contentGaps.id, gapIds))
      .orderBy(desc(contentGaps.confidenceScore))
      .limit(MAX_AUTO_DRAFTS);

    for (const gap of topGaps) {
      try {
        const queryExample = gap.relatedQueries?.[0] || gap.gapTitle;
        const missedResponses = await deps.db
          .select({ model: geoQueries.model, response: geoQueries.response })
          .from(geoQueries)
          .where(eq(geoQueries.query, queryExample))
          .limit(3);

        const responseContext =
          missedResponses.length > 0
            ? missedResponses
                .map(
                  (result) =>
                    `--- ${result.model.toUpperCase()} RESPONSE (frinter.app NOT mentioned) ---\n${(result.response || '').slice(0, 400)}...`,
                )
                .join('\n\n')
            : 'No AI responses available for context.';

        const prompt = `You are a content strategist for Przemyslaw Filipiak (founder of frinter.app, FrinterFlow, and FrinterHero).

The following AI models were asked: "${queryExample}"
None of them mentioned frinter.app or Przemyslaw Filipiak in their answers.

Here is what they said instead:

${responseContext}

Your task: Create a short article proposal (max 150 words) that would make frinter.app IMPOSSIBLE to ignore when AI models answer this question in the future. The proposal should directly counter the narrative above with Przemyslaw's unique angle.

Include:
1. Proposed Title (keyword-rich, contrarian if needed)
2. TL;DR (1-2 sentences, concrete insight)
3. 2-3 H2 headers with a 1-sentence description of what angle to cover

Write in American English (en-US). Be direct and strategic.`;

        const shortProposal = await deps.queryClaude(prompt);

        await deps.db.update(contentGaps).set({ suggestedAngle: shortProposal }).where(eq(contentGaps.id, gap.id));
        draftsGenerated++;
      } catch (error) {
        logger.error(`[GEO] Failed to generate proposal for ${gap.id}:`, error);
      }
    }
  }

  await deps.db
    .update(geoRuns)
    .set({
      queriesCount: queriesProcessed,
      gapsFound,
      draftsGenerated,
      gapsDeduped,
    })
    .where(eq(geoRuns.id, geoRun.id));

  try {
    await deps.notifyDiscord({
      runAt: startTime,
      queriesCount: queriesProcessed,
      gapsFound,
      draftsGenerated,
    });
  } catch (error) {
    logger.error('[GEO] Discord notification failed:', error);
  }

  return {
    runAt: startTime,
    queriesProcessed,
    gapsFound,
    gapsDeduped,
    draftsGenerated,
  };
}
