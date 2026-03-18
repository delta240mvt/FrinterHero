/**
 * Seed / upsert Social Hub templates into sh_templates table.
 * Run: npx tsx scripts/seed-sh-templates.ts
 */
import { db } from '../src/db/client.ts';
import { shTemplates } from '../src/db/schema.ts';
import { getDefaultTemplates } from '../src/lib/sh-image-gen.ts';
import { eq } from 'drizzle-orm';

async function main() {
  const templates = getDefaultTemplates();
  console.log(`Seeding ${templates.length} templates…`);

  for (const t of templates) {
    const existing = await db.select({ id: shTemplates.id }).from(shTemplates).where(eq(shTemplates.slug, t.slug)).limit(1);
    if (existing.length > 0) {
      await db.update(shTemplates).set({ name: t.name, category: t.category, aspectRatio: t.aspectRatio, jsxTemplate: t.jsxTemplate, isActive: true }).where(eq(shTemplates.slug, t.slug));
      console.log(`  ✏️  Updated: ${t.slug}`);
    } else {
      await db.insert(shTemplates).values({ ...t, isActive: true });
      console.log(`  ➕ Inserted: ${t.slug}`);
    }
  }

  console.log('Done ✅');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
