CREATE TABLE "yolo_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer UNIQUE REFERENCES "sites"("id") ON DELETE CASCADE,
  "yt_pain_points_enabled" boolean NOT NULL DEFAULT false,
  "yt_pain_points_limit" integer NOT NULL DEFAULT 10,
  "yt_pain_points_min_intensity" integer NOT NULL DEFAULT 5,
  "gaps_enabled" boolean NOT NULL DEFAULT false,
  "gaps_limit" integer NOT NULL DEFAULT 5,
  "gaps_model" varchar(100) NOT NULL DEFAULT 'anthropic/claude-sonnet-4-6',
  "auto_publish_enabled" boolean NOT NULL DEFAULT false,
  "auto_publish_limit" integer NOT NULL DEFAULT 10,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
