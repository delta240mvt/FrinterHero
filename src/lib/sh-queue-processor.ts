/**
 * sh-queue-processor.ts — Social Hub Queue processor.
 *
 * Processes sh_queue items sequentially (highest priority first, then oldest first).
 * Delegates copy generation to ShCopywriterJobManager and waits for completion.
 * One queue run at a time — isProcessing flag prevents concurrent runs.
 */

import { db } from '../db/client';
import { shQueue, shContentBriefs } from '../db/schema';
import { eq, and, desc, asc, inArray, or, sql } from 'drizzle-orm';
import { shCopywriterJob } from './sh-copywriter-job';

// ── Processing state (survives HMR via globalThis) ───────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __frinter_sh_queue_processing: boolean | undefined;
  // eslint-disable-next-line no-var
  var __frinter_sh_queue_stop_requested: boolean | undefined;
}

function isProcessing(): boolean {
  return globalThis.__frinter_sh_queue_processing === true;
}

function setProcessing(val: boolean): void {
  globalThis.__frinter_sh_queue_processing = val;
}

function isStopRequested(): boolean {
  return globalThis.__frinter_sh_queue_stop_requested === true;
}

export function requestStop(): void {
  globalThis.__frinter_sh_queue_stop_requested = true;
}

export function clearStopRequest(): void {
  globalThis.__frinter_sh_queue_stop_requested = false;
}

// ── Core queue operations ────────────────────────────────────────────────────

/**
 * Add a brief to the queue. Returns the new queue item id.
 * If the brief is already pending/processing in the queue, returns the existing id.
 */
export async function addToQueue(briefId: number, priority = 50): Promise<number> {
  // Check for existing active entry to avoid duplicates
  const existing = await db
    .select({ id: shQueue.id })
    .from(shQueue)
    .where(
      and(
        eq(shQueue.briefId, briefId),
        or(eq(shQueue.status, 'pending'), eq(shQueue.status, 'processing')),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [inserted] = await db
    .insert(shQueue)
    .values({ briefId, priority, status: 'pending' })
    .returning({ id: shQueue.id });

  return inserted.id;
}

/**
 * Returns counts and full item list (with brief info joined).
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  done: number;
  failed: number;
  isProcessing: boolean;
  items: any[];
}> {
  // Counts by status
  const countRows = await db
    .select({ status: shQueue.status, cnt: sql<number>`count(*)::int` })
    .from(shQueue)
    .groupBy(shQueue.status);

  const countMap: Record<string, number> = {};
  for (const row of countRows) countMap[row.status] = row.cnt;

  // Items with brief info (last 200, newest first)
  const items = await db
    .select({
      id: shQueue.id,
      briefId: shQueue.briefId,
      priority: shQueue.priority,
      status: shQueue.status,
      processedAt: shQueue.processedAt,
      errorMessage: shQueue.errorMessage,
      createdAt: shQueue.createdAt,
      sourceType: shContentBriefs.sourceType,
      sourceTitle: shContentBriefs.sourceTitle,
      outputFormat: shContentBriefs.outputFormat,
    })
    .from(shQueue)
    .leftJoin(shContentBriefs, eq(shContentBriefs.id, shQueue.briefId))
    .orderBy(desc(shQueue.createdAt))
    .limit(200);

  return {
    pending: countMap['pending'] ?? 0,
    processing: countMap['processing'] ?? 0,
    done: countMap['done'] ?? 0,
    failed: countMap['failed'] ?? 0,
    isProcessing: isProcessing(),
    items: items.map(r => ({
      id: r.id,
      briefId: r.briefId,
      priority: r.priority,
      status: r.status,
      processedAt: r.processedAt?.toISOString() ?? null,
      errorMessage: r.errorMessage ?? null,
      createdAt: r.createdAt.toISOString(),
      sourceType: r.sourceType ?? null,
      sourceTitle: r.sourceTitle ?? null,
      outputFormat: r.outputFormat ?? null,
    })),
  };
}

/**
 * Delete all done/failed items from the queue.
 */
export async function clearQueue(): Promise<void> {
  await db
    .delete(shQueue)
    .where(or(eq(shQueue.status, 'done'), eq(shQueue.status, 'failed')));
}

/**
 * Remove a single queue item by id (any status).
 */
export async function removeQueueItem(id: number): Promise<void> {
  await db.delete(shQueue).where(eq(shQueue.id, id));
}

/**
 * Update priority of a queue item.
 */
export async function reprioritizeQueueItem(id: number, priority: number): Promise<void> {
  await db.update(shQueue).set({ priority }).where(eq(shQueue.id, id));
}

// ── Sequential processor ─────────────────────────────────────────────────────

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per job

/**
 * Process the next pending queue item.
 * Triggers ShCopywriterJobManager and waits up to TIMEOUT_MS for completion.
 */
export async function processNextQueueItem(): Promise<{
  processed: boolean;
  briefId?: number;
  error?: string;
}> {
  if (isProcessing()) {
    return { processed: false, error: 'Already processing' };
  }

  // Find next pending item: highest priority first, then oldest first
  const [next] = await db
    .select()
    .from(shQueue)
    .where(eq(shQueue.status, 'pending'))
    .orderBy(desc(shQueue.priority), asc(shQueue.createdAt))
    .limit(1);

  if (!next) {
    return { processed: false };
  }

  // Mark as processing
  await db
    .update(shQueue)
    .set({ status: 'processing' })
    .where(eq(shQueue.id, next.id));

  setProcessing(true);
  clearStopRequest();

  try {
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      // If copywriter is already running for a different brief, fail immediately
      if (shCopywriterJob.isRunning()) {
        resolve({ ok: false, error: 'Copywriter already running another job' });
        return;
      }

      const startResult = shCopywriterJob.start(next.briefId);
      if (!startResult.ok) {
        resolve({ ok: false, error: startResult.reason });
        return;
      }

      const timeout = setTimeout(() => {
        shCopywriterJob.stop();
        resolve({ ok: false, error: 'Timeout after 5 minutes' });
      }, TIMEOUT_MS);

      shCopywriterJob.once('done', ({ code }: { code: number | null }) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `Copywriter exited with code ${code}` });
        }
      });
    });

    if (result.ok) {
      await db
        .update(shQueue)
        .set({ status: 'done', processedAt: new Date(), errorMessage: null })
        .where(eq(shQueue.id, next.id));
    } else {
      await db
        .update(shQueue)
        .set({ status: 'failed', processedAt: new Date(), errorMessage: result.error ?? 'Unknown error' })
        .where(eq(shQueue.id, next.id));
    }

    return { processed: true, briefId: next.briefId, error: result.error };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await db
      .update(shQueue)
      .set({ status: 'failed', processedAt: new Date(), errorMessage: msg })
      .where(eq(shQueue.id, next.id));
    return { processed: true, briefId: next.briefId, error: msg };
  } finally {
    setProcessing(false);
  }
}

/**
 * Run the full queue until empty or stop is requested.
 * Call this from a PUT /api/social-hub/queue { action: 'start' } handler.
 * Runs asynchronously — does not block the HTTP response.
 */
export async function runQueue(): Promise<void> {
  if (isProcessing()) return;

  clearStopRequest();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (isStopRequested()) break;

    const result = await processNextQueueItem();

    // No more pending items
    if (!result.processed && !result.error) break;

    // Brief pause between items to avoid hammering the DB
    await new Promise(r => setTimeout(r, 200));
  }
}
