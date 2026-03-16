/**
 * bc-lp-parse-job.ts — Singleton LP parser job manager.
 *
 * Mirrors bc-scrape-job.ts architecture: Singleton EventEmitter, survives Vite HMR.
 * Spawns scripts/bc-lp-parser.ts as a child process and streams stdout/stderr.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type BcParseJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface BcParseLogEntry {
  line: string;
  ts: number;
}

export interface BcParseSnapshot {
  status: BcParseJobStatus;
  projectId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  lines: BcParseLogEntry[];
}

const MAX_LINES = 2_000;

class BcLpParseJobManager extends EventEmitter {
  private _status: BcParseJobStatus = 'idle';
  private _projectId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _lines: BcParseLogEntry[] = [];
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): BcParseSnapshot {
    return {
      status: this._status,
      projectId: this._projectId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      lines: this._lines.slice(),
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  start(projectId: number, extraEnv: Record<string, string> = {}): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'LP parser already running' };
    }

    this._status = 'running';
    this._projectId = projectId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._lines = [];

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/bc-lp-parser.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId), ...extraEnv },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      const entry: BcParseLogEntry = { line, ts: Date.now() };
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
      const entry: BcParseLogEntry = { line: `[ERROR] Process error: ${err.message}`, ts: Date.now() };
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
  var __frinter_bc_lp_parse_job: BcLpParseJobManager | undefined;
}

export const bcLpParseJob: BcLpParseJobManager =
  globalThis.__frinter_bc_lp_parse_job ??
  (globalThis.__frinter_bc_lp_parse_job = new BcLpParseJobManager());
