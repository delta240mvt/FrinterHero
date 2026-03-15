/**
 * bc-lp-parser.ts — Parses the user's raw landing page + founder description
 * into a structured lpStructureJson + clean lpTemplateHtml.
 *
 * Model: claude-sonnet-4-6 (precision required for structural extraction)
 *
 * Input env: BC_PROJECT_ID
 * Output: updates bcProjects row, stdout LP_PARSE_RESULT:{...}
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects } from '../src/db/schema';
import { eq } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = process.env.BC_LP_MODEL || 'anthropic/claude-sonnet-4-6';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [BC-LP-PARSER] ${msg}`);
}

async function run() {
  if (!BC_PROJECT_ID) {
    console.error('[ERROR] BC_PROJECT_ID is required');
    process.exit(1);
  }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, BC_PROJECT_ID));
  if (!project) {
    console.error(`[ERROR] Project ${BC_PROJECT_ID} not found`);
    process.exit(1);
  }

  log(`Parsing LP for project "${project.name}" (id=${BC_PROJECT_ID})`);
  log(`Model: ${MODEL}`);
  log(`Has project documentation: ${project.projectDocumentation ? 'yes' : 'no'}`);

  const docsSection = project.projectDocumentation
    ? `\n\n--- MY FULL PROJECT DOCUMENTATION ---\n${project.projectDocumentation.substring(0, 8000)}`
    : '';

  const prompt = `You are a landing page architect and conversion copywriter.

I will give you:
1. My existing landing page (HTML or text)${project.projectDocumentation ? '\n2. My full project documentation' : ''}
${project.projectDocumentation ? '3' : '2'}. A short description of how I feel my product works

Your job is to do two things:

TASK 1 — Extract the landing page structure as a JSON object with these exact fields:

{
  "headline": "main hero headline (verbatim from LP)",
  "subheadline": "supporting line or tagline",
  "targetAudience": "who is this explicitly for",
  "corePromise": "the transformation or outcome the product promises",
  "problemStatement": "the central problem being solved",
  "solutionMechanism": "how the product solves the problem (the how)",
  "features": [
    { "name": "feature name", "description": "1-sentence description" }
  ],
  "benefitStatements": ["outcome-oriented benefit 1", "outcome-oriented benefit 2"],
  "socialProof": ["testimonial or stat 1 (verbatim)", "testimonial or stat 2 (verbatim)"],
  "primaryCTA": "call to action button text",
  "secondaryCTA": "secondary CTA text if present (or null)",
  "toneKeywords": ["adjective1", "adjective2", "adjective3"],
  "brandVoiceNotes": "1-2 sentences describing the brand voice and personality",
  "sectionOrder": ["hero", "problem", "solution", "features", "social_proof", "cta"],
  "nicheKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "founderVision": "distilled 1-sentence version of the founder description",
  "sectionWeaknesses": {
    "hero": "1 sentence on the biggest conversion weakness in this section, or null",
    "problem": "1 sentence, or null",
    "solution": "1 sentence, or null",
    "features": "1 sentence, or null",
    "social_proof": "1 sentence, or null",
    "cta": "1 sentence, or null"
  }
}

TASK 2 — Generate a clean, improved landing page in full HTML that:
- Uses the EXACT same section order as the original
- Preserves the brand voice and tone exactly
- Each section uses semantic HTML5 tags with clear class names (e.g. <section class="hero">, <section class="problem">)
- Keeps all original content but sharpens clarity and emotional resonance
- Does NOT add new sections that do not exist in the original
- Includes placeholder comments <!-- PAIN POINT HOOK GOES HERE --> inside hero and problem sections
- Includes CRO notes as HTML comments: <!-- CRO NOTE: {sectionWeaknesses.hero} --> at top of each section

--- MY LANDING PAGE ---
${project.lpRawInput.substring(0, 8000)}${docsSection}

--- HOW I FEEL MY PRODUCT WORKS ---
${project.founderDescription}

Output the JSON first inside a \`\`\`json block, then the full HTML inside a \`\`\`html block.`;

  let responseText = '';
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 6000,
      messages: [
        { role: 'user', content: prompt },
      ],
    });
    responseText = response.choices[0]?.message?.content || '';
    log(`Got response (${responseText.length} chars)`);
  } catch (e: any) {
    log(`[ERROR] LLM call failed: ${e.message}`);
    process.exit(1);
  }

  // Parse JSON block
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  let jsonContent: string | null = jsonMatch ? jsonMatch[1] : null;

  if (!jsonContent) {
    // Try to find raw JSON object
    const rawJsonMatch = responseText.match(/\{[\s\S]*"headline"[\s\S]*"sectionWeaknesses"[\s\S]*\}/);
    if (!rawJsonMatch) {
      log('[ERROR] No JSON block found in response');
      process.exit(1);
    }
    jsonContent = rawJsonMatch[0];
  }

  let lpStructureJson: any;
  try {
    lpStructureJson = JSON.parse(jsonContent!);
  } catch (e: any) {
    log(`[ERROR] JSON parse failed: ${e.message}`);
    process.exit(1);
  }

  // Parse HTML block
  const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/i);
  const lpTemplateHtml = htmlMatch ? htmlMatch[1].trim() : '';

  if (!lpTemplateHtml) {
    log('[WARN] No HTML block found in response — storing empty template');
  }

  const nicheKeywords: string[] = Array.isArray(lpStructureJson.nicheKeywords)
    ? lpStructureJson.nicheKeywords.slice(0, 10).map(String)
    : [];

  const founderVision: string = lpStructureJson.founderVision
    ? String(lpStructureJson.founderVision)
    : project.founderDescription.substring(0, 255);

  // Write back to DB
  await db.update(bcProjects).set({
    lpStructureJson,
    lpTemplateHtml,
    founderVision,
    nicheKeywords,
    status: 'channels_pending',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, BC_PROJECT_ID));

  log(`Done. Keywords: ${nicheKeywords.join(', ')}`);
  process.stdout.write(`LP_PARSE_RESULT:${JSON.stringify({ success: true, nicheKeywordsFound: nicheKeywords.length })}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
