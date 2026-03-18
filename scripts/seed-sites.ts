import dotenv from 'dotenv';
import { db } from '../src/db/client';
import { sites } from '../src/db/schema';
import { DEFAULT_SITE_CONFIGS } from '../packages/site-config/src/default-site-config';

dotenv.config({ path: '.env.local' });

async function main() {
  for (const site of DEFAULT_SITE_CONFIGS) {
    await db
      .insert(sites)
      .values({
        slug: site.slug,
        displayName: site.displayName,
        primaryDomain: site.primaryDomain,
        brandConfig: site.brandConfig,
        seoConfig: site.seoConfig,
        featureFlags: site.featureFlags,
        llmContext: site.llmContext,
      })
      .onConflictDoUpdate({
        target: sites.slug,
        set: {
          displayName: site.displayName,
          primaryDomain: site.primaryDomain,
          brandConfig: site.brandConfig,
          seoConfig: site.seoConfig,
          featureFlags: site.featureFlags,
          llmContext: site.llmContext,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`[seed-sites] synced ${DEFAULT_SITE_CONFIGS.length} site records`);
}

main().catch((error) => {
  console.error('[seed-sites] failed', error);
  process.exit(1);
});
