-- ========================================
-- SocialHub Module — Migration 0005
-- VIRAL ENGINE data model expansion
-- ========================================

ALTER TABLE "sh_content_briefs"
  ADD COLUMN IF NOT EXISTS "viral_engine_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "viral_engine_mode" varchar(30) NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "viral_engine_profile" jsonb,
  ADD COLUMN IF NOT EXISTS "viral_engine_prompt" text,
  ADD COLUMN IF NOT EXISTS "video_format_slug" varchar(100),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

ALTER TABLE "sh_generated_copy"
  ADD COLUMN IF NOT EXISTS "viral_engine_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "pcm_profile" jsonb,
  ADD COLUMN IF NOT EXISTS "content_angle" varchar(100),
  ADD COLUMN IF NOT EXISTS "video_format_slug" varchar(100);

ALTER TABLE "sh_media_assets"
  ADD COLUMN IF NOT EXISTS "video_format_slug" varchar(100),
  ADD COLUMN IF NOT EXISTS "viral_engine_snapshot" jsonb;

ALTER TABLE "sh_settings"
  ALTER COLUMN "config" SET NOT NULL;

