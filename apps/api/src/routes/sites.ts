import type { RouteContext } from '../helpers.js';
import { json, getSiteBySlug } from '../helpers.js';

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { res, method, segments } = ctx;

  if (method === 'GET' && segments[0] === 'v1' && segments[1] === 'sites' && segments[3] === 'public-config') {
    const site = segments[2] ? await getSiteBySlug(segments[2]) : null;
    if (!site) return json(res, 404, { error: 'Site not found' }), true;
    json(res, 200, {
      slug: site.slug,
      status: site.status,
      displayName: site.displayName,
      primaryDomain: site.primaryDomain,
      brandConfig: site.brandConfig,
      seoConfig: site.seoConfig,
      featureFlags: site.featureFlags,
      llmContext: site.llmContext,
    });
    return true;
  }

  return false;
}
