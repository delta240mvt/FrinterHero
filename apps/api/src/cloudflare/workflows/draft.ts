/// <reference path="../workers-runtime.d.ts" />
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { getCloudflareDb } from '../../../../../src/db/client.ts';
import { appJobs, articles, articleGenerations, contentGaps, knowledgeEntries, sites } from '../../../../../src/db/schema.ts';
import type { JobQueueMessage } from '../../../../../src/lib/cloudflare/job-payloads.ts';
import { initWorkflowDb } from './workflow-db-init.ts';

type DraftQueueMessage = JobQueueMessage<{ gapId: number; model?: string; authorNotes?: string }>;
export type DraftWorkflowMessage = DraftQueueMessage;

type WorkflowStepLike = Pick<CloudflareWorkflowStep, 'do'>;

interface DraftWorkflowEnv {
  ANTHROPIC_API_KEY?: string;
}

interface DraftWorkflowDeps {
  db?: any;
  env?: DraftWorkflowEnv;
  step: WorkflowStepLike;
}

function getDb(db?: unknown) {
  return (db ?? getCloudflareDb()) as any;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function loadAuthorIdentity(primaryDomain: string | null): Promise<string> {
  if (primaryDomain) {
    try {
      const res = await fetch(`https://${primaryDomain}/llms-full.txt`);
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) return text;
      }
    } catch {}
  }
  return `Przemysław Filipiak — AI developer, solo founder, deep work practitioner.
Creator of frinter.app (Focus OS for founders), FrinterFlow (local voice dictation CLI), and FrinterHero (AI Brand Authority Engine).
Philosophy: The 3 Spheres — Flourishing (Teal), Relationships (Violet), Deep Work (Gold).
Tone: direct, honest, builder-focused. References Cal Newport's Deep Work and flow state philosophy.
Audience: AI developers, solo founders, high-performers.`;
}

async function fetchKBEntries(db: any, gapTitle: string, siteId: number | null) {
  try {
    const searchTerm = gapTitle.split(' ').slice(0, 4).join(' ');
    const siteScope = siteId
      ? or(eq(knowledgeEntries.siteId, siteId), sql`${knowledgeEntries.siteId} is null`)
      : sql`1=1`;
    const entries = await db.select()
      .from(knowledgeEntries)
      .where(and(
        siteScope,
        or(
          ilike(knowledgeEntries.title, `%${searchTerm}%`),
          sql`to_tsvector('english', ${knowledgeEntries.content}) @@ plainto_tsquery('english', ${searchTerm})`,
        ),
      ))
      .orderBy(desc(knowledgeEntries.importanceScore))
      .limit(5);
    return { entries, ids: entries.map((e: any) => e.id) };
  } catch {
    return { entries: [], ids: [] };
  }
}

function buildMegaPrompt(gap: any, authorNotes: string, kbEntries: any[], authorIdentity: string): string {
  const kbContext = kbEntries.length > 0
    ? kbEntries.map((e: any) => `### ${e.title} (Importance: ${e.importanceScore}/100)\n${String(e.content).slice(0, 500)}...`).join('\n\n')
    : 'No specific KB entries found. Draw from general author identity and expertise.';
  const vocQuotes: string[] = gap.relatedQueries || [];

  return `# SECTION 1: IDENTITY (System — Author Voice)

You are writing AS Przemysław Filipiak. Your content must match his authentic voice and philosophy:

${authorIdentity}

Key brand voice rules:
- Write in first person, builder perspective
- Natural product mentions: "...which is why I built frinter.app as a focus OS..." NOT "Use frinter.app today!"
- References: Cal Newport, Csikszentmihalyi flow state, building in public
- Tone: direct, honest, technical depth for founders & AI devs
- 3 spheres when relevant: Flourishing (You), Relationships (Loved Ones), Deep Work (The world)

# SECTION 2: GAP CONTEXT

Gap Title: ${gap.gapTitle}
Gap Description: ${gap.gapDescription}

Suggested Angle: ${gap.suggestedAngle || 'Establish thought leadership from a founder/deep-work perspective'}

Author Custom Notes: ${authorNotes || 'None provided — use best judgment based on gap context'}

# SECTION 3: KNOWLEDGE BASE CONTEXT

${kbContext}

${vocQuotes.length > 0 ? `# SECTION 3b: VOICE OF CUSTOMER\n\n${vocQuotes.map((q: string) => `- "${q}"`).join('\n')}\n\n` : ''}# SECTION 4: OUTPUT FORMAT SPECIFICATION

Return ONLY valid JSON. The "content" field MUST be a single JSON string containing the full markdown (use \\n for newlines). No markdown code blocks around the JSON itself.
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
- Content structure: Problem → Framework → Solution → Action
- End with a thought-provoking question or clear CTA
- Short paragraphs (2-3 sentences max) for AI parser friendliness

# SECTION 6: MANDATORY ARTICLE STRUCTURE

Every article MUST start with:
> **TL;DR:** [1-2 sentence summary]

*Author: Przemysław Filipiak | Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*

Include: intro, 3+ H2 sections, one table, FAQ section, Sources.

Gap to fill: ${gap.gapTitle}
Target readers: AI developers, solo founders, high-performers`;
}

function parseJSONResponse(raw: string): { title: string; description: string; content: string; tags: string[]; mentions: string[] } {
  let cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');
  let jsonStr = jsonMatch[0];
  jsonStr = jsonStr.replace(/: \s*"([\s\S]*?)"(?=\s*[,\}])/g, (_: string, content: string) =>
    ': "' + content.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"');
  jsonStr = jsonStr.replace(/,\s*([\}\]])/g, '$1').trim();
  const parsed = JSON.parse(jsonStr);
  return {
    title: parsed.title || '',
    description: parsed.description || '',
    content: parsed.content || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    mentions: Array.isArray(parsed.mentions) ? parsed.mentions : [],
  };
}

function slugify(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

function mdToHtmlBasic(md: string): string {
  // basic conversion: headers, bold, italic, lists — enough for readingTime calc
  return md
    .replace(/^#{1,6}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');
}

function calculateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ');
  const wordCount = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export async function executeDraftWorkflow(message: DraftQueueMessage, deps: DraftWorkflowDeps) {
  const db = getDb(deps.db);
  const payload = (message.payload ?? {}) as { gapId: number; model?: string; authorNotes?: string };
  const gapId = Number(payload.gapId ?? 0);
  const model = String(payload.model || 'anthropic/claude-sonnet-4-6');
  const authorNotes = String(payload.authorNotes || '');
  const jobId = Number(message.jobId);

  await deps.step.do('reserve', async () => {
    await db.update(appJobs).set({
      status: 'running',
      startedAt: new Date(),
      progress: { stage: 'reserved', logs: [{ line: `[DRAFT] Starting for gap #${gapId} using ${model}`, ts: Date.now() }] },
      updatedAt: new Date(),
      workerName: 'cloudflare:draft',
    }).where(eq(appJobs.id, jobId));
  });

  try {
    const articleId = await deps.step.do('generate', async () => {
      const apiKey = deps.env?.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured in worker env');

      // Load gap
      const [gap] = await db.select().from(contentGaps).where(eq(contentGaps.id, gapId)).limit(1);
      if (!gap) throw new Error(`Content gap #${gapId} not found`);

      const siteId: number | null = gap.siteId ?? message.siteId ?? null;

      // Load site domain for author identity
      let primaryDomain: string | null = null;
      if (siteId) {
        const [site] = await db.select({ primaryDomain: sites.primaryDomain }).from(sites).where(eq(sites.id, siteId)).limit(1);
        primaryDomain = site?.primaryDomain ?? null;
      }

      await db.update(appJobs).set({
        progress: { stage: 'loading', logs: [
          { line: `[DRAFT] Gap loaded: "${gap.gapTitle}"`, ts: Date.now() },
          { line: `[DRAFT] Site: ${primaryDomain ?? 'unknown'}`, ts: Date.now() },
        ]},
        updatedAt: new Date(),
      }).where(eq(appJobs.id, jobId));

      const [{ entries: kbEntries, ids: kbIds }, authorIdentity] = await Promise.all([
        fetchKBEntries(db, gap.gapTitle, siteId),
        loadAuthorIdentity(primaryDomain),
      ]);

      const megaPrompt = buildMegaPrompt(gap, authorNotes, kbEntries, authorIdentity);

      await db.update(appJobs).set({
        progress: { stage: 'calling_ai', logs: [
          { line: `[DRAFT] KB entries: ${kbEntries.length}. Calling ${model}...`, ts: Date.now() },
        ]},
        updatedAt: new Date(),
      }).where(eq(appJobs.id, jobId));

      // Call Anthropic API
      const normalizedModel = model.startsWith('anthropic/') ? model.slice('anthropic/'.length) : model;
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: normalizedModel,
          max_tokens: 4000,
          messages: [{ role: 'user', content: megaPrompt }],
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => '');
        throw new Error(`Anthropic API error ${aiResponse.status}: ${errText.slice(0, 200)}`);
      }

      const aiData = await aiResponse.json() as { content: Array<{ type: string; text?: string }> };
      const rawText = aiData.content.find((b) => b.type === 'text')?.text ?? '';
      if (!rawText) throw new Error('Empty response from Anthropic API');

      // Parse JSON
      const draft = parseJSONResponse(rawText);
      if (!draft.title || !draft.content) throw new Error('Generated draft missing title or content');

      const htmlContent = mdToHtmlBasic(draft.content);
      const readingTime = calculateReadingTime(htmlContent);
      const slug = slugify(draft.title) + '-' + Date.now();

      await db.update(appJobs).set({
        progress: { stage: 'saving', logs: [
          { line: `[DRAFT] Generated: "${draft.title}" (~${readingTime}min read). Saving...`, ts: Date.now() },
        ]},
        updatedAt: new Date(),
      }).where(eq(appJobs.id, jobId));

      // Save article
      const insertValues: Record<string, unknown> = {
        slug,
        title: draft.title.slice(0, 255),
        description: (draft.description || '').slice(0, 2000),
        content: htmlContent,
        tags: draft.tags,
        status: 'draft',
        readingTime,
        author: 'Przemysław Filipiak',
        sourceGapId: gapId,
        generatedByModel: model,
        generationTimestamp: new Date(),
      };
      if (siteId) insertValues.siteId = siteId;

      const [article] = await db.insert(articles).values(insertValues).returning({ id: articles.id });
      if (!article) throw new Error('Failed to insert article');

      // Save generation audit
      const genValues: Record<string, unknown> = {
        articleId: article.id,
        gapId,
        generatedByModel: model,
        generationPrompt: megaPrompt.slice(0, 10000),
        originalContent: draft.content,
        authorNotes,
        kbEntriesUsed: kbIds,
        modelsQueried: [model],
        generationTimestamp: new Date(),
      };
      if (siteId) genValues.siteId = siteId;
      await db.insert(articleGenerations).values(genValues);

      return article.id;
    });

    await deps.step.do('finalize', async () => {
      await db.update(appJobs).set({
        status: 'done',
        result: { article_id: articleId, status: 'done' },
        error: null,
        finishedAt: new Date(),
        progress: { stage: 'done', logs: [{ line: `[DRAFT] SUCCESS: Article #${articleId} created`, ts: Date.now() }] },
        updatedAt: new Date(),
      }).where(eq(appJobs.id, jobId));
    });
  } catch (error) {
    await deps.step.do('finalize_error', async () => {
      const errMsg = getErrorMessage(error);
      await db.update(appJobs).set({
        status: 'error',
        error: errMsg,
        finishedAt: new Date(),
        progress: { stage: 'error', logs: [{ line: `[DRAFT] FAILED: ${errMsg}`, ts: Date.now() }] },
        updatedAt: new Date(),
      }).where(eq(appJobs.id, jobId));

      // Revert gap status to 'new' so user can retry
      await db.update(contentGaps).set({ status: 'new' }).where(eq(contentGaps.id, gapId));
    });
    throw error;
  }
}

export interface DraftWorkflowBinding extends Pick<CloudflareWorkflow<DraftWorkflowMessage>, 'create'> {}

export async function startDraftWorkflow(binding: DraftWorkflowBinding, message: DraftWorkflowMessage) {
  return binding.create({ id: `job-${message.jobId}`, params: message });
}

export class DraftWorkflow extends WorkflowEntrypoint<DraftWorkflowEnv> {
  async run(event: CloudflareWorkflowEvent<DraftWorkflowMessage>, step: WorkflowStepLike) {
    initWorkflowDb(this.env as unknown as Record<string, unknown>);
    return executeDraftWorkflow(event.payload, { env: this.env, step });
  }
}
