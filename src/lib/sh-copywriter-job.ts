/**
 * sh-copywriter-job.ts — Server-side singleton Social Hub copywriter job manager.
 *
 * Mirrors bc-scrape-job.ts architecture: Singleton EventEmitter, survives Vite HMR.
 * Spawns scripts/sh-copywriter.ts as a child process.
 * One job at a time — only one brief can be copy-generated at a time.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type ShCopywriterJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface ShCopywriterLogEntry {
  line: string;
  ts: number;
}

export interface ShCopywriterSnapshot {
  status: ShCopywriterJobStatus;
  briefId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  variantsCreated: number;
  lines: ShCopywriterLogEntry[];
  result: any | null;
}

const MAX_LINES = 8_000;

class ShCopywriterJobManager extends EventEmitter {
  private _status: ShCopywriterJobStatus = 'idle';
  private _briefId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _variantsCreated = 0;
  private _lines: ShCopywriterLogEntry[] = [];
  private _result: any | null = null;
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): ShCopywriterSnapshot {
    return {
      status: this._status,
      briefId: this._briefId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      variantsCreated: this._variantsCreated,
      lines: this._lines.slice(),
      result: this._result,
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  stop(): boolean {
    if (this._status !== 'running' || !this._child) return false;
    const entry: ShCopywriterLogEntry = { line: '[SH] Aborted by user', ts: Date.now() };
    if (this._lines.length < MAX_LINES) this._lines.push(entry);
    this.emit('line', entry);
    this._child.kill('SIGTERM');
    return true;
  }

  start(briefId: number, extraEnv: Record<string, string> = {}): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'Social Hub copywriter already running' };
    }

    this._status = 'running';
    this._briefId = briefId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._variantsCreated = 0;
    this._lines = [];
    this._result = null;

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/sh-copywriter.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SH_BRIEF_ID: String(briefId),
        ...extraEnv,
      },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      if (line.startsWith('variantsCreated:')) {
        this._variantsCreated = parseInt(line.split(':')[1], 10) || 0;
        this.emit('progress', { variantsCreated: this._variantsCreated });
      }

      if (line.startsWith('RESULT_JSON:')) {
        try { this._result = JSON.parse(line.substring(12)); } catch {}
        return;
      }

      if (line.startsWith('SH_ERROR:')) {
        this._result = { error: line.substring(9).trim() };
      }

      const entry: ShCopywriterLogEntry = { line, ts: Date.now() };
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
      const entry: ShCopywriterLogEntry = { line: `[SH] Process error: ${err.message}`, ts: Date.now() };
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
  var __frinter_sh_copywriter_job: ShCopywriterJobManager | undefined;
}

export const shCopywriterJob: ShCopywriterJobManager =
  globalThis.__frinter_sh_copywriter_job ??
  (globalThis.__frinter_sh_copywriter_job = new ShCopywriterJobManager());
