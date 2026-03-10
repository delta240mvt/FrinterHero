/**
 * draft-generator.ts
 * AI-powered article draft generator for FrinterHero content engine.
 * Input: gap details + author notes + KB context
 * Output: DraftAIResponse with title, description, markdown content, tags, mentions
 * Error handling: structured errors with retry_allowed flag
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/client';
import { contentGaps, knowledgeEntries } from '../src/db/schema';
import { eq, desc, or, ilike, sql } from 'drizzle-orm';
import { parseMarkdown, calculateReadingTime } from '../src/utils/markdown';
import { validateDraft } from './draft-validator';
import type { DraftAIResponse, ValidationResult } from './draft-validator';
import * as fs from 'fs';
import * as path from 'path';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface GenerateDraftRequest {
  gap_id: number;
  author_notes: string;
  model: string;
}

export interface GenerateDraftResult {
  success: boolean;
  draft?: DraftAIResponse;
  htmlContent?: string;
  readingTime?: number;
  slug?: string;
  validation?: ValidationResult;
  error?: {
    code: 'INVALID_GAP' | 'API_ERROR' | 'VALIDATION_FAILED' | 'TIMEOUT' | 'PARSE_ERROR';
    message: string;
    retry_allowed: boolean;
    details?: any;
  };
  kbEntriesUsed?: number[];
  megaPrompt?: string;
}

// Load author identity from llms-full.txt
function loadAuthorIdentity(): string {
  try {
    const llmsPath = path.join(process.cwd(), 'public', 'llms-full.txt');
    if (fs.existsSync(llmsPath)) {
      const content = fs.readFileSync(llmsPath, 'utf-8');
      return content.slice(0, 3000); // Use first 3000 chars for prompt efficiency
    }
  } catch {}

  // Fallback identity if file not found
  return `Przemysław Filipiak — AI developer, solo founder, deep work practitioner.
Creator of frinter.app (Focus OS for founders), FrinterFlow (local voice dictation CLI).
Philosophy: The 3 Spheres — Rozkwit (Teal, flourishing), Relacje (Violet, relationships), Skupienie (Gold, deep work).
Tone: direct, honest, builder-focused. No marketing fluff. References Cal Newport's Deep Work and flow state philosophy.
Audience: AI developers, solo founders, high-performers who care about sustainable productivity.`;
}

// Fetch top KB entries relevant to the gap
async function fetchRelevantKBEntries(gapTitle: string, limit = 5): Promise<{ entries: any[]; ids: number[] }> {
  try {
    const searchTerm = gapTitle.split(' ').slice(0, 4).join(' ');
    const entries = await db.select()
      .from(knowledgeEntries)
      .where(
        or(
          ilike(knowledgeEntries.title, `%${searchTerm}%`),
          sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${searchTerm})`
        )
      )
      .orderBy(desc(knowledgeEntries.importanceScore))
      .limit(limit);

    return {
      entries,
      ids: entries.map(e => e.id),
    };
  } catch {
    return { entries: [], ids: [] };
  }
}

// Build the mega-prompt
function buildMegaPrompt(
  gap: any,
  authorNotes: string,
  kbEntries: any[],
  authorIdentity: string
): string {
  const kbContext = kbEntries.length > 0
    ? kbEntries.map(e => `### ${e.title} (Importance: ${e.importanceScore}/100)\n${e.content.slice(0, 500)}...`).join('\n\n')
    : 'No specific KB entries found. Draw from general author identity and expertise.';

  return `# SECTION 1: IDENTITY (System — Author Voice)

You are writing AS Przemysław Filipiak. Your content must match his authentic voice and philosophy:

${authorIdentity}

Key brand voice rules:
- Write in first person, builder perspective
- Natural product mentions: "...which is why I built frinter.app as a focus OS..." NOT "Use frinter.app today!"
- References: Cal Newport, Csikszentmihalyi flow state, building in public
- Tone: direct, honest, technical depth for founders & AI devs
- 3 spheres when relevant: Rozkwit (wellness), Relacje (relationships), Skupienie (deep work)

# SECTION 2: GAP CONTEXT

Gap Title: ${gap.gapTitle}
Gap Description: ${gap.gapDescription}

Suggested Angle: ${gap.suggestedAngle || 'Establish thought leadership from a founder/deep-work perspective'}

Author Custom Notes: ${authorNotes || 'None provided — use best judgment based on gap context'}

# SECTION 3: KNOWLEDGE BASE CONTEXT

The following are the most relevant entries from the knowledge base. Use them to ground the article in real expertise:

${kbContext}

# SECTION 4: OUTPUT FORMAT SPECIFICATION

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "title": "Compelling, keyword-rich title (max 100 chars)",
  "description": "SEO meta description, 100-160 chars, includes primary keyword + value prop",
  "content": "Full article in Markdown format. Use H2 and H3 headers. 800-2500 words. Include intro, body sections, practical takeaways, closing CTA or question.",
  "tags": ["5-7 lowercase-hyphen tags, highly relevant"],
  "mentions": ["list of products/projects naturally mentioned in content"]
}

# SECTION 5: SEO & GEO OPTIMIZATION

- Title: Include primary keyword naturally + author's unique angle
- H2 headers: Match common questions AI models get asked about this topic
- Content structure: Problem → Framework → Solution → Action (AI models rank this pattern)
- Keyword density: 3-5% for primary keyword, no forced repetition
- End with a thought-provoking question or clear CTA
- Short paragraphs (2-3 sentences max) for AI parser friendliness

# SECTION 6: BRAND VOICE GUARDRAILS

Natural integration examples:
✅ "...which is exactly why I built frinter.app — a focus OS that tracks..."
✅ "...I discovered this experimenting with FrinterFlow's voice-first workflow..."
✅ "...inspired by Cal Newport's Deep Work and my 12 months building in public..."
❌ "Przemysław Filipiak recommends..." (too formal — write as him, not about him)
❌ "Try frinter.app today!" (too marketing)

# SECTION 7: MANDATORY ARTICLE STRUCTURE (AI-PARSEABLE FORMAT)

Every article MUST follow this exact structure. This ensures AI agents (ChatGPT, Perplexity, Claude) can parse, cite, and index the content correctly.

\`\`\`markdown
> **TL;DR:** [1-2 sentence summary of the core insight. Concrete, no fluff.]

*Author: Przemysław Filipiak | Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*

## [First H2 — define the problem or concept clearly]

[Short intro paragraph. 2-3 sentences max. Hook the reader with a specific insight.]

## [Second H2 — your framework or system]

### [H3 subsection]
[2-3 sentence explanation.]

### [H3 subsection]
[2-3 sentence explanation.]

## [Comparison or data section — USE A TABLE]

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Row data | Row data | Row data |

## [Practical application or key lessons]

[Short paragraphs. Never more than 3 sentences. One idea per paragraph.]

## FAQ

**Q: [Most common question about this topic]**
A: [Direct answer. 1-3 sentences.]

**Q: [Second question]**
A: [Direct answer.]

**Q: [Third question]**
A: [Direct answer.]

## Sources
- [Source name]: [URL or reference]
\`\`\`

RULES:
- TL;DR block is mandatory — first element always
- Author line is mandatory — second element always
- At least ONE table in the article
- FAQ section is mandatory — always last before Sources
- Paragraphs: max 3 sentences each
- H2 headers must be standalone questions or clear topic statements (AI agents use these for citations)
- No long introductions — get to the point in the first paragraph

Gap to fill: ${gap.gapTitle}
Target readers: AI developers, solo founders, high-performers
Required: Ground all claims in knowledge base or gap description — no hallucination`;
}

// Call OpenRouter API
async function callOpenRouter(model: string, prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 180s timeout (bulletproof)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://frinter.app',
        'X-Title': 'FrinterHero Draft Generator',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 429) throw new Error(`RATE_LIMIT: ${errorBody}`);
      throw new Error(`API_ERROR ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// Parse JSON from AI response (handle markdown wrapping)
function parseJSONResponse(raw: string): DraftAIResponse {
  // Strip markdown code blocks if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    title: parsed.title || '',
    description: parsed.description || '',
    content: parsed.content || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
  };
}

// Generate URL slug
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// Main generation function
export async function generateDraft(request: GenerateDraftRequest): Promise<GenerateDraftResult> {
  const { gap_id, author_notes, model } = request;
  console.log(`[DraftGen] Starting generation for gap ${gap_id} using ${model}`);

  // Load gap
  let gap: any;
  try {
    const [result] = await db.select().from(contentGaps).where(eq(contentGaps.id, gap_id)).limit(1);
    if (!result) {
      return {
        success: false,
        error: { code: 'INVALID_GAP', message: `Gap ${gap_id} not found`, retry_allowed: false },
      };
    }
    gap = result;
  } catch (err) {
    console.error('[DraftGen] DB error loading gap:', { gapId: gap_id, error: err });
    return {
      success: false,
      error: { code: 'API_ERROR', message: 'Database error loading gap', retry_allowed: true },
    };
  }

  // Load KB context
  const { entries: kbEntries, ids: kbIds } = await fetchRelevantKBEntries(gap.gapTitle);
  console.log(`[DraftGen] Loaded ${kbEntries.length} KB entries`);

  // Load author identity
  const authorIdentity = loadAuthorIdentity();

  // Build mega-prompt
  const megaPrompt = buildMegaPrompt(gap, author_notes, kbEntries, authorIdentity);

  // Call AI API
  let rawResponse: string;
  try {
    console.log(`[DraftGen] Calling ${model}...`);
    rawResponse = await callOpenRouter(model, megaPrompt);
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');
    const isRateLimit = err.message?.includes('RATE_LIMIT');
    console.error('[DraftGen] API call failed:', { gapId: gap_id, model, error: err.message });
    return {
      success: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'API_ERROR',
        message: isRateLimit ? 'Rate limit reached. Please try again later.' : err.message,
        retry_allowed: !isRateLimit,
      },
    };
  }

  // Parse JSON response
  let draft: DraftAIResponse;
  try {
    draft = parseJSONResponse(rawResponse);
  } catch (err: any) {
    console.error('[DraftGen] JSON parse failed:', { gapId: gap_id, error: err.message, raw: rawResponse.slice(0, 200) });
    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'AI response was not valid JSON. Please retry.',
        retry_allowed: true,
        details: { raw_preview: rawResponse.slice(0, 200) },
      },
    };
  }

  // Validate draft
  const validation = validateDraft(draft);
  if (!validation.isValid) {
    console.error('[DraftGen] Validation failed:', { gapId: gap_id, errors: validation.errors });
    return {
      success: false,
      draft,
      validation,
      error: {
        code: 'VALIDATION_FAILED',
        message: `Draft failed validation: ${validation.errors.join('; ')}`,
        retry_allowed: true,
        details: { errors: validation.errors, metrics: validation.metrics },
      },
    };
  }

  // Convert markdown to HTML
  const htmlContent = parseMarkdown(draft.content);
  const readingTime = calculateReadingTime(htmlContent);
  const slug = slugify(draft.title);

  console.log(`[DraftGen] Success: "${draft.title}" (${validation.metrics.wordCount} words, ${readingTime}min read)`);

  return {
    success: true,
    draft,
    htmlContent,
    readingTime,
    slug,
    validation,
    kbEntriesUsed: kbIds,
    megaPrompt,
  };
}
