/**
 * yt-scrape-job.ts — Server-side singleton YouTube scrape job manager.
 *
 * Mirrors reddit-scrape-job.ts architecture: Singleton EventEmitter, survives Vite HMR.
 * Spawns scripts/yt-scraper.ts as a child process.
 * The caller must INSERT INTO yt_scrape_runs BEFORE calling start() and pass the runId.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type YtJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface YtLogEntry {
  line: string;
  ts: number;
}

export interface YtScrapeSnapshot {
  status: YtJobStatus;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  commentsCollected: number;
  painPointsExtracted: number;
  currentTarget: string | null;
  lines: YtLogEntry[];
  result: any | null;
}

const MAX_LINES = 8_000;

class YtScrapeJobManager extends EventEmitter {
  private _status: YtJobStatus = 'idle';
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _commentsCollected = 0;
  private _painPointsExtracted = 0;
  private _currentTarget: string | null = null;
  private _lines: YtLogEntry[] = [];
  private _result: any | null = null;

  getSnapshot(): YtScrapeSnapshot {
    return {
      status: this._status,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      commentsCollected: this._commentsCollected,
      painPointsExtracted: this._painPointsExtracted,
      currentTarget: this._currentTarget,
      lines: this._lines.slice(),
      result: this._result,
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  start(targetIds: string[], runId: number): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'YouTube scrape job already running' };
    }

    // Reset state
    this._status = 'running';
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._commentsCollected = 0;
    this._painPointsExtracted = 0;
    this._currentTarget = null;
    this._lines = [];
    this._result = null;

    this.emit('start');

    const child = spawn('npx', ['tsx', 'scripts/yt-scraper.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SCRAPE_TARGET_IDS: targetIds.join(','),
        SCRAPE_RUN_ID: String(runId),
      },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      // Parse progress signals
      if (line.startsWith('commentsCollected:')) {
        this._commentsCollected = parseInt(line.split(':')[1], 10) || 0;
      }
      if (line.startsWith('painPointsExtracted:')) {
        this._painPointsExtracted = parseInt(line.split(':')[1], 10) || 0;
      }

      // Parse RESULT_JSON
      if (line.startsWith('RESULT_JSON:')) {
        try {
          this._result = JSON.parse(line.substring(12));
        } catch {}
        return; // Don't add RESULT_JSON to visible log
      }

      // Parse current target from log line
      const targetMatch = line.match(/\[YT\] Scraping: (.+)/);
      if (targetMatch) this._currentTarget = targetMatch[1];

      const entry: YtLogEntry = { line, ts: Date.now() };
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
      this._status = code === 0 ? 'done' : 'error';
      this._exitCode = code;
      this._finishedAt = Date.now();
      this._currentTarget = null;
      this.emit('done', { code });
    });

    child.on('error', (err) => {
      const entry: YtLogEntry = { line: `[YT] Process error: ${err.message}`, ts: Date.now() };
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
  var __frinter_yt_scrape_job: YtScrapeJobManager | undefined;
}

export const ytScrapeJob: YtScrapeJobManager =
  globalThis.__frinter_yt_scrape_job ??
  (globalThis.__frinter_yt_scrape_job = new YtScrapeJobManager());
