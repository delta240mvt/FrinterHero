-- ========================================
-- SocialHub Module — Migration 0004
-- ========================================

CREATE TABLE IF NOT EXISTS "sh_settings" (
  "id"          serial PRIMARY KEY,
  "config"      jsonb NOT NULL,
  "updated_at"  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sh_social_accounts" (
  "id"             serial PRIMARY KEY,
  "platform"       varchar(30)  NOT NULL,
  "account_name"   varchar(255) NOT NULL,
  "account_handle" varchar(255),
  "auth_payload"   jsonb,
  "is_active"      boolean NOT NULL DEFAULT true,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_accounts_platform" ON "sh_social_accounts" ("platform");

CREATE TABLE IF NOT EXISTS "sh_content_briefs" (
  "id"                 serial PRIMARY KEY,
  "source_type"        varchar(30)  NOT NULL,
  "source_id"          integer      NOT NULL,
  "source_title"       varchar(500),
  "source_snapshot"    text,
  "suggestion_prompt"  text,
  "output_format"      varchar(20)  NOT NULL,
  "target_platforms"   jsonb        NOT NULL DEFAULT '[]',
  "target_account_ids" jsonb        NOT NULL DEFAULT '[]',
  "kb_entries_used"    jsonb                 DEFAULT '[]',
  "brand_voice_used"   boolean      NOT NULL DEFAULT true,
  "repurpose_group_id" integer,
  "status"             varchar(30)  NOT NULL DEFAULT 'draft',
  "created_at"         timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_briefs_status" ON "sh_content_briefs" ("status");
CREATE INDEX IF NOT EXISTS "idx_sh_briefs_source" ON "sh_content_briefs" ("source_type", "source_id");

CREATE TABLE IF NOT EXISTS "sh_generated_copy" (
  "id"                       serial PRIMARY KEY,
  "brief_id"                 integer     NOT NULL REFERENCES "sh_content_briefs" ("id") ON DELETE CASCADE,
  "hook_line"                text        NOT NULL,
  "body_text"                text        NOT NULL,
  "hashtags"                 jsonb                DEFAULT '[]',
  "cta"                      text,
  "image_layout_description" text,
  "video_script"             text,
  "variant_index"            integer     NOT NULL DEFAULT 0,
  "generation_model"         varchar(100),
  "prompt_used"              text,
  "is_edited"                boolean     NOT NULL DEFAULT false,
  "edited_at"                timestamp,
  "status"                   varchar(20) NOT NULL DEFAULT 'draft',
  "created_at"               timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_copy_brief"  ON "sh_generated_copy" ("brief_id");
CREATE INDEX IF NOT EXISTS "idx_sh_copy_status" ON "sh_generated_copy" ("status");

CREATE TABLE IF NOT EXISTS "sh_templates" (
  "id"           serial PRIMARY KEY,
  "name"         varchar(100) NOT NULL,
  "slug"         varchar(100) NOT NULL UNIQUE,
  "category"     varchar(50)  NOT NULL,
  "aspect_ratio" varchar(10)  NOT NULL,
  "jsx_template" text         NOT NULL,
  "preview_url"  text,
  "is_active"    boolean      NOT NULL DEFAULT true,
  "created_at"   timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sh_media_assets" (
  "id"               serial PRIMARY KEY,
  "brief_id"         integer     NOT NULL REFERENCES "sh_content_briefs"  ("id") ON DELETE CASCADE,
  "copy_id"          integer              REFERENCES "sh_generated_copy"  ("id"),
  "template_id"      integer              REFERENCES "sh_templates"       ("id"),
  "type"             varchar(10) NOT NULL,
  "media_url"        text,
  "thumbnail_url"    text,
  "width"            integer,
  "height"           integer,
  "duration_seconds" integer,
  "file_size_bytes"  integer,
  "render_provider"  varchar(30),
  "render_model"     varchar(50),
  "render_cost_usd"  real,
  "status"           varchar(20) NOT NULL DEFAULT 'pending',
  "created_at"       timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_media_brief"  ON "sh_media_assets" ("brief_id");
CREATE INDEX IF NOT EXISTS "idx_sh_media_status" ON "sh_media_assets" ("status");

CREATE TABLE IF NOT EXISTS "sh_publish_log" (
  "id"                serial PRIMARY KEY,
  "brief_id"          integer     NOT NULL REFERENCES "sh_content_briefs"  ("id") ON DELETE CASCADE,
  "media_asset_id"    integer              REFERENCES "sh_media_assets"    ("id"),
  "account_id"        integer     NOT NULL REFERENCES "sh_social_accounts" ("id"),
  "platform"          varchar(30) NOT NULL,
  "external_post_id"  varchar(255),
  "external_post_url" text,
  "published_at"      timestamp,
  "scheduled_for"     timestamp,
  "status"            varchar(20) NOT NULL DEFAULT 'pending',
  "error_message"     text,
  "created_at"        timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_publish_brief"    ON "sh_publish_log" ("brief_id");
CREATE INDEX IF NOT EXISTS "idx_sh_publish_status"   ON "sh_publish_log" ("status");
CREATE INDEX IF NOT EXISTS "idx_sh_publish_platform" ON "sh_publish_log" ("platform");

CREATE TABLE IF NOT EXISTS "sh_post_metrics" (
  "id"               serial PRIMARY KEY,
  "publish_log_id"   integer NOT NULL REFERENCES "sh_publish_log" ("id") ON DELETE CASCADE,
  "views"            integer NOT NULL DEFAULT 0,
  "likes"            integer NOT NULL DEFAULT 0,
  "comments"         integer NOT NULL DEFAULT 0,
  "shares"           integer NOT NULL DEFAULT 0,
  "saves"            integer NOT NULL DEFAULT 0,
  "engagement_rate"  real,
  "fetched_at"       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sh_queue" (
  "id"            serial PRIMARY KEY,
  "brief_id"      integer     NOT NULL REFERENCES "sh_content_briefs" ("id") ON DELETE CASCADE,
  "priority"      integer     NOT NULL DEFAULT 50,
  "status"        varchar(20) NOT NULL DEFAULT 'pending',
  "processed_at"  timestamp,
  "error_message" text,
  "created_at"    timestamp   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_sh_queue_status"   ON "sh_queue" ("status");
CREATE INDEX IF NOT EXISTS "idx_sh_queue_priority" ON "sh_queue" ("priority");
