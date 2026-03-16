/**
 * bc-lp-gen-job.ts — Singleton LP generation job manager.
 * Mirrors bc-scrape-job.ts: survives Vite HMR, fire-and-forget spawn.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type BcGenJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface BcGenLogEntry {
  line: string;
  ts: number;
}

export interface BcGenSnapshot {
  status: BcGenJobStatus;
  projectId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  variantsGenerated: number;
  lines: BcGenLogEntry[];
}

const MAX_LINES = 4_000;

class BcLpGenJobManager extends EventEmitter {
  private _status: BcGenJobStatus = 'idle';
  private _projectId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _variantsGenerated = 0;
  private _lines: BcGenLogEntry[] = [];
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): BcGenSnapshot {
    return {
      status: this._status,
      projectId: this._projectId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      variantsGenerated: this._variantsGenerated,
      lines: this._lines.slice(),
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  start(projectId: number, extraEnv: Record<string, string> = {}): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'LP generation already running' };
    }

    this._status = 'running';
    this._projectId = projectId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._variantsGenerated = 0;
    this._lines = [];

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/bc-lp-generator.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BC_PROJECT_ID: String(projectId), ...extraEnv },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      if (line.startsWith('VARIANTS_GENERATED:')) {
        this._variantsGenerated = parseInt(line.split(':')[1], 10) || 0;
        this.emit('progress', { variantsGenerated: this._variantsGenerated });
        return; // don't push to log
      }

      const entry: BcGenLogEntry = { line, ts: Date.now() };
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
      this.emit('done', { code, variantsGenerated: this._variantsGenerated });
    });

    child.on('error', (err) => {
      const entry: BcGenLogEntry = { line: `[BC-LP-GEN] Process error: ${err.message}`, ts: Date.now() };
      if (this._lines.length < MAX_LINES) this._lines.push(entry);
      this._status = 'error';
      this._exitCode = -1;
      this._finishedAt = Date.now();
      this.emit('line', entry);
      this.emit('done', { code: -1, variantsGenerated: this._variantsGenerated });
    });

    return { ok: true };
  }
}

// ── Singleton via globalThis (survives Vite HMR re-imports) ──────────────────

declare global {
  // eslint-disable-next-line no-var
  var __frinter_bc_lp_gen_job: BcLpGenJobManager | undefined;
}

export const bcLpGenJob: BcLpGenJobManager =
  globalThis.__frinter_bc_lp_gen_job ??
  (globalThis.__frinter_bc_lp_gen_job = new BcLpGenJobManager());
