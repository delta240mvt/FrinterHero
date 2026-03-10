/**
 * draft-job.ts — Server-side singleton Draft Generation job manager.
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { db } from '@/db/client';
import { contentGaps } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
  canAbort: boolean;
  lines: DraftLogEntry[];
}

class DraftJobManager extends EventEmitter {
  private _status: JobStatus = 'idle';
  private _gapId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _lines: DraftLogEntry[] = [];
  private _result: any | null = null;
  private _child: any | null = null;

  getSnapshot(): DraftSnapshot {
    return {
      status: this._status,
      gapId: this._gapId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      result: this._result,
      canAbort: this._status === 'running',
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

    // Use npx tsx directly on the bridge script file to avoid shell escaping issues
    this._child = spawn('npx', ['tsx', 'scripts/draft-bridge.ts'], {
      cwd: process.cwd(),
      env: { 
        ...process.env, 
        GAP_ID: String(gapId),
        MODEL: model,
        AUTHOR_NOTES: authorNotes
      },
      shell: true,
    });

    let bufArr = '';
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

    this._child.stdout.on('data', (c: Buffer) => {
      bufArr += c.toString();
      const parts = bufArr.split('\n');
      bufArr = parts.pop() ?? '';
      parts.forEach(pushLine);
    });

    this._child.stderr.on('data', (c: Buffer) => {
      bufArr += c.toString();
      const parts = bufArr.split('\n');
      bufArr = parts.pop() ?? '';
      parts.forEach(pushLine);
    });

    this._child.on('close', (code: number) => {
      if (bufArr.trim()) pushLine(bufArr);
      const wasGapId = this._gapId;
      this._status = code === 0 ? 'done' : 'error';
      this._finishedAt = Date.now();
      const exitMsg = code === 0 ? '[DRAFT] Process completed successfully.' : `[DRAFT] Process exited with code ${code}`;
      pushLine(exitMsg);

      // If failed, revert DB status
      if (code !== 0 && wasGapId) {
        db.update(contentGaps).set({ status: 'new' }).where(eq(contentGaps.id, wasGapId))
          .catch(e => console.error("[DRAFT] Revert status error:", e));
      }

      this._child = null;
      this.emit('done', { code });
    });

    this._child.on('error', (err: Error) => {
      pushLine(`[DRAFT] Process error: ${err.message}`);
      this._status = 'error';
      this._finishedAt = Date.now();
      this._child = null;
      this.emit('done', { code: -1 });
    });

    return { ok: true };
  }

  stop(): boolean {
    if (this._child) {
      if (typeof this._child.kill === 'function') {
        this._child.kill('SIGTERM');
      }
      
      const gapId = this._gapId;
      if (gapId) {
        db.update(contentGaps).set({ status: 'new' }).where(eq(contentGaps.id, gapId))
          .catch(e => console.error("[DRAFT] Failed to revert status on stop:", e));
      }

      this._status = 'idle';
      this._child = null;
      const entry: DraftLogEntry = { line: '[DRAFT] Process aborted by user.', ts: Date.now() };
      this._lines.push(entry);
      this.emit('line', entry);
      return true;
    }
    return false;
  }
}

declare global {
  var __frinter_draft_job: DraftJobManager | undefined;
}

export const draftJob: DraftJobManager =
  globalThis.__frinter_draft_job ??
  (globalThis.__frinter_draft_job = new DraftJobManager());
