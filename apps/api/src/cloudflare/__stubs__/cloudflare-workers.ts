// Stub for cloudflare:workers module used in Node.js test environment.
// In production, wrangler replaces this with the real CF runtime module.
export abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
  protected readonly env: TEnv;

  constructor(_ctx: unknown, env: TEnv) {
    this.env = env;
  }

  abstract run(event: unknown, step: unknown): Promise<unknown>;
}
