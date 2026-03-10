/**
 * draft-job.ts — Server-side singleton Draft Generation job manager.
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export interface DraftLogEntry {
  line: string;
  ts: number;
}

export interface DraftSnapshot {
  status: JobStatus;
  gapId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  result: any | null;
  lines: DraftLogEntry[];
}

class DraftJobManager extends EventEmitter {
  private _status: JobStatus = 'idle';
  private _gapId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _lines: DraftLogEntry[] = [];
  private _result: any | null = null;

  getSnapshot(): DraftSnapshot {
    return {
      status: this._status,
      gapId: this._gapId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      result: this._result,
      lines: this._lines.slice(),
    };
  }

  start(gapId: number, authorNotes: string, model: string): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'Another draft is already being generated' };
    }

    this._status = 'running';
    this._gapId = gapId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._lines = [];
    this._result = null;

    this.emit('start', { gapId });

    // We'll use a wrapper script or npx tsx directly on a small bridge script
    // to call the generateDraft function and log everything to stdout
    const args = [
      'tsx',
      '-e',
      `
      import { generateDraft } from './scripts/draft-generator';
      import { db } from './src/db/client';
      import { articles, articleGenerations } from './src/db/schema';
      const gapId = ${gapId};
      const model = "${model}";
      const notes = ${JSON.stringify(authorNotes)};
      
      async function run() {
        console.log("[DRAFT] Initializing generation for Gap #" + gapId + "...");
        try {
          const result = await generateDraft({ gap_id: gapId, author_notes: notes, model });
          if (!result.success || !result.draft) {
            console.error("[DRAFT] FAILED: " + (result.error?.message || "Unknown error"));
            process.exit(1);
          }
          
          console.log("[DRAFT] Validation passed. Saving to database...");
          const now = new Date();
          const uniqueSlug = result.slug + "-" + Date.now();
          
          const [article] = await db.insert(articles).values({
            slug: uniqueSlug,
            title: result.draft.title,
            description: result.draft.description,
            content: result.htmlContent || '',
            tags: result.draft.tags,
            status: 'draft',
            readingTime: result.readingTime || 5,
            author: 'Przemysław Filipiak',
            sourceGapId: gapId,
            generatedByModel: model,
            generationTimestamp: now,
          }).returning();

          await db.insert(articleGenerations).values({
            articleId: article.id,
            gapId: gapId,
            generatedByModel: model,
            generationPrompt: result.megaPrompt || '',
            originalContent: result.draft.content,
            authorNotes: notes,
            kbEntriesUsed: result.kbEntriesUsed || [],
            modelsQueried: [model],
            generationTimestamp: now,
          });

          console.log("[DRAFT] SUCCESS: Created Article ID " + article.id);
          console.log("RESULT_JSON:" + JSON.stringify({ article_id: article.id, title: result.draft.title }));
        } catch (err) {
          console.error("[DRAFT] CRITICAL ERROR: " + err.message);
          process.exit(1);
        }
      }
      run();
      `
    ];

    const child = spawn('npx', args, {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
    });

    let buf = '';
    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      
      if (line.startsWith('RESULT_JSON:')) {
         try {
           this._result = JSON.parse(line.substring(12));
         } catch {}
         return;
      }

      const entry: DraftLogEntry = { line, ts: Date.now() };
      this._lines.push(entry);
      this.emit('line', entry);
    };

    child.stdout.on('data', (c) => {
      buf += c.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      parts.forEach(pushLine);
    });

    child.stderr.on('data', (c) => {
      buf += c.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      parts.forEach(pushLine);
    });

    child.on('close', (code) => {
      if (buf.trim()) pushLine(buf);
      this._status = code === 0 ? 'done' : 'error';
      this._finishedAt = Date.now();
      this.emit('done', { code });
    });

    return { ok: true };
  }
}

declare global {
  var __frinter_draft_job: DraftJobManager | undefined;
}

export const draftJob: DraftJobManager =
  globalThis.__frinter_draft_job ??
  (globalThis.__frinter_draft_job = new DraftJobManager());
