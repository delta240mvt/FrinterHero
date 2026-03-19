ALTER TABLE "articles" DROP CONSTRAINT IF EXISTS "articles_slug_unique";
DROP INDEX IF EXISTS "articles_slug_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "uq_articles_site_slug" ON "articles" USING btree ("site_id","slug");
