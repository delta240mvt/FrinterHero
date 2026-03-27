import { db as defaultDb } from '../../db/client';
import { bcProjects } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { callBcLlm, getBcLpMaxTokens, getBcLpModel, getBcThinkingBudget } from '../bc-llm-client';

export interface BcLpParseOptions {
  projectId: number;
}

export interface BcLpParseResult {
  nicheKeywordsFound: number;
  audiencePainKeywordsFound: number;
  featureMapItems: number;
  protocolLines: string[];
}

export interface ParsedBcLpResponse {
  lpStructureJson: Record<string, unknown>;
  lpTemplateHtml: string;
  nicheKeywords: string[];
  founderVision: string;
  audiencePainKeywords: string[];
  featureMap: any[];
}

export function parseBcLpResponse(
  responseText: string,
  fallbackFounderVision: string,
  hasProjectDocumentation: boolean,
): ParsedBcLpResponse {
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  const rawJsonMatch = responseText.match(/\{[\s\S]*"headline"[\s\S]*"sectionWeaknesses"[\s\S]*\}/);
  const jsonContent = jsonMatch?.[1] ?? rawJsonMatch?.[0];
  if (!jsonContent) {
    throw new Error('No JSON block found in response');
  }

  const lpStructureJson = JSON.parse(jsonContent);
  const htmlMatch = responseText.match(/```html\s*([\s\S]*?)\s*```/i);
  const lpTemplateHtml = htmlMatch ? htmlMatch[1].trim() : '';
  const nicheKeywords = Array.isArray((lpStructureJson as any).nicheKeywords)
    ? ((lpStructureJson as any).nicheKeywords as unknown[]).slice(0, 10).map(String)
    : [];
  const founderVision = (lpStructureJson as any).founderVision
    ? String((lpStructureJson as any).founderVision)
    : fallbackFounderVision;

  let audiencePainKeywords: string[] = [];
  const painKeywordsMatch = responseText.match(/^AUDIENCE_PAIN_KEYWORDS:(\[.+\])/m);
  if (painKeywordsMatch) {
    const parsed = JSON.parse(painKeywordsMatch[1]);
    if (Array.isArray(parsed)) {
      audiencePainKeywords = parsed.map(String);
    }
  }

  let featureMap: any[] = [];
  const featureMapMatch = responseText.match(/^FEATURE_MAP:(\[.+\])/m);
  if (featureMapMatch) {
    const parsed = JSON.parse(featureMapMatch[1]);
    if (Array.isArray(parsed)) {
      featureMap = parsed;
    }
  } else if (hasProjectDocumentation) {
    featureMap = [];
  }

  return {
    lpStructureJson,
    lpTemplateHtml,
    nicheKeywords,
    founderVision,
    audiencePainKeywords,
    featureMap,
  };
}

export async function runBcParseJob(
  options: BcLpParseOptions,
  overrides: {
    db?: typeof defaultDb;
    callLlm?: typeof callBcLlm;
    logger?: Pick<Console, 'log'>;
  } = {},
): Promise<BcLpParseResult> {
  const db = overrides.db ?? defaultDb;
  const callLlm = overrides.callLlm ?? callBcLlm;
  const logger = overrides.logger ?? console;

  if (!options.projectId) {
    throw new Error('BC_PROJECT_ID is required');
  }

  const [project] = await db.select().from(bcProjects).where(eq(bcProjects.id, options.projectId));
  if (!project) {
    throw new Error(`Project ${options.projectId} not found`);
  }

  const docsSection = project.projectDocumentation
    ? `\n\n--- MY FULL PROJECT DOCUMENTATION ---\n${project.projectDocumentation.substring(0, 8000)}`
    : '';
  const task1cBlock = project.projectDocumentation
    ? `
TASK 1C - Extract Feature Map from documentation:
Read the product documentation and extract every distinct built feature as:
[{ "featureName": "name", "whatItDoes": "1 sentence plain English", "userBenefit": "why user cares" }]
Only include BUILT features - not roadmap. Output on its own line:
FEATURE_MAP:[...JSON array...]
`
    : '';
  const prompt = `You are a landing page architect and conversion copywriter.

I will give you:
1. My existing landing page (HTML or text)${project.projectDocumentation ? '\n2. My full project documentation' : ''}
${project.projectDocumentation ? '3' : '2'}. A short description of how I feel my product works

Return the JSON block, html block, AUDIENCE_PAIN_KEYWORDS JSON line, and FEATURE_MAP when documentation exists.

--- MY LANDING PAGE ---
${project.lpRawInput.substring(0, 8000)}${docsSection}

--- HOW I FEEL MY PRODUCT WORKS ---
${project.founderDescription}
${task1cBlock}`;

  logger.log(`[BC-LP-PARSER] Parsing LP for project "${project.name}" (id=${options.projectId})`);
  const llmResponse = await callLlm({
    model: getBcLpModel(),
    maxTokens: getBcLpMaxTokens(),
    messages: [{ role: 'user', content: prompt }],
    thinkingBudget: getBcThinkingBudget('lp'),
  });

  const parsed = parseBcLpResponse(
    llmResponse.content,
    project.founderDescription.substring(0, 255),
    Boolean(project.projectDocumentation),
  );

  await db
    .update(bcProjects)
    .set({
      lpStructureJson: parsed.lpStructureJson,
      lpTemplateHtml: parsed.lpTemplateHtml,
      founderVision: parsed.founderVision,
      nicheKeywords: parsed.nicheKeywords,
      audiencePainKeywords: parsed.audiencePainKeywords,
      featureMap: parsed.featureMap,
      status: 'channels_pending',
      updatedAt: new Date(),
    })
    .where(eq(bcProjects.id, options.projectId));

  return {
    nicheKeywordsFound: parsed.nicheKeywords.length,
    audiencePainKeywordsFound: parsed.audiencePainKeywords.length,
    featureMapItems: parsed.featureMap.length,
    protocolLines: [
      `LP_PARSE_RESULT:${JSON.stringify({
        success: true,
        nicheKeywordsFound: parsed.nicheKeywords.length,
        audiencePainKeywordsFound: parsed.audiencePainKeywords.length,
        featureMapItems: parsed.featureMap.length,
      })}`,
    ],
  };
}
