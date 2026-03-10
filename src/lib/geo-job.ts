/**
 * geo-job.ts — Server-side singleton GEO Monitor job manager.
 *
 * Lives for the entire lifetime of the Node.js process.
 * Uses globalThis to survive Vite HMR re-imports in dev mode.
 *
 * Usage:
 *   import { geoJob } from '@/lib/geo-job';
 *   geoJob.start()                      // spawn the child process
 *   geoJob.getSnapshot()                // get current state + all log lines
 *   geoJob.on('line', cb)               // subscribe to new log lines
 *   geoJob.on('done', cb)               // subscribe to job completion
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export const GEO_TOTAL_STEPS = 138; // 46 queries × 3 models
const MAX_LINES = 8_000;

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export interface GeoLogEntry {
  line: string;
  ts: number;
}

export interface GeoSnapshot {
  status: JobStatus;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  queryCount: number;
  totalSteps: number;
  progress: number;     // 0-100
  lines: GeoLogEntry[]; // full log history
}

class GeoJobManager extends EventEmitter {
  private _status: JobStatus = 'idle';
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _queryCount = 0;
  private _lines: GeoLogEntry[] = [];

  getSnapshot(): GeoSnapshot {
    return {
      status:     this._status,
      startedAt:  this._startedAt,
      finishedAt: this._finishedAt,
      exitCode:   this._exitCode,
      queryCount: this._queryCount,
      totalSteps: GEO_TOTAL_STEPS,
      progress:   this._status === 'done' || this._status === 'error'
                    ? 100
                    : Math.min(90, Math.round((this._queryCount / GEO_TOTAL_STEPS) * 90)),
      lines:      this._lines.slice(), // shallow copy
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  /** Start the GEO monitor job. Returns { ok: false } if already running. */
  start(): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'Job already running' };
    }

    // Reset state
    this._status     = 'running';
    this._startedAt  = Date.now();
    this._finishedAt = null;
    this._exitCode   = null;
    this._queryCount = 0;
    this._lines      = [];

    this.emit('start');

    const child = spawn('npx', ['tsx', 'scripts/geo-monitor.ts'], {
      cwd:   process.cwd(),
      env:   process.env,
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      const entry: GeoLogEntry = { line, ts: Date.now() };

      if (this._lines.length < MAX_LINES) {
        this._lines.push(entry);
      }

      if (line.includes('[GEO] Querying')) {
        this._queryCount++;
      }

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
      this._status     = code === 0 ? 'done' : 'error';
      this._exitCode   = code;
      this._finishedAt = Date.now();
      this.emit('done', { code });
    });

    child.on('error', (err) => {
      const entry: GeoLogEntry = { line: `[GEO] Process error: ${err.message}`, ts: Date.now() };
      if (this._lines.length < MAX_LINES) this._lines.push(entry);
      this._status     = 'error';
      this._exitCode   = -1;
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
  var __frinter_geo_job: GeoJobManager | undefined;
}

export const geoJob: GeoJobManager =
  globalThis.__frinter_geo_job ??
  (globalThis.__frinter_geo_job = new GeoJobManager());
