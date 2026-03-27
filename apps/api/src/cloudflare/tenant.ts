import {
  getTenantHostEntries,
  normalizeHostname,
  type CloudflareSiteSlug,
  type TenantHostBindings,
} from '../../../../src/lib/cloudflare/bindings.ts';

export interface ResolvedTenantRequest {
  hostname: string;
  siteSlug: CloudflareSiteSlug;
}

export function resolveTenantRequest(url: URL, bindings: TenantHostBindings): ResolvedTenantRequest {
  const hostname = normalizeHostname(url.hostname);
  const match = getTenantHostEntries(bindings).find((entry) => entry.hostname === hostname);

  if (!match) {
    throw new Error(`Unknown tenant host: ${hostname}`);
  }

  return {
    hostname,
    siteSlug: match.siteSlug,
  };
}
