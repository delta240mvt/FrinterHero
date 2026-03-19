import * as dotenv from 'dotenv';
import * as path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const DEFAULT_SITE_SLUG = process.env.SITE_SLUG || 'przemyslawfilipiak';

async function main() {
  const siteRows = await db.execute(sql`
    select id from sites where slug = ${DEFAULT_SITE_SLUG} limit 1
  `);
  const siteId = Number((siteRows as any).rows?.[0]?.id ?? 0);
  if (!siteId) {
    throw new Error(`Site not found for slug: ${DEFAULT_SITE_SLUG}`);
  }

  await db.execute(sql`update sh_settings set site_id = ${siteId} where site_id is null`);
  await db.execute(sql`update sh_social_accounts set site_id = ${siteId} where site_id is null`);
  await db.execute(sql`update sh_content_briefs set site_id = ${siteId} where site_id is null`);
  await db.execute(sql`
    update sh_generated_copy as copy
    set site_id = briefs.site_id
    from sh_content_briefs as briefs
    where copy.brief_id = briefs.id and copy.site_id is null
  `);
  await db.execute(sql`update sh_templates set site_id = ${siteId} where site_id is null`);
  await db.execute(sql`
    update sh_media_assets as assets
    set site_id = briefs.site_id
    from sh_content_briefs as briefs
    where assets.brief_id = briefs.id and assets.site_id is null
  `);
  await db.execute(sql`
    update sh_publish_log as publish_log
    set site_id = briefs.site_id
    from sh_content_briefs as briefs
    where publish_log.brief_id = briefs.id and publish_log.site_id is null
  `);
  await db.execute(sql`
    update sh_post_metrics as metrics
    set site_id = publish_log.site_id
    from sh_publish_log as publish_log
    where metrics.publish_log_id = publish_log.id and metrics.site_id is null
  `);
  await db.execute(sql`
    update sh_queue as queue
    set site_id = briefs.site_id
    from sh_content_briefs as briefs
    where queue.brief_id = briefs.id and queue.site_id is null
  `);

  console.log(`[backfill-sh-site-scope] completed for site ${DEFAULT_SITE_SLUG} (${siteId})`);
}

main().catch((error) => {
  console.error('[backfill-sh-site-scope] failed', error);
  process.exit(1);
});
