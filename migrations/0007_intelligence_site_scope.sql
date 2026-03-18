-- ========================================
-- Intelligence tenantization — Migration 0007
-- Add site_id to Reddit and YouTube tables
-- ========================================

ALTER TABLE "reddit_targets" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "reddit_scrape_runs" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "reddit_posts" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "reddit_extracted_gaps" ADD COLUMN IF NOT EXISTS "site_id" integer;

ALTER TABLE "yt_targets" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "yt_scrape_runs" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "yt_comments" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "yt_extracted_gaps" ADD COLUMN IF NOT EXISTS "site_id" integer;

UPDATE "reddit_targets"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "reddit_scrape_runs"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "reddit_posts" rp
SET "site_id" = COALESCE(
  (SELECT rr."site_id" FROM "reddit_scrape_runs" rr WHERE rr."id" = rp."scrape_run_id"),
  (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
)
WHERE rp."site_id" IS NULL;

UPDATE "reddit_extracted_gaps" rg
SET "site_id" = COALESCE(
  (SELECT rr."site_id" FROM "reddit_scrape_runs" rr WHERE rr."id" = rg."scrape_run_id"),
  (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
)
WHERE rg."site_id" IS NULL;

UPDATE "yt_targets"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "yt_scrape_runs"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "yt_comments" yc
SET "site_id" = COALESCE(
  (SELECT yr."site_id" FROM "yt_scrape_runs" yr WHERE yr."id" = yc."scrape_run_id"),
  (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
)
WHERE yc."site_id" IS NULL;

UPDATE "yt_extracted_gaps" yg
SET "site_id" = COALESCE(
  (SELECT yr."site_id" FROM "yt_scrape_runs" yr WHERE yr."id" = yg."scrape_run_id"),
  (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
)
WHERE yg."site_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reddit_targets_site_id_sites_id_fk') THEN
    ALTER TABLE "reddit_targets"
      ADD CONSTRAINT "reddit_targets_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reddit_scrape_runs_site_id_sites_id_fk') THEN
    ALTER TABLE "reddit_scrape_runs"
      ADD CONSTRAINT "reddit_scrape_runs_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reddit_posts_site_id_sites_id_fk') THEN
    ALTER TABLE "reddit_posts"
      ADD CONSTRAINT "reddit_posts_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reddit_extracted_gaps_site_id_sites_id_fk') THEN
    ALTER TABLE "reddit_extracted_gaps"
      ADD CONSTRAINT "reddit_extracted_gaps_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'yt_targets_site_id_sites_id_fk') THEN
    ALTER TABLE "yt_targets"
      ADD CONSTRAINT "yt_targets_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'yt_scrape_runs_site_id_sites_id_fk') THEN
    ALTER TABLE "yt_scrape_runs"
      ADD CONSTRAINT "yt_scrape_runs_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'yt_comments_site_id_sites_id_fk') THEN
    ALTER TABLE "yt_comments"
      ADD CONSTRAINT "yt_comments_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'yt_extracted_gaps_site_id_sites_id_fk') THEN
    ALTER TABLE "yt_extracted_gaps"
      ADD CONSTRAINT "yt_extracted_gaps_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
