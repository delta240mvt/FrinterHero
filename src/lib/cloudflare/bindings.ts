import type { SiteSlug } from '../../../packages/site-config/src/index';

export type CloudflareSiteSlug = SiteSlug;
export type TenantHostBindingName = 'FRINTER_HOST' | 'FOCUS_HOST' | 'PRZEM_HOST';

export interface TenantHostBindings {
  FRINTER_HOST: string;
  FOCUS_HOST: string;
  PRZEM_HOST: string;
}

export interface CloudflareQueueBinding<Message = unknown> {
  send?: (message: Message, options?: unknown) => Promise<void> | void;
}

export interface CloudflareApiBindings extends TenantHostBindings {
  APP_ENV: string;
  API_BASE_URL: string;
  HYPERDRIVE: unknown;
  ASSETS_BUCKET: unknown;
  JOB_QUEUE: CloudflareQueueBinding;
}

export interface TenantHostEntry {
  binding: TenantHostBindingName;
  hostname: string;
  siteSlug: CloudflareSiteSlug;
}

export const REQUIRED_CLOUDFLARE_BINDINGS = ['HYPERDRIVE', 'ASSETS_BUCKET', 'JOB_QUEUE'] as const;
export const REQUIRED_CLOUDFLARE_VARS = [
  'APP_ENV',
  'API_BASE_URL',
  'FRINTER_HOST',
  'FOCUS_HOST',
  'PRZEM_HOST',
] as const;

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

export function getTenantHostEntries(bindings: TenantHostBindings): TenantHostEntry[] {
  return [
    {
      binding: 'FRINTER_HOST',
      hostname: normalizeHostname(bindings.FRINTER_HOST),
      siteSlug: 'frinter',
    },
    {
      binding: 'FOCUS_HOST',
      hostname: normalizeHostname(bindings.FOCUS_HOST),
      siteSlug: 'focusequalsfreedom',
    },
    {
      binding: 'PRZEM_HOST',
      hostname: normalizeHostname(bindings.PRZEM_HOST),
      siteSlug: 'przemyslawfilipiak',
    },
  ];
}
