import { initCloudflareDb } from '../../../../../src/db/client.ts';

/**
 * Initialises the Cloudflare DB for a workflow run.
 *
 * Workflows execute in their own isolate, independent of the Hono HTTP
 * request pipeline where `initCloudflareDb` is normally called. This helper
 * must be called at the very start of every `WorkflowEntrypoint.run()` method
 * so that `getCloudflareDb()` works inside the workflow steps.
 */
export function initWorkflowDb(env: Record<string, unknown>): void {
  const databaseUrl = env.DATABASE_URL as string | undefined;
  const hyperdrive = env.HYPERDRIVE as unknown;
  if (databaseUrl) {
    initCloudflareDb(hyperdrive, databaseUrl);
  }
}
