/**
 * Seed / upsert Social Hub templates into sh_templates table.
 * Run: npx tsx scripts/seed-sh-templates.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/client.ts';
import { shTemplates, sites } from '../src/db/schema.ts';
import { getDefaultTemplates } from '../src/lib/sh-image-gen.ts';
import { and, eq } from 'drizzle-orm';

const siteSlug = process.env.SITE_SLUG || 'przemyslawfilipiak';

async function main() {
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, siteSlug)).limit(1);
  if (!site) throw new Error(`Site not found for slug: ${siteSlug}`);

  const templates = getDefaultTemplates();
  console.log(`Seeding ${templates.length} templates for ${siteSlug}…`);

  for (const t of templates) {
    const existing = await db.select({ id: shTemplates.id }).from(shTemplates).where(and(eq(shTemplates.siteId, site.id), eq(shTemplates.slug, t.slug))).limit(1);
    if (existing.length > 0) {
      await db.update(shTemplates).set({ name: t.name, category: t.category, aspectRatio: t.aspectRatio, jsxTemplate: t.jsxTemplate, isActive: true }).where(and(eq(shTemplates.siteId, site.id), eq(shTemplates.slug, t.slug)));
      console.log(`  ✏️  Updated: ${t.slug}`);
    } else {
      await db.insert(shTemplates).values({ ...t, siteId: site.id, isActive: true });
      console.log(`  ➕ Inserted: ${t.slug}`);
    }
  }

  console.log('Done ✅');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
