ALTER TABLE "bc_target_videos" ADD COLUMN IF NOT EXISTS "is_scraped" boolean NOT NULL DEFAULT false;
