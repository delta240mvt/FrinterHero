-- ========================================
-- Platform foundation — Migration 0006
-- Multi-site + generic job queue for API/worker split
-- ========================================

CREATE TABLE IF NOT EXISTS "sites" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" varchar(100) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "primary_domain" varchar(255) NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'active',
  "brand_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "seo_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "llm_context" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sites_slug" ON "sites" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sites_primary_domain" ON "sites" ("primary_domain");

INSERT INTO "sites" ("slug", "display_name", "primary_domain", "brand_config", "seo_config", "feature_flags", "llm_context")
VALUES
  (
    'przemyslawfilipiak',
    'Przemysław Filipiak',
    'przemyslawfilipiak.com',
    '{"siteName":"Przemysław Filipiak","shortName":"P·F","personName":"Przemysław Filipiak"}'::jsonb,
    '{"canonicalBaseUrl":"https://przemyslawfilipiak.com"}'::jsonb,
    '{"brandClarity":true,"socialHub":true}'::jsonb,
    'Primary legacy site for the existing monolith.'
  ),
  (
    'focusequalsfreedom',
    'Focus Equals Freedom',
    'focusequalsfreedom.com',
    '{"siteName":"Focus Equals Freedom","shortName":"FEF","personName":"Focus Equals Freedom"}'::jsonb,
    '{"canonicalBaseUrl":"https://focusequalsfreedom.com"}'::jsonb,
    '{"brandClarity":true,"socialHub":true}'::jsonb,
    'Bootstrap tenant for future client2 extraction.'
  ),
  (
    'frinter',
    'Frinter',
    'frinter.app',
    '{"siteName":"Frinter","shortName":"FR","personName":"Frinter"}'::jsonb,
    '{"canonicalBaseUrl":"https://frinter.app"}'::jsonb,
    '{"brandClarity":true,"socialHub":true}'::jsonb,
    'Bootstrap tenant for future client3 extraction.'
  )
ON CONFLICT ("slug") DO NOTHING;

CREATE TABLE IF NOT EXISTS "app_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer,
  "type" varchar(50) NOT NULL,
  "topic" varchar(50) NOT NULL,
  "status" varchar(30) NOT NULL DEFAULT 'pending',
  "priority" integer NOT NULL DEFAULT 50,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "error" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "worker_name" varchar(100),
  "available_at" timestamp DEFAULT now() NOT NULL,
  "locked_at" timestamp,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'app_jobs_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "app_jobs"
      ADD CONSTRAINT "app_jobs_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_app_jobs_status" ON "app_jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_app_jobs_topic" ON "app_jobs" ("topic");
CREATE INDEX IF NOT EXISTS "idx_app_jobs_site" ON "app_jobs" ("site_id");
CREATE INDEX IF NOT EXISTS "idx_app_jobs_available" ON "app_jobs" ("available_at");

ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "geo_queries" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "geo_runs" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "knowledge_sources" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "knowledge_entries" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "content_gaps" ADD COLUMN IF NOT EXISTS "site_id" integer;
ALTER TABLE "article_generations" ADD COLUMN IF NOT EXISTS "site_id" integer;

UPDATE "articles"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "geo_queries"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "geo_runs"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "sessions"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "knowledge_sources"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "knowledge_entries"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "content_gaps"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
WHERE "site_id" IS NULL;

UPDATE "article_generations"
SET "site_id" = COALESCE(
  (SELECT "site_id" FROM "articles" a WHERE a."id" = "article_generations"."article_id"),
  (SELECT "site_id" FROM "content_gaps" cg WHERE cg."id" = "article_generations"."gap_id"),
  (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak')
)
WHERE "site_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'articles_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "articles"
      ADD CONSTRAINT "articles_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'geo_queries_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "geo_queries"
      ADD CONSTRAINT "geo_queries_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'geo_runs_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "geo_runs"
      ADD CONSTRAINT "geo_runs_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sessions_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'knowledge_sources_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "knowledge_sources"
      ADD CONSTRAINT "knowledge_sources_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'knowledge_entries_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "knowledge_entries"
      ADD CONSTRAINT "knowledge_entries_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'content_gaps_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "content_gaps"
      ADD CONSTRAINT "content_gaps_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'article_generations_site_id_sites_id_fk'
  ) THEN
    ALTER TABLE "article_generations"
      ADD CONSTRAINT "article_generations_site_id_sites_id_fk"
      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
