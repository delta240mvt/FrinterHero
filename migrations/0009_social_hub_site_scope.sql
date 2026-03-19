ALTER TABLE "sh_settings" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_social_accounts" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_content_briefs" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_generated_copy" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_templates" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_media_assets" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_publish_log" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_post_metrics" ADD COLUMN "site_id" integer;
ALTER TABLE "sh_queue" ADD COLUMN "site_id" integer;

UPDATE "sh_settings"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "sh_social_accounts"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "sh_content_briefs"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "sh_generated_copy" AS "copy"
SET "site_id" = "briefs"."site_id"
FROM "sh_content_briefs" AS "briefs"
WHERE "copy"."brief_id" = "briefs"."id"
  AND "copy"."site_id" IS NULL;

UPDATE "sh_templates"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "sh_media_assets" AS "assets"
SET "site_id" = "briefs"."site_id"
FROM "sh_content_briefs" AS "briefs"
WHERE "assets"."brief_id" = "briefs"."id"
  AND "assets"."site_id" IS NULL;

UPDATE "sh_publish_log" AS "publish_log"
SET "site_id" = "briefs"."site_id"
FROM "sh_content_briefs" AS "briefs"
WHERE "publish_log"."brief_id" = "briefs"."id"
  AND "publish_log"."site_id" IS NULL;

UPDATE "sh_post_metrics" AS "metrics"
SET "site_id" = "publish_log"."site_id"
FROM "sh_publish_log" AS "publish_log"
WHERE "metrics"."publish_log_id" = "publish_log"."id"
  AND "metrics"."site_id" IS NULL;

UPDATE "sh_queue" AS "queue"
SET "site_id" = "briefs"."site_id"
FROM "sh_content_briefs" AS "briefs"
WHERE "queue"."brief_id" = "briefs"."id"
  AND "queue"."site_id" IS NULL;

ALTER TABLE "sh_settings" ADD CONSTRAINT "sh_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_social_accounts" ADD CONSTRAINT "sh_social_accounts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_content_briefs" ADD CONSTRAINT "sh_content_briefs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_generated_copy" ADD CONSTRAINT "sh_generated_copy_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_templates" ADD CONSTRAINT "sh_templates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_media_assets" ADD CONSTRAINT "sh_media_assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_publish_log" ADD CONSTRAINT "sh_publish_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_post_metrics" ADD CONSTRAINT "sh_post_metrics_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sh_queue" ADD CONSTRAINT "sh_queue_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;

DROP INDEX IF EXISTS "sh_templates_slug_unique";
CREATE UNIQUE INDEX "uq_sh_templates_site_slug" ON "sh_templates" USING btree ("site_id","slug");

CREATE INDEX "idx_sh_settings_site" ON "sh_settings" USING btree ("site_id");
CREATE INDEX "idx_sh_accounts_site" ON "sh_social_accounts" USING btree ("site_id");
CREATE INDEX "idx_sh_briefs_site" ON "sh_content_briefs" USING btree ("site_id");
CREATE INDEX "idx_sh_copy_site" ON "sh_generated_copy" USING btree ("site_id");
CREATE INDEX "idx_sh_templates_site" ON "sh_templates" USING btree ("site_id");
CREATE INDEX "idx_sh_media_site" ON "sh_media_assets" USING btree ("site_id");
CREATE INDEX "idx_sh_publish_site" ON "sh_publish_log" USING btree ("site_id");
CREATE INDEX "idx_sh_metrics_site" ON "sh_post_metrics" USING btree ("site_id");
CREATE INDEX "idx_sh_queue_site" ON "sh_queue" USING btree ("site_id");
