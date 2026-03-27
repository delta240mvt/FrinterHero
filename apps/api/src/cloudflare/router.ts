import type { ApiEnv } from './env.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export async function routeRequest(request: Request, _env?: ApiEnv): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, {
      path: url.pathname,
      service: 'api',
      status: 'ok',
    });
  }

  return json(404, {
    error: 'Not found',
    method: request.method,
    pathname: url.pathname,
  });
}
