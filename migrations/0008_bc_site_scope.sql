ALTER TABLE "bc_projects" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_target_channels" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_target_videos" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_comments" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_extracted_pain_points" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_settings" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_iterations" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_iteration_selections" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_landing_page_variants" ADD COLUMN "site_id" integer;
ALTER TABLE "bc_pain_clusters" ADD COLUMN "site_id" integer;

UPDATE "bc_projects"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "bc_target_channels" AS "channels"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "channels"."project_id" = "projects"."id"
  AND "channels"."site_id" IS NULL;

UPDATE "bc_target_videos" AS "videos"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "videos"."project_id" = "projects"."id"
  AND "videos"."site_id" IS NULL;

UPDATE "bc_comments" AS "comments"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "comments"."project_id" = "projects"."id"
  AND "comments"."site_id" IS NULL;

UPDATE "bc_extracted_pain_points" AS "pain_points"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "pain_points"."project_id" = "projects"."id"
  AND "pain_points"."site_id" IS NULL;

UPDATE "bc_settings"
SET "site_id" = (SELECT "id" FROM "sites" WHERE "slug" = 'przemyslawfilipiak' LIMIT 1)
WHERE "site_id" IS NULL;

UPDATE "bc_iterations" AS "iterations"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "iterations"."project_id" = "projects"."id"
  AND "iterations"."site_id" IS NULL;

UPDATE "bc_iteration_selections" AS "selections"
SET "site_id" = "iterations"."site_id"
FROM "bc_iterations" AS "iterations"
WHERE "selections"."iteration_id" = "iterations"."id"
  AND "selections"."site_id" IS NULL;

UPDATE "bc_landing_page_variants" AS "variants"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "variants"."project_id" = "projects"."id"
  AND "variants"."site_id" IS NULL;

UPDATE "bc_pain_clusters" AS "clusters"
SET "site_id" = "projects"."site_id"
FROM "bc_projects" AS "projects"
WHERE "clusters"."project_id" = "projects"."id"
  AND "clusters"."site_id" IS NULL;

ALTER TABLE "bc_projects" ADD CONSTRAINT "bc_projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_target_channels" ADD CONSTRAINT "bc_target_channels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_target_videos" ADD CONSTRAINT "bc_target_videos_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_comments" ADD CONSTRAINT "bc_comments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_extracted_pain_points" ADD CONSTRAINT "bc_extracted_pain_points_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_settings" ADD CONSTRAINT "bc_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_iterations" ADD CONSTRAINT "bc_iterations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_iteration_selections" ADD CONSTRAINT "bc_iteration_selections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_landing_page_variants" ADD CONSTRAINT "bc_landing_page_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bc_pain_clusters" ADD CONSTRAINT "bc_pain_clusters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX "idx_bc_projects_site" ON "bc_projects" USING btree ("site_id");
CREATE INDEX "idx_bc_projects_status" ON "bc_projects" USING btree ("status");
CREATE INDEX "idx_bc_projects_created_at" ON "bc_projects" USING btree ("created_at");
CREATE INDEX "idx_bc_channels_site" ON "bc_target_channels" USING btree ("site_id");
CREATE INDEX "idx_bc_videos_site" ON "bc_target_videos" USING btree ("site_id");
CREATE INDEX "idx_bc_comments_site" ON "bc_comments" USING btree ("site_id");
CREATE INDEX "idx_bc_pp_site" ON "bc_extracted_pain_points" USING btree ("site_id");
CREATE INDEX "idx_bc_settings_site" ON "bc_settings" USING btree ("site_id");
CREATE INDEX "idx_bc_iter_site" ON "bc_iterations" USING btree ("site_id");
CREATE INDEX "idx_bc_iter_sel_site" ON "bc_iteration_selections" USING btree ("site_id");
CREATE INDEX "idx_bc_variants_site" ON "bc_landing_page_variants" USING btree ("site_id");
CREATE INDEX "idx_bc_clusters_site" ON "bc_pain_clusters" USING btree ("site_id");
