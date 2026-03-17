/**
 * bc-selector-job.ts — Singleton selector job manager.
 * Mirrors bc-lp-gen-job.ts: survives Vite HMR, fire-and-forget spawn.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type BcSelectorJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface BcSelectorLogEntry {
  line: string;
  ts: number;
}

export interface BcSelectorSnapshot {
  status: BcSelectorJobStatus;
  projectId: number | null;
  iterationId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  selectedCount: number;
  lines: BcSelectorLogEntry[];
}

const MAX_LINES = 2_000;

class BcSelectorJobManager extends EventEmitter {
  private _status: BcSelectorJobStatus = 'idle';
  private _projectId: number | null = null;
  private _iterationId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _selectedCount = 0;
  private _lines: BcSelectorLogEntry[] = [];
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): BcSelectorSnapshot {
    return {
      status: this._status,
      projectId: this._projectId,
      iterationId: this._iterationId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      selectedCount: this._selectedCount,
      lines: this._lines.slice(),
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  isRunningFor(iterationId: number): boolean {
    return this._status === 'running' && this._iterationId === iterationId;
  }

  start(projectId: number, iterationId: number, extraEnv: Record<string, string> = {}): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'Selection already running' };
    }

    this._status = 'running';
    this._projectId = projectId;
    this._iterationId = iterationId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._selectedCount = 0;
    this._lines = [];

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/bc-pain-selector.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BC_PROJECT_ID: String(projectId),
        BC_ITERATION_ID: String(iterationId),
        ...extraEnv,
      },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      if (line.startsWith('SELECTED:')) {
        this._selectedCount = parseInt(line.split(':')[1], 10) || 0;
        this.emit('progress', { selectedCount: this._selectedCount });
        return;
      }

      const entry: BcSelectorLogEntry = { line, ts: Date.now() };
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
      this.emit('done', { code, selectedCount: this._selectedCount });
    });

    child.on('error', (err) => {
      const entry: BcSelectorLogEntry = { line: `[BC-SELECTOR] Process error: ${err.message}`, ts: Date.now() };
      if (this._lines.length < MAX_LINES) this._lines.push(entry);
      this._status = 'error';
      this._exitCode = -1;
      this._finishedAt = Date.now();
      this.emit('line', entry);
      this.emit('done', { code: -1, selectedCount: this._selectedCount });
    });

    return { ok: true };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __frinter_bc_selector_job: BcSelectorJobManager | undefined;
}

export const bcSelectorJob: BcSelectorJobManager =
  globalThis.__frinter_bc_selector_job ??
  (globalThis.__frinter_bc_selector_job = new BcSelectorJobManager());
