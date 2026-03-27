import type { ApiEnv } from '../env.ts';

export async function proxyToNodeApi(request: Request, env: ApiEnv): Promise<Response> {
  const nodeApiUrl = env.NODE_API_URL;
  if (!nodeApiUrl) {
    return new Response(JSON.stringify({ error: 'NODE_API_URL not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const targetUrl = `${nodeApiUrl}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', headers.get('cf-connecting-ip') || '');
  headers.set('x-forwarded-proto', 'https');

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    // Node 18+ undici requires duplex when sending a streaming body
    duplex: 'half',
  } as RequestInit);

  try {
    return await fetch(proxyRequest);
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Upstream API unavailable',
      detail: error instanceof Error ? error.message : String(error),
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
