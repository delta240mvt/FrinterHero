import type { JobExecutionContext } from './job-payloads.ts';

export interface WorkflowSuccessResult<TResult = unknown> extends JobExecutionContext {
  status: 'completed';
  result: TResult;
}

export interface WorkflowFailureResult extends JobExecutionContext {
  status: 'failed';
  error: string;
  retryable: boolean;
}

export function buildWorkflowSuccessResult<TResult>(
  input: JobExecutionContext & { result: TResult },
): WorkflowSuccessResult<TResult> {
  return {
    ...input,
    status: 'completed',
  };
}

export function buildWorkflowFailureResult(
  input: JobExecutionContext & { error: string; retryable?: boolean },
): WorkflowFailureResult {
  return {
    ...input,
    retryable: input.retryable ?? false,
    status: 'failed',
  };
}
