/**
 * bc-lp-generator.ts — Generates 3 landing page variants for a Brand Clarity project.
 *
 * Variant types:
 *   1. founder_vision — based on the founder's distilled vision
 *   2. pain_point_1   — anchored to the top approved pain point
 *   3. pain_point_2   — anchored to the second approved pain point
 *
 * Each variant:
 *   - Follows the LP section structure extracted in Stage 1
 *   - Contains improvement suggestions per section (improvementSuggestions JSON)
 *   - Preserves brand voice and tone from lpStructureJson
 *
 * Model: claude-sonnet-4-6 (precision required for copywriting)
 *
 * Input env: BC_PROJECT_ID
 * Output: inserts bcLandingPageVariants, stdout VARIANTS_GENERATED:N
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcExtractedPainPoints, bcLandingPageVariants } from '../src/db/schema';
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
  founderVision?: string;
}

async function generateVariant(
  variantType: 'founder_vision' | 'pain_point_1' | 'pain_point_2',
  variantLabel: string,
  lpStructure: LpStructure,
  painPoint: { title: string; description: string; customerLanguage: string | null; desiredOutcome: string | null; vocabularyQuotes: string[] } | null,
  projectName: string,
  founderVision: string,
): Promise<{ html: string; improvements: Record<string, string>; promptUsed: string }> {

  const sectionWeaknessBlock = Object.entries(lpStructure.sectionWeaknesses || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const painPointBlock = painPoint
    ? `
PAIN POINT FOCUS:
- Title: ${painPoint.title}
- Description: ${painPoint.description}
- Customer Language: ${painPoint.customerLanguage || 'N/A'}
- Desired Outcome: ${painPoint.desiredOutcome || 'N/A'}
- Verbatim Quotes: ${painPoint.vocabularyQuotes.join(' | ')}
`
    : `
FOUNDER VISION FOCUS:
${founderVision}
`;

  const prompt = `You are a world-class landing page conversion copywriter.

PROJECT: ${projectName}
VARIANT TYPE: ${variantType}

ORIGINAL LP STRUCTURE (extracted from current landing page):
- Headline: ${lpStructure.headline}
- Subheadline: ${lpStructure.subheadline}
- Target Audience: ${lpStructure.targetAudience}
- Core Promise: ${lpStructure.corePromise}
- Problem Statement: ${lpStructure.problemStatement}
- Solution Mechanism: ${lpStructure.solutionMechanism}
- Features: ${lpStructure.features.map(f => `${f.name}: ${f.description}`).join(' | ')}
- Benefits: ${lpStructure.benefitStatements.join(' | ')}
- Social Proof: ${lpStructure.socialProof.join(' | ')}
- Primary CTA: ${lpStructure.primaryCTA}
- Secondary CTA: ${lpStructure.secondaryCTA || 'none'}
- Brand Voice: ${lpStructure.brandVoiceNotes}
- Tone: ${lpStructure.toneKeywords.join(', ')}
- Section Order: ${lpStructure.sectionOrder.join(' → ')}

KNOWN WEAKNESSES TO FIX:
${sectionWeaknessBlock || '(none specified)'}
${painPointBlock}

YOUR TASK:
1. Write a FULL landing page HTML that:
   - Follows EXACTLY the same section order: ${lpStructure.sectionOrder.join(' → ')}
   - Preserves brand voice and tone
   - ${variantType === 'founder_vision'
      ? 'Centers the narrative on the founder\'s vision and personal mission'
      : `Opens with the customer's pain: "${painPoint?.title}" — use their exact language`}
   - Fixes each known weakness
   - Uses semantic HTML5 with class names matching sections (e.g. <section class="hero">)
   - Includes each section's improvement note as <!-- CRO NOTE: ... --> at section start

2. Output a JSON object with improvement suggestions per section:
{
  "hero": "1 sentence on what was improved",
  "problem": "1 sentence",
  "solution": "1 sentence",
  "features": "1 sentence",
  "social_proof": "1 sentence",
  "cta": "1 sentence"
}

Output the JSON first inside a \`\`\`json block, then the full HTML inside a \`\`\`html block.`;

  let responseText = '';
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    });
    responseText = response.choices[0]?.message?.content || '';
    log(`Got response for ${variantType} (${responseText.length} chars)`);
  } catch (e: any) {
    throw new Error(`LLM call failed for ${variantType}: ${e.message}`);
  }

  // Parse JSON block
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  let improvements: Record<string, string> = {};
  if (jsonMatch) {
    try {
      improvements = JSON.parse(jsonMatch[1]);
    } catch {
      log(`[WARN] Could not parse improvements JSON for ${variantType}`);
    }
  }

  // Parse HTML block
  const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/i);
  const html = htmlMatch ? htmlMatch[1].trim() : responseText.trim();

  if (!html) throw new Error(`No HTML generated for ${variantType}`);

  return { html, improvements, promptUsed: prompt };
}

async function run() {
  if (!BC_PROJECT_ID) { console.error('[ERROR] BC_PROJECT_ID required'); process.exit(1); }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) { console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`); process.exit(1); }

  const lpStructure = project.lpStructureJson as LpStructure | null;
  if (!lpStructure) {
    console.error('[ERROR] lpStructureJson is empty — run bc-lp-parser first');
    process.exit(1);
  }

  log(`Generating LP variants for project "${project.name}" (id=${BC_PROJECT_ID})`);
  log(`Model: ${MODEL}`);

  // Get top 2 approved pain points by emotional intensity
  const approvedPainPoints = await db.select().from(bcExtractedPainPoints)
    .where(and(
      eq(bcExtractedPainPoints.projectId, BC_PROJECT_ID),
      eq(bcExtractedPainPoints.status, 'approved'),
    ))
    .orderBy(desc(bcExtractedPainPoints.emotionalIntensity))
    .limit(2);

  if (approvedPainPoints.length < 2) {
    log('[WARN] Fewer than 2 approved pain points — will use available or placeholder');
  }

  const founderVision = project.founderVision || project.founderDescription.substring(0, 500);

  // Clear existing variants for this project
  await db.delete(bcLandingPageVariants).where(eq(bcLandingPageVariants.projectId, BC_PROJECT_ID));

  const variants: Array<{
    type: 'founder_vision' | 'pain_point_1' | 'pain_point_2';
    label: string;
    painPoint: typeof approvedPainPoints[0] | null;
  }> = [
    { type: 'founder_vision', label: 'Founder Vision', painPoint: null },
    { type: 'pain_point_1', label: approvedPainPoints[0]?.painPointTitle || 'Pain Point 1', painPoint: approvedPainPoints[0] ?? null },
    { type: 'pain_point_2', label: approvedPainPoints[1]?.painPointTitle || 'Pain Point 2', painPoint: approvedPainPoints[1] ?? approvedPainPoints[0] ?? null },
  ];

  let generatedCount = 0;

  for (const variant of variants) {
    log(`Generating variant: ${variant.type}`);
    try {
      const pp = variant.painPoint ? {
        title: variant.painPoint.painPointTitle,
        description: variant.painPoint.painPointDescription,
        customerLanguage: variant.painPoint.customerLanguage,
        desiredOutcome: variant.painPoint.desiredOutcome,
        vocabularyQuotes: variant.painPoint.vocabularyQuotes,
      } : null;

      const { html, improvements, promptUsed } = await generateVariant(
        variant.type,
        variant.label,
        lpStructure,
        pp,
        project.name,
        founderVision,
      );

      await db.insert(bcLandingPageVariants).values({
        projectId: BC_PROJECT_ID,
        variantType: variant.type,
        variantLabel: variant.label,
        htmlContent: html,
        improvementSuggestions: improvements,
        primaryPainPointId: variant.painPoint?.id ?? null,
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

  // Update project status
  await db.update(bcProjects).set({
    status: 'done',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, BC_PROJECT_ID));

  log(`Done. Generated ${generatedCount}/3 variants.`);
  process.stdout.write(`VARIANTS_GENERATED:${generatedCount}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
