CREATE TABLE IF NOT EXISTS "article_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"gap_id" integer NOT NULL,
	"generated_by_model" varchar(100) NOT NULL,
	"generation_prompt" text,
	"original_content" text NOT NULL,
	"final_content" text,
	"author_notes" text,
	"kb_entries_used" integer[] DEFAULT '{}' NOT NULL,
	"models_queried" text[] DEFAULT '{}' NOT NULL,
	"generation_timestamp" timestamp DEFAULT now() NOT NULL,
	"publication_timestamp" timestamp,
	"content_changed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"content" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"reading_time" integer,
	"author" varchar(255) DEFAULT 'Przemysław Filipiak' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"source_gap_id" integer,
	"generated_by_model" varchar(100),
	"generation_timestamp" timestamp,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"gap_title" varchar(255) NOT NULL,
	"gap_description" text NOT NULL,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"suggested_angle" text,
	"related_queries" text[] DEFAULT '{}' NOT NULL,
	"source_models" text[] DEFAULT '{}' NOT NULL,
	"author_notes" text,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"geo_run_id" integer,
	"duplicate_gap_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"model" varchar(50) NOT NULL,
	"response" text,
	"has_mention" boolean DEFAULT false NOT NULL,
	"gap_detected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"queries_count" integer NOT NULL,
	"gaps_found" integer NOT NULL,
	"drafts_generated" integer NOT NULL,
	"gaps_deduped" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"source_url" varchar(500),
	"tags" text[] DEFAULT '{}' NOT NULL,
	"project_name" varchar(255),
	"importance_score" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"source_name" varchar(255) NOT NULL,
	"source_url" varchar(500),
	"import_timestamp" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_generations" ADD CONSTRAINT "article_generations_gap_id_content_gaps_id_fk" FOREIGN KEY ("gap_id") REFERENCES "public"."content_gaps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_gaps" ADD CONSTRAINT "content_gaps_geo_run_id_geo_runs_id_fk" FOREIGN KEY ("geo_run_id") REFERENCES "public"."geo_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gaps_status" ON "content_gaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gaps_score" ON "content_gaps" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gaps_created_at" ON "content_gaps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_tags" ON "knowledge_entries" USING btree ("tags");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_type_score" ON "knowledge_entries" USING btree ("type","importance_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_title_source" ON "knowledge_entries" USING btree ("title","source_id");