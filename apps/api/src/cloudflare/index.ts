import { readApiEnv, type ApiEnv } from './env.ts';
import { routeRequest } from './router.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

const worker = {
  async fetch(request: Request, env: Partial<ApiEnv>): Promise<Response> {
    try {
      return await routeRequest(request, readApiEnv(env));
    } catch (error) {
      return json(500, {
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

export default worker;
