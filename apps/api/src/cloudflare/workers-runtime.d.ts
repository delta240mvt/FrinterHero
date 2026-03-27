interface CloudflareWorkflow<TParams = unknown> {
  create(options: { id?: string; params: TParams }): Promise<unknown>;
}

interface CloudflareWorkflowEvent<TParams = unknown> {
  payload: TParams;
}

interface CloudflareWorkflowStep {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  do<T>(name: string, options: unknown, callback: () => Promise<T>): Promise<T>;
}

declare abstract class WorkflowEntrypoint<TEnv = unknown, TParams = unknown> {
  protected readonly env: TEnv;

  constructor(ctx: unknown, env: TEnv);

  abstract run(
    event: CloudflareWorkflowEvent<TParams>,
    step: CloudflareWorkflowStep,
  ): Promise<unknown>;
}
