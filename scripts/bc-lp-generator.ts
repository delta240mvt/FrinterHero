/**
 * bc-lp-generator.ts — Generates 3 landing page variants using Voice of Customer methodology.
 *
 * Variant strategies:
 *   1. curiosity_hook  — Surprising insight or counterintuitive claim
 *   2. pain_mirror     — Hero uses customer's exact problem language
 *   3. outcome_promise — "Give me X. Get Y." structure
 *
 * VoC-first principles:
 *   - Customer language drives every section
 *   - Features grounded in projectDocumentation (featureMap)
 *   - Pain clusters drive messaging (uses bcPainClusters if available)
 *   - Grade 6 reading level, no buzzwords
 *   - "What You Get" section always present
 *
 * Model: claude-sonnet-4-6
 * Input env: BC_PROJECT_ID
 * Output: inserts bcLandingPageVariants, stdout VARIANTS_GENERATED:N
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcExtractedPainPoints, bcLandingPageVariants, bcPainClusters } from '../src/db/schema';
import { eq, and, desc } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-LP-GEN] ${msg}`);
}

interface LpStructure {
  headline: string;
  subheadline: string;
  targetAudience: string;
  corePromise: string;
  problemStatement: string;
  solutionMechanism: string;
  features: { name: string; description: string }[];
  benefitStatements: string[];
  socialProof: string[];
  primaryCTA: string;
  secondaryCTA: string | null;
  toneKeywords: string[];
  brandVoiceNotes: string;
  sectionOrder: string[];
  sectionWeaknesses: Record<string, string | null>;
}

interface PainCluster {
  id: number;
  clusterTheme: string;
  dominantEmotion: string | null;
  aggregateIntensity: number | null;
  bestQuotes: string[];
  synthesizedProblemLabel: string | null;
  synthesizedSuccessVision: string | null;
  failedSolutions: string[];
  triggerMoments: string[];
  painPointIds: number[];
}

interface FeatureMapItem {
  featureName: string;
  whatItDoes: string;
  userBenefit: string;
}

async function generateVariant(
  variantType: 'curiosity_hook' | 'pain_mirror' | 'outcome_promise',
  variantLabel: string,
  lpStructure: LpStructure,
  cluster: PainCluster | null,
  projectName: string,
  founderVision: string,
  projectDocumentation: string | null,
  featureMap: FeatureMapItem[],
): Promise<{ html: string; improvements: Record<string, string>; featurePainMap: any[]; promptUsed: string }> {

  const sectionWeaknessBlock = Object.entries(lpStructure.sectionWeaknesses || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const featureMapBlock = featureMap.length > 0
    ? featureMap.map(f => `• ${f.featureName}: ${f.whatItDoes} → User benefit: ${f.userBenefit}`).join('\n')
    : lpStructure.features.map(f => `• ${f.name}: ${f.description}`).join('\n');

  const docsBlock = projectDocumentation
    ? `\n=== PRODUCT DOCUMENTATION (source of truth — only mention features from here) ===\n${projectDocumentation.substring(0, 6000)}`
    : '';

  const clusterBlock = cluster ? `
=== VOICE OF CUSTOMER DATA (from real YouTube comment analysis) ===
Pain Theme: ${cluster.clusterTheme}
How customers NAME this problem: "${cluster.synthesizedProblemLabel || ''}"
Dominant emotion: ${cluster.dominantEmotion || 'frustration'}
Their vision of success: "${cluster.synthesizedSuccessVision || ''}"
What they've tried that failed: ${(cluster.failedSolutions as string[]).join(', ') || 'various solutions'}
When they feel this pain most: ${(cluster.triggerMoments as string[]).join(' | ') || 'throughout the day'}
Their exact words (use these verbatim in copy):
${(cluster.bestQuotes as string[]).map((q, i) => `  ${i + 1}. "${q}"`).join('\n')}` : `
=== FOUNDER VISION ===
${founderVision}`;

  const variantInstructions = {
    curiosity_hook: `HERO STRATEGY: CURIOSITY HOOK
Your headline must state something SURPRISING or COUNTERINTUITIVE.
Something the reader doesn't expect. They should think: "Wait — what?"
Ideas: a surprising stat, a counterintuitive truth about their problem, an unexpected cause.
Example patterns:
- "The reason you can't focus isn't what you think"
- "87% of productivity apps make distraction worse"
- "Your willpower isn't broken. Your environment is."
The subheadline then explains the real answer in one simple sentence.`,

    pain_mirror: `HERO STRATEGY: PAIN MIRROR
Your headline must use the customer's EXACT language for their problem.
Use: "${cluster?.synthesizedProblemLabel || lpStructure.problemStatement}"
The reader must think: "This person gets me exactly."
The subheadline mirrors their dominant emotion: ${cluster?.dominantEmotion || 'frustration'}.
Example pattern: "[Their problem label] — [1 sentence that validates their struggle]"`,

    outcome_promise: `HERO STRATEGY: OUTCOME PROMISE
Structure: "Give me [specific action]. Get [specific outcome]."
The outcome must come from: "${cluster?.synthesizedSuccessVision || lpStructure.corePromise}"
Be CONCRETE — no vague words like "better" or "improve".
The reader must think: "That's exactly what I want."
Example: "Give me 10 minutes of setup. Get 3 uninterrupted hours of deep work."`,
  };

  const systemPrompt = `You are a conversion copywriter who uses Voice of Customer methodology.

CORE PRINCIPLE: Every sentence must sound like it was written BY the customer, FOR the customer.
The product speaks their language — not marketing speak.

LANGUAGE LAWS (violating these fails the task):
- Reading level: Grade 6. Short sentences. Max 15 words per sentence.
- BANNED words: leverage, optimize, unlock, empower, transform, revolutionary, cutting-edge, game-changing, seamless, robust, holistic, synergy, streamline
- Test every line: "Would a tired person at 11 PM understand this in 3 seconds?"
- Use contractions (you're, it's, we've) — sounds human
- Use specific numbers over vague claims ("90 minutes" not "longer focus sessions")`;

  const prompt = `PROJECT: ${projectName}
VARIANT TYPE: ${variantType}
${docsBlock}

=== FEATURE MAP (ONLY reference features from this list) ===
${featureMapBlock}
${clusterBlock}

=== LP STRUCTURE TO FOLLOW ===
Section order: ${lpStructure.sectionOrder.join(' → ')}
Brand voice: ${lpStructure.brandVoiceNotes}
Tone: ${lpStructure.toneKeywords.join(', ')}
Primary CTA: ${lpStructure.primaryCTA}
${lpStructure.secondaryCTA ? `Secondary CTA: ${lpStructure.secondaryCTA}` : ''}

KNOWN WEAKNESSES TO FIX:
${sectionWeaknessBlock || '(none specified)'}

${variantInstructions[variantType]}

=== SECTION-BY-SECTION REQUIREMENTS ===

HERO:
Follow the variant strategy above for headline.
Subheadline: 1 sentence, explains the "how" simply.

PROBLEM:
Open with: "You know that moment when ${cluster?.triggerMoments?.[0] || '[specific situation]'}..."
Use at least 2 of these exact phrases verbatim: ${(cluster?.bestQuotes || []).slice(0, 3).map(q => `"${q}"`).join(', ')}
Name failed solutions: "You've tried ${(cluster?.failedSolutions || []).slice(0, 3).join(', ')}."
End: "It's not your fault. [Reframe — explain WHY it's a systemic problem, not personal failure]."

SOLUTION:
Transition: "What if ${cluster?.synthesizedSuccessVision || lpStructure.corePromise}?"
For each feature relevant to this pain: "[Feature name] — [what it does]. So you can [benefit]."
Max 4 features. Pick the most relevant to this pain cluster.

WHAT YOU GET (add this section — label it clearly):
List EVERY feature from the feature map above.
Format: "✓ [Feature name] — [whatItDoes in 8 words]"
This section must make a beta tester think: "I know exactly what I'm signing up for."

SOCIAL PROOF:
Use customer quotes: "People like you say: '${(cluster?.bestQuotes || [])[0] || ''}'"
If no testimonials exist: "Join [N] people who felt exactly like you do right now."

CTA:
Primary: "Give me [action]. Get [outcome]." — specific, concrete
Secondary: Address the #1 objection from their failed solutions
No fake urgency. If beta: "Beta closes [specific timeframe]" or "Limited spots" if true.

=== OUTPUT FORMAT ===
Output ONLY the full HTML. No JSON, no preamble, no explanation.
Start directly with \`\`\`html and end with \`\`\`.
Use semantic tags: <section class="hero">, <section class="problem">, etc.
No external CSS dependencies. Include minimal inline styles for readability.`;

  // ── Call 1: HTML only (full 8192 token budget) ──────────────────────────
  let htmlRaw = '';
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });
    htmlRaw = response.choices[0]?.message?.content || '';
    const finishReason = response.choices[0]?.finish_reason;
    log(`HTML call for ${variantType}: ${htmlRaw.length} chars, finish_reason: ${finishReason}`);
    if (finishReason === 'length') log(`[WARN] HTML still truncated at 8192 tokens for ${variantType}`);
  } catch (e: any) {
    throw new Error(`LLM HTML call failed for ${variantType}: ${e.message}`);
  }

  const htmlMatch = htmlRaw.match(/```html\s*([\s\S]*?)\s*```/i);
  const htmlTruncatedMatch = !htmlMatch ? htmlRaw.match(/```html\s*([\s\S]+)/i) : null;
  const html = htmlMatch
    ? htmlMatch[1].trim()
    : htmlTruncatedMatch
      ? htmlTruncatedMatch[1].trim()
      : htmlRaw.trim();

  if (!html) throw new Error(`No HTML generated for ${variantType}`);

  // ── Call 2: Meta JSON only (small, fast, separate budget) ───────────────
  let improvements: Record<string, string> = {};
  let featurePainMap: any[] = [];
  try {
    const metaPrompt = `Based on this landing page variant (${variantType}) for "${projectName}", return ONLY this JSON (no markdown):
{
  "featurePainMap": [{ "feature": "name", "painItSolves": "pain", "vocQuote": "quote", "section": "section" }],
  "improvementSuggestions": { "hero": "...", "problem": "...", "solution": "...", "features": "...", "social_proof": "...", "cta": "..." }
}
Variant strategy: ${variantInstructions[variantType].split('\n')[0]}
Pain cluster: ${cluster?.synthesizedProblemLabel || 'n/a'}`;
    const metaRes = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 1000,
      messages: [{ role: 'user', content: metaPrompt }],
    });
    const metaRaw = (metaRes.choices[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const metaJson = JSON.parse(metaRaw);
    improvements = metaJson.improvementSuggestions || {};
    featurePainMap = Array.isArray(metaJson.featurePainMap) ? metaJson.featurePainMap : [];
    log(`Meta JSON call for ${variantType}: OK`);
  } catch {
    log(`[WARN] Meta JSON call failed for ${variantType} — continuing without it`);
  }

  return { html, improvements, featurePainMap, promptUsed: prompt };
}

async function run() {
  if (!BC_PROJECT_ID) { console.error('[ERROR] BC_PROJECT_ID required'); process.exit(1); }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }

  const lpStructure = project.lpStructureJson as LpStructure | null;
  if (!lpStructure) { console.error('[ERROR] lpStructureJson is empty — run bc-lp-parser first'); process.exit(1); }

  log(`Generating LP variants for project "${project.name}" (id=${BC_PROJECT_ID})`);
  log(`Model: ${MODEL}`);

  // Load feature map
  const featureMap: FeatureMapItem[] = Array.isArray((project as any).featureMap)
    ? ((project as any).featureMap as FeatureMapItem[])
    : [];
  log(`Feature map: ${featureMap.length} items`);

  // Load pain clusters (preferred) or fall back to top pain points
  const clusters = await db.select().from(bcPainClusters)
    .where(eq(bcPainClusters.projectId, BC_PROJECT_ID));

  let cluster1: PainCluster | null = null;
  let cluster2: PainCluster | null = null;

  if (clusters.length >= 2) {
    // Sort clusters by aggregate intensity desc
    const sorted = [...clusters].sort((a, b) => (b.aggregateIntensity || 0) - (a.aggregateIntensity || 0));
    cluster1 = sorted[0] as PainCluster;
    cluster2 = sorted[1] as PainCluster;
    log(`Using ${clusters.length} pain clusters`);
  } else if (clusters.length === 1) {
    cluster1 = clusters[0] as PainCluster;
    cluster2 = clusters[0] as PainCluster;
    log(`Only 1 cluster available — both pain variants use it`);
  } else {
    // Fall back: build pseudo-clusters from top approved pain points
    log(`No clusters found — falling back to top pain points`);
    const approvedPainPoints = await db.select().from(bcExtractedPainPoints)
      .where(and(eq(bcExtractedPainPoints.projectId, BC_PROJECT_ID), eq(bcExtractedPainPoints.status, 'approved')))
      .orderBy(desc(bcExtractedPainPoints.emotionalIntensity))
      .limit(4);

    if (approvedPainPoints.length > 0) {
      const pp1 = approvedPainPoints[0];
      cluster1 = {
        id: 0,
        clusterTheme: pp1.painPointTitle,
        dominantEmotion: 'frustration',
        aggregateIntensity: pp1.emotionalIntensity,
        bestQuotes: pp1.vocabularyQuotes as string[],
        synthesizedProblemLabel: pp1.painPointTitle,
        synthesizedSuccessVision: pp1.desiredOutcome,
        failedSolutions: [],
        triggerMoments: [],
        painPointIds: [pp1.id],
      };
    }
    if (approvedPainPoints.length > 1) {
      const pp2 = approvedPainPoints[1];
      cluster2 = {
        id: 0,
        clusterTheme: pp2.painPointTitle,
        dominantEmotion: 'frustration',
        aggregateIntensity: pp2.emotionalIntensity,
        bestQuotes: pp2.vocabularyQuotes as string[],
        synthesizedProblemLabel: pp2.painPointTitle,
        synthesizedSuccessVision: pp2.desiredOutcome,
        failedSolutions: [],
        triggerMoments: [],
        painPointIds: [pp2.id],
      };
    }
  }

  const founderVision = project.founderVision || project.founderDescription.substring(0, 500);

  const variants: Array<{
    type: 'curiosity_hook' | 'pain_mirror' | 'outcome_promise';
    label: string;
    cluster: PainCluster | null;
  }> = [
    { type: 'curiosity_hook', label: 'Curiosity Hook', cluster: cluster1 },
    { type: 'pain_mirror', label: cluster1 ? `Pain Mirror — ${cluster1.synthesizedProblemLabel || cluster1.clusterTheme}` : 'Pain Mirror', cluster: cluster1 },
    { type: 'outcome_promise', label: cluster2 ? `Outcome Promise — ${cluster2.synthesizedSuccessVision?.substring(0, 60) || cluster2.clusterTheme}` : 'Outcome Promise', cluster: cluster2 },
  ];

  let generatedCount = 0;

  for (const variant of variants) {
    log(`Generating variant: ${variant.type}`);
    try {
      const { html, improvements, featurePainMap, promptUsed } = await generateVariant(
        variant.type,
        variant.label,
        lpStructure,
        variant.cluster,
        project.name,
        founderVision,
        project.projectDocumentation,
        featureMap,
      );

      await db.insert(bcLandingPageVariants).values({
        projectId: BC_PROJECT_ID,
        variantType: variant.type,
        variantLabel: variant.label,
        htmlContent: html,
        improvementSuggestions: improvements,
        featurePainMap: featurePainMap,
        primaryPainPointId: variant.cluster?.painPointIds?.[0] ?? null,
        generationPromptUsed: promptUsed,
        generationModel: MODEL,
        isSelected: false,
      });

      generatedCount++;
      log(`  Inserted variant ${variant.type}`);
    } catch (e: any) {
      log(`[ERROR] Failed to generate ${variant.type}: ${e.message}`);
    }
  }

  await db.update(bcProjects).set({ status: 'done', updatedAt: new Date() })
    .where(eq(bcProjects.id, BC_PROJECT_ID));

  log(`Done. Generated ${generatedCount}/3 variants.`);
  process.stdout.write(`VARIANTS_GENERATED:${generatedCount}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
