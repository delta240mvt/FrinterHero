-- BC Iterations: named LP generation runs with AI-selected pain point subsets

CREATE TABLE IF NOT EXISTS "bc_iterations" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL REFERENCES "bc_projects"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "intention" text,
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_bc_iter_project" ON "bc_iterations" ("project_id");

CREATE TABLE IF NOT EXISTS "bc_iteration_selections" (
  "id" serial PRIMARY KEY NOT NULL,
  "iteration_id" integer NOT NULL REFERENCES "bc_iterations"("id") ON DELETE CASCADE,
  "pain_point_id" integer NOT NULL REFERENCES "bc_extracted_pain_points"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL,
  "selection_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_bc_iter_sel_iteration" ON "bc_iteration_selections" ("iteration_id");

ALTER TABLE "bc_pain_clusters" ADD COLUMN IF NOT EXISTS "iteration_id" integer REFERENCES "bc_iterations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_bc_clusters_iteration" ON "bc_pain_clusters" ("iteration_id");

ALTER TABLE "bc_landing_page_variants" ADD COLUMN IF NOT EXISTS "iteration_id" integer REFERENCES "bc_iterations"("id") ON DELETE SET NULL;
