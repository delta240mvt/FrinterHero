/**
 * bc-lp-parser.ts — Parses the user's raw landing page + founder description
 * into a structured lpStructureJson + clean lpTemplateHtml.
 *
 * Model: claude-sonnet-4-6 (precision required for structural extraction)
 *
 * Input env: BC_PROJECT_ID
 * Output: updates bcProjects row, stdout LP_PARSE_RESULT:{...}
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { callBcLlm, getBcLpModel, getBcThinkingBudget } from '../src/lib/bc-llm-client';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BC_PROJECT_ID = parseInt(process.env.BC_PROJECT_ID || '0', 10);
const MODEL = getBcLpModel();
const THINKING_BUDGET = getBcThinkingBudget('lp');

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

  const task1cBlock = project.projectDocumentation
    ? `
TASK 1C — Extract Feature Map from documentation:
Read the product documentation and extract every distinct built feature as:
[{ "featureName": "name", "whatItDoes": "1 sentence plain English", "userBenefit": "why user cares" }]
Only include BUILT features — not roadmap. Output on its own line:
FEATURE_MAP:[...JSON array...]
`
    : '';

  const prompt = `You are a landing page architect and conversion copywriter.

I will give you:
1. My existing landing page (HTML or text)${project.projectDocumentation ? '\n2. My full project documentation' : ''}
${project.projectDocumentation ? '3' : '2'}. A short description of how I feel my product works

Your job is to do the following:

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

Output the JSON first inside a \`\`\`json block, then the full HTML inside a \`\`\`html block.

TASK 1B — Generate audience pain keywords:
Generate 5-7 keywords that frustrated customers would TYPE INTO YOUTUBE SEARCH
when looking for help with the problem your product solves.
These must be complaint-oriented and emotional — NOT topic labels.
Examples of BAD keywords: "productivity", "focus", "time management"
Examples of GOOD keywords: "why can't I focus at work", "brain fog after lunch", "can't get anything done", "wasting entire afternoons"
Output as a JSON array: ["keyword1", "keyword2", ...]
Label it: AUDIENCE_PAIN_KEYWORDS:[...JSON array...]
Put this on its own line after the html block.
${task1cBlock}
--- MY LANDING PAGE ---
${project.lpRawInput.substring(0, 8000)}${docsSection}

--- HOW I FEEL MY PRODUCT WORKS ---
${project.founderDescription}`;

  let responseText = '';
  try {
    const llmResp = await callBcLlm({
      model: MODEL,
      maxTokens: 6000,
      messages: [{ role: 'user', content: prompt }],
      thinkingBudget: THINKING_BUDGET,
    });
    responseText = llmResp.content;
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

  // Parse AUDIENCE_PAIN_KEYWORDS
  let audiencePainKeywords: string[] = [];
  const painKeywordsMatch = responseText.match(/^AUDIENCE_PAIN_KEYWORDS:(\[.+\])/m);
  if (painKeywordsMatch) {
    try {
      const parsed = JSON.parse(painKeywordsMatch[1]);
      if (Array.isArray(parsed)) {
        audiencePainKeywords = parsed.map(String);
      }
    } catch (e: any) {
      log(`[WARN] Failed to parse AUDIENCE_PAIN_KEYWORDS: ${e.message}`);
    }
  } else {
    log('[WARN] No AUDIENCE_PAIN_KEYWORDS found in response');
  }

  // Parse FEATURE_MAP
  let featureMap: any[] = [];
  const featureMapMatch = responseText.match(/^FEATURE_MAP:(\[.+\])/m);
  if (featureMapMatch) {
    try {
      const parsed = JSON.parse(featureMapMatch[1]);
      if (Array.isArray(parsed)) {
        featureMap = parsed;
      }
    } catch (e: any) {
      log(`[WARN] Failed to parse FEATURE_MAP: ${e.message}`);
    }
  } else if (project.projectDocumentation) {
    log('[WARN] No FEATURE_MAP found in response despite documentation being present');
  }

  // Write back to DB
  await db.update(bcProjects).set({
    lpStructureJson,
    lpTemplateHtml,
    founderVision,
    nicheKeywords,
    audiencePainKeywords,
    featureMap,
    status: 'channels_pending',
    updatedAt: new Date(),
  }).where(eq(bcProjects.id, BC_PROJECT_ID));

  log(`Done. Niche keywords: ${nicheKeywords.join(', ')}`);
  log(`Audience pain keywords: ${audiencePainKeywords.join(', ')}`);
  log(`Feature map items: ${featureMap.length}`);
  process.stdout.write(`LP_PARSE_RESULT:${JSON.stringify({ success: true, nicheKeywordsFound: nicheKeywords.length, audiencePainKeywordsFound: audiencePainKeywords.length, featureMapItems: featureMap.length })}\n`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
