export type DbRuntime = 'node' | 'cloudflare';

export function selectDbRuntime(env: Record<string, string | undefined>): DbRuntime {
  return env.CF_PAGES || env.CLOUDFLARE_ACCOUNT_ID || env.WORKERS_RS ? 'cloudflare' : 'node';
}
