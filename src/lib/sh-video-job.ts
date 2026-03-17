/**
 * sh-video-job.ts — Server-side singleton SocialHub video render job manager.
 *
 * Mirrors bc-scrape-job.ts architecture: Singleton EventEmitter, survives Vite HMR.
 * Spawns scripts/sh-video-render.ts as a child process.
 * One job at a time — only one video render can run simultaneously.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

export type ShVideoJobStatus = 'idle' | 'running' | 'done' | 'error';

export interface ShVideoLogEntry {
  line: string;
  ts: number;
}

export interface ShVideoJobSnapshot {
  status: ShVideoJobStatus;
  briefId: number | null;
  copyId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  predictionId: string | null;
  videoUrl: string | null;
  lines: ShVideoLogEntry[];
}

const MAX_LINES = 8_000;

class ShVideoJobManager extends EventEmitter {
  private _status: ShVideoJobStatus = 'idle';
  private _briefId: number | null = null;
  private _copyId: number | null = null;
  private _startedAt: number | null = null;
  private _finishedAt: number | null = null;
  private _exitCode: number | null = null;
  private _predictionId: string | null = null;
  private _videoUrl: string | null = null;
  private _lines: ShVideoLogEntry[] = [];
  private _child: ReturnType<typeof spawn> | null = null;

  getSnapshot(): ShVideoJobSnapshot {
    return {
      status: this._status,
      briefId: this._briefId,
      copyId: this._copyId,
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
      exitCode: this._exitCode,
      predictionId: this._predictionId,
      videoUrl: this._videoUrl,
      lines: this._lines.slice(),
    };
  }

  isRunning(): boolean {
    return this._status === 'running';
  }

  stop(): boolean {
    if (this._status !== 'running' || !this._child) return false;
    const entry: ShVideoLogEntry = { line: '[SH] Aborted by user', ts: Date.now() };
    if (this._lines.length < MAX_LINES) this._lines.push(entry);
    this.emit('line', entry);
    this._child.kill('SIGTERM');
    return true;
  }

  start(
    briefId: number,
    copyId: number,
    extraEnv: Record<string, string> = {},
  ): { ok: boolean; reason?: string } {
    if (this._status === 'running') {
      return { ok: false, reason: 'SocialHub video render already running' };
    }

    this._status = 'running';
    this._briefId = briefId;
    this._copyId = copyId;
    this._startedAt = Date.now();
    this._finishedAt = null;
    this._exitCode = null;
    this._predictionId = null;
    this._videoUrl = null;
    this._lines = [];

    this.emit('start');

    const child = this._child = spawn('npx', ['tsx', 'scripts/sh-video-render.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SH_BRIEF_ID: String(briefId),
        SH_COPY_ID: String(copyId),
        ...extraEnv,
      },
      shell: true,
    });

    let buf = '';

    const pushLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;

      // Extract structured protocol tokens — don't echo raw token lines to the log
      if (line.startsWith('SH_TTS_DONE:')) {
        this.emit('ttsDone');
        return;
      }

      if (line.startsWith('SH_VIDEO_SUBMITTED:')) {
        this._predictionId = line.substring('SH_VIDEO_SUBMITTED:'.length).trim();
        this.emit('videoSubmitted', { predictionId: this._predictionId });
        return;
      }

      if (line.startsWith('SH_RENDER_DONE:')) {
        this._videoUrl = line.substring('SH_RENDER_DONE:'.length).trim();
        this.emit('renderDone', { videoUrl: this._videoUrl });
        return;
      }

      if (line.startsWith('SH_ERROR:')) {
        const message = line.substring('SH_ERROR:'.length).trim();
        this.emit('renderError', { message });
        // Also push as a visible log line so the UI shows the error
      }

      const entry: ShVideoLogEntry = { line, ts: Date.now() };
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
      const entry: ShVideoLogEntry = { line: `[SH] Process error: ${err.message}`, ts: Date.now() };
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
  var __frinter_sh_video_job: ShVideoJobManager | undefined;
}

export const shVideoJob: ShVideoJobManager =
  globalThis.__frinter_sh_video_job ??
  (globalThis.__frinter_sh_video_job = new ShVideoJobManager());
