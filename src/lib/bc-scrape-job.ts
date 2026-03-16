/**
 * bc-scrape-job.ts — Server-side singleton Brand Clarity scrape job manager.
 *
 * Mirrors yt-scrape-job.ts architecture: Singleton EventEmitter, survives Vite HMR.
 * Spawns scripts/bc-scraper.ts as a child process.
 * One job per BC_PROJECT_ID — only one project can scrape at a time.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type BcJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface BcLogEntry {
  line: string;
  ts: number;
}

export interface BcScrapeSnapshot {
  status: BcJobStatus;
  projectId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  commentsCollected: number;
  painPointsExtracted: number;
  lines: BcLogEntry[];
  result: any | null;
}

const MAX_LINES = 8_000;

class BcScrapeJobManager extends EventEmitter {
  private _status: BcJobStatus = 'idle';
  private _projectId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _commentsCollected = 0;
  private _painPointsExtracted = 0;
  private _lines: BcLogEntry[] = [];
  private _result: any | null = null;
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): BcScrapeSnapshot {
    return {
      status: this._status,
      projectId: this._projectId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      commentsCollected: this._commentsCollected,
      painPointsExtracted: this._painPointsExtracted,
      lines: this._lines.slice(),
      result: this._result,
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  stop(): boolean {
    if (this._status !== 'running' || !this._child) return false;
    const entry: BcLogEntry = { line: '[BC] Aborted by user', ts: Date.now() };
    if (this._lines.length < MAX_LINES) this._lines.push(entry);
    this.emit('line', entry);
    this._child.kill('SIGTERM');
    return true;
  }

  start(projectId: number, extraEnv: Record<string, string> = {}): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'Brand Clarity scrape already running' };
    }

    this._status = 'running';
    this._projectId = projectId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._commentsCollected = 0;
    this._painPointsExtracted = 0;
    this._lines = [];
    this._result = null;

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/bc-scraper.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BC_PROJECT_ID: String(projectId),
        ...extraEnv,
      },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      if (line.startsWith('commentsCollected:')) {
        this._commentsCollected = parseInt(line.split(':')[1], 10) || 0;
        this.emit('progress', { commentsCollected: this._commentsCollected, painPointsExtracted: this._painPointsExtracted });
      }
      if (line.startsWith('painPointsExtracted:')) {
        this._painPointsExtracted = parseInt(line.split(':')[1], 10) || 0;
        this.emit('progress', { commentsCollected: this._commentsCollected, painPointsExtracted: this._painPointsExtracted });
      }

      if (line.startsWith('RESULT_JSON:')) {
        try { this._result = JSON.parse(line.substring(12)); } catch {}
        return;
      }

      if (line.startsWith('QUOTA_EXCEEDED')) {
        this._result = { error: 'QUOTA_EXCEEDED' };
      }

      const entry: BcLogEntry = { line, ts: Date.now() };
      if (this._lines.length < MAX_LINES) this._lines.push(entry);
      this.emit('line', entry);
    };

    const onChunk = (chunk: Buffer) => {
      buf += chunk.toString();
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const l of parts) pushLine(l);
    };

    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    child.on('close', (code) => {
      if (buf.trim()) pushLine(buf);
      this._child = null;
      this._status = code === 0 ? 'done' : 'error';
      this._exitCode = code;
      this._finishedAt = Date.now();
      this.emit('done', { code });
    });

    child.on('error', (err) => {
      const entry: BcLogEntry = { line: `[BC] Process error: ${err.message}`, ts: Date.now() };
      if (this._lines.length < MAX_LINES) this._lines.push(entry);
      this._status = 'error';
      this._exitCode = -1;
      this._finishedAt = Date.now();
      this.emit('line', entry);
      this.emit('done', { code: -1 });
    });

    return { ok: true };
  }
}

// ── Singleton via globalThis (survives Vite HMR re-imports) ──────────────────

declare global {
  // eslint-disable-next-line no-var
  var __frinter_bc_scrape_job: BcScrapeJobManager | undefined;
}

export const bcScrapeJob: BcScrapeJobManager =
  globalThis.__frinter_bc_scrape_job ??
  (globalThis.__frinter_bc_scrape_job = new BcScrapeJobManager());
