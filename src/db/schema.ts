import { pgTable, serial, text, timestamp, boolean, integer, varchar, real, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import type {
  ViralEngineConfig as ShViralEngineConfig,
} from '@/lib/sh-viral-engine-types';

// ========================================
// Multi-site foundation
// ========================================

export const sites = pgTable('sites', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  primaryDomain: varchar('primary_domain', { length: 255 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  brandConfig: jsonb('brand_config').notNull().$type<Record<string, unknown>>().default({}),
  seoConfig: jsonb('seo_config').notNull().$type<Record<string, unknown>>().default({}),
  featureFlags: jsonb('feature_flags').notNull().$type<Record<string, boolean>>().default({}),
  llmContext: text('llm_context'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('uq_sites_slug').on(table.slug),
  domainIdx: uniqueIndex('uq_sites_primary_domain').on(table.primaryDomain),
}));

export const appJobs = pgTable('app_jobs', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 50 }).notNull(),
  topic: varchar('topic', { length: 50 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  priority: integer('priority').notNull().default(50),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),
  progress: jsonb('progress').notNull().$type<Record<string, unknown>>().default({}),
  result: jsonb('result').$type<Record<string, unknown> | null>(),
  error: text('error'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  workerName: varchar('worker_name', { length: 100 }),
  availableAt: timestamp('available_at').notNull().defaultNow(),
  lockedAt: timestamp('locked_at'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_app_jobs_status').on(table.status),
  topicIdx: index('idx_app_jobs_topic').on(table.topic),
  siteIdx: index('idx_app_jobs_site').on(table.siteId),
  availableIdx: index('idx_app_jobs_available').on(table.availableAt),
}));

// ========================================
// EXISTING TABLES (preserved + enhanced)
// ========================================

// Articles: Main content storage. New columns added for AI generation tracking (nullable, backward compatible)
export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  content: text('content').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  featured: boolean('featured').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  readingTime: integer('reading_time'),
  author: varchar('author', { length: 255 }).notNull().default('Przemysław Filipiak'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
  // Stage 1 additions: AI generation metadata (all nullable for backward compatibility)
  sourceGapId: integer('source_gap_id'),
  generatedByModel: varchar('generated_by_model', { length: 100 }),
  generationTimestamp: timestamp('generation_timestamp'),
});

export const geoQueries = pgTable('geo_queries', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  query: text('query').notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  response: text('response'),
  hasMention: boolean('has_mention').notNull().default(false),
  gapDetected: boolean('gap_detected').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// GEO Runs: Stage 2 adds gaps_deduped column (gaps_found already existed)
export const geoRuns = pgTable('geo_runs', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  runAt: timestamp('run_at').notNull().defaultNow(),
  queriesCount: integer('queries_count').notNull(),
  gapsFound: integer('gaps_found').notNull(),
  draftsGenerated: integer('drafts_generated').notNull(),
  // Stage 2 addition
  gapsDeduped: integer('gaps_deduped').notNull().default(0),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'set null' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ========================================
// Stage 1: Knowledge Base Infrastructure
// ========================================

// Knowledge Sources: Track where KB entries originate (audit trail + deduplication)
// Key constraints: source_type enforced, immutable audit trail
export const knowledgeSources = pgTable('knowledge_sources', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  sourceType: varchar('source_type', { length: 50 }).notNull(), // 'internal_article', 'external_link', 'imported_markdown', 'api_data'
  sourceName: varchar('source_name', { length: 255 }).notNull(),
  sourceUrl: varchar('source_url', { length: 500 }),
  importTimestamp: timestamp('import_timestamp').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'archived'
  version: integer('version').notNull().default(1),
});

// Knowledge Entries: Author's domain knowledge with metadata for semantic retrieval
// Key constraints: tags lowercase alphanumeric+hyphens, importance_score 0-100,
// content > 50 chars enforced at API layer, title unique per source_id
// Indexes: GIN on tags, composite (type, importance_score), full-text content search via PostgreSQL tsvector in queries
export const knowledgeEntries = pgTable('knowledge_entries', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 50 }).notNull(), // 'project_spec', 'published_article', 'external_research', 'personal_note'
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  sourceUrl: varchar('source_url', { length: 500 }),
  tags: text('tags').array().notNull().default([]),
  projectName: varchar('project_name', { length: 255 }),
  importanceScore: integer('importance_score').notNull().default(50),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  sourceId: integer('source_id').references(() => knowledgeSources.id),
}, (table) => ({
  tagsIdx: index('idx_kb_tags').on(table.tags),
  typeScoreIdx: index('idx_kb_type_score').on(table.type, table.importanceScore),
  titleSourceIdx: index('idx_kb_title_source').on(table.title, table.sourceId),
}));

// ========================================
// Stage 2: Content Gap Analysis
// ========================================

// Content Gaps: Identified content visibility gaps from AI analysis
// Key constraints: status enum enforced, gaps remain 90+ days, suggested_angle required before approval
// Indexes: status (filter active), confidence_score (sort relevance), created_at (sort recency)
export const contentGaps = pgTable('content_gaps', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  gapTitle: varchar('gap_title', { length: 255 }).notNull(),
  gapDescription: text('gap_description').notNull(),
  confidenceScore: integer('confidence_score').notNull().default(0), // 0-100
  suggestedAngle: text('suggested_angle'),
  relatedQueries: text('related_queries').array().notNull().default([]),
  sourceModels: text('source_models').array().notNull().default([]),
  authorNotes: text('author_notes'),
  status: varchar('status', { length: 20 }).notNull().default('new'), // 'new', 'acknowledged', 'archived', 'in_progress'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  acknowledgedAt: timestamp('acknowledged_at'),
  geoRunId: integer('geo_run_id').references(() => geoRuns.id),
  duplicateGapId: integer('duplicate_gap_id'),
}, (table) => ({
  statusIdx: index('idx_gaps_status').on(table.status),
  scoreIdx: index('idx_gaps_score').on(table.confidenceScore),
  createdAtIdx: index('idx_gaps_created_at').on(table.createdAt),
}));

// ========================================
// Stage 5: Article Generation Audit Trail
// ========================================

// Article Generations: Immutable audit trail linking articles to source gaps
// Stores complete lineage: gap → prompt → draft → published
// Immutable: no retroactive edits allowed (enforced at API layer)
export const articleGenerations = pgTable('article_generations', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  articleId: integer('article_id').notNull().references(() => articles.id),
  gapId: integer('gap_id').notNull().references(() => contentGaps.id),
  generatedByModel: varchar('generated_by_model', { length: 100 }).notNull(),
  generationPrompt: text('generation_prompt'),
  originalContent: text('original_content').notNull(),
  finalContent: text('final_content'),
  authorNotes: text('author_notes'),
  kbEntriesUsed: integer('kb_entries_used').array().notNull().default([]),
  modelsQueried: text('models_queried').array().notNull().default([]),
  generationTimestamp: timestamp('generation_timestamp').notNull().defaultNow(),
  publicationTimestamp: timestamp('publication_timestamp'),
  contentChanged: boolean('content_changed').notNull().default(false),
});

// ========================================
// Reddit Intelligence: New WebScraping Module
// ========================================

// Subreddit/keyword target configuration — admin manages this list
export const redditTargets = pgTable('reddit_targets', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 20 }).notNull(), // 'subreddit' | 'keyword_search'
  value: varchar('value', { length: 255 }).notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(50), // 0-100
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// One record per scraping job execution
export const redditScrapeRuns = pgTable('reddit_scrape_runs', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  runAt: timestamp('run_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('running'), // 'running' | 'completed' | 'failed'
  targetsScraped: text('targets_scraped').array().notNull().default([]),
  postsCollected: integer('posts_collected').notNull().default(0),
  painPointsExtracted: integer('pain_points_extracted').notNull().default(0),
  gapsCreated: integer('gaps_created').notNull().default(0),
  errorMessage: text('error_message'),
  logs: text('logs').array().notNull().default([]),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});

// Raw posts fetched from Reddit via Apify
export const redditPosts = pgTable('reddit_posts', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => redditScrapeRuns.id, { onDelete: 'cascade' }),
  redditId: varchar('reddit_id', { length: 20 }).notNull(),
  subreddit: varchar('subreddit', { length: 100 }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  url: varchar('url', { length: 500 }),
  upvotes: integer('upvotes').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),
  topComments: text('top_comments').array().notNull().default([]),
  postedAt: timestamp('posted_at'),
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (table) => ({
  scrapeRunIdx: index('idx_reddit_posts_run').on(table.scrapeRunId),
  subredditIdx: index('idx_reddit_posts_subreddit').on(table.subreddit),
  redditIdIdx: index('idx_reddit_posts_reddit_id').on(table.redditId),
}));

// Pain points extracted by LLM — awaiting admin review before becoming contentGaps
export const redditExtractedGaps = pgTable('reddit_extracted_gaps', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => redditScrapeRuns.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1-10
  frequency: integer('frequency').notNull().default(1),
  vocabularyQuotes: text('vocabulary_quotes').array().notNull().default([]),
  sourcePostIds: integer('source_post_ids').array().notNull().default([]),
  suggestedArticleAngle: text('suggested_article_angle'),
  category: varchar('category', { length: 50 }), // 'focus' | 'energy' | 'burnout' | 'relationships' | 'systems' | 'tech'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  contentGapId: integer('content_gap_id').references(() => contentGaps.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_reddit_gaps_status').on(table.status),
  intensityIdx: index('idx_reddit_gaps_intensity').on(table.emotionalIntensity),
  runIdx: index('idx_reddit_gaps_run').on(table.scrapeRunId),
}));

// ========================================
// YouTube Intelligence: WebScraping Module
// ========================================

// YouTube video targets — admin manages this list
export const ytTargets = pgTable('yt_targets', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  type: varchar('type', { length: 20 }).notNull().default('video'), // 'video' | 'channel'
  url: varchar('url', { length: 500 }).notNull(),                   // Full YouTube URL (video or channel)
  label: varchar('label', { length: 100 }).notNull(),              // Human display name
  videoId: varchar('video_id', { length: 20 }),                    // For type='video': ?v= param
  channelHandle: varchar('channel_handle', { length: 100 }),       // For type='channel': handle without @
  maxVideosPerChannel: integer('max_videos_per_channel').notNull().default(5), // How many top videos to scrape per channel
  isActive: boolean('is_active').notNull().default(true),
  priority: integer('priority').notNull().default(50),             // 0–100, higher = scraped first
  maxComments: integer('max_comments').notNull().default(300),     // Per-video Apify comment limit
  lastScrapedAt: timestamp('last_scraped_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// One record per YouTube scraping job execution
export const ytScrapeRuns = pgTable('yt_scrape_runs', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  runAt: timestamp('run_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('running'), // 'running' | 'completed' | 'failed'
  targetsScraped: text('targets_scraped').array().notNull().default([]),
  commentsCollected: integer('comments_collected').notNull().default(0),
  painPointsExtracted: integer('pain_points_extracted').notNull().default(0),
  gapsCreated: integer('gaps_created').notNull().default(0),
  errorMessage: text('error_message'),
  logs: text('logs').array().notNull().default([]),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});

// Raw comments fetched from YouTube via Apify
export const ytComments = pgTable('yt_comments', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  commentId: varchar('comment_id', { length: 50 }).notNull(),      // Apify 'cid' field — globally unique
  videoId: varchar('video_id', { length: 20 }).notNull(),
  videoUrl: varchar('video_url', { length: 500 }),
  videoTitle: varchar('video_title', { length: 255 }),
  commentText: text('comment_text').notNull(),
  author: varchar('author', { length: 100 }),
  voteCount: integer('vote_count').notNull().default(0),
  replyCount: integer('reply_count').notNull().default(0),
  hasCreatorHeart: boolean('has_creator_heart').notNull().default(false),
  authorIsChannelOwner: boolean('author_is_channel_owner').notNull().default(false),
  replyToCid: varchar('reply_to_cid', { length: 50 }),             // null = top-level comment
  totalCommentsCount: integer('total_comments_count'),
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (table) => ({
  scrapeRunIdx: index('idx_yt_comments_run').on(table.scrapeRunId),
  videoIdx: index('idx_yt_comments_video').on(table.videoId),
  commentIdUniq: uniqueIndex('idx_yt_comments_cid_uniq').on(table.commentId),
}));

// Pain points extracted by LLM — awaiting admin review before becoming contentGaps
export const ytExtractedGaps = pgTable('yt_extracted_gaps', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  scrapeRunId: integer('scrape_run_id').notNull().references(() => ytScrapeRuns.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1–10
  frequency: integer('frequency').notNull().default(1),
  vocabularyQuotes: text('vocabulary_quotes').array().notNull().default([]),
  sourceCommentIds: integer('source_comment_ids').array().notNull().default([]),
  sourceVideoId: varchar('source_video_id', { length: 20 }),
  sourceVideoTitle: varchar('source_video_title', { length: 255 }),
  suggestedArticleAngle: text('suggested_article_angle'),
  category: varchar('category', { length: 50 }), // 'focus' | 'energy' | 'burnout' | 'relationships' | 'systems' | 'tech' | 'mindset' | 'health'
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  approvedAt: timestamp('approved_at'),
  rejectedAt: timestamp('rejected_at'),
  contentGapId: integer('content_gap_id').references(() => contentGaps.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_yt_gaps_status').on(table.status),
  intensityIdx: index('idx_yt_gaps_intensity').on(table.emotionalIntensity),
  runIdx: index('idx_yt_gaps_run').on(table.scrapeRunId),
}));

// ========================================
// Brand Clarity: LP Analysis & Generation Module
// ========================================

// One record per brand analysis project
export const bcProjects = pgTable('bc_projects', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  founderDescription: text('founder_description').notNull(),
  founderVision: text('founder_vision'),
  projectDocumentation: text('project_documentation'),   // Stage 1.1 — nullable, optional
  lpRawInput: text('lp_raw_input').notNull(),
  lpStructureJson: jsonb('lp_structure_json'),           // Extracted LP structure incl. sectionWeaknesses
  lpTemplateHtml: text('lp_template_html'),
  nicheKeywords: jsonb('niche_keywords').$type<string[]>().default([]),
  audiencePainKeywords: jsonb('audience_pain_keywords').$type<string[]>().default([]),
  featureMap: jsonb('feature_map').$type<{featureName:string;whatItDoes:string;userBenefit:string}[]>().default([]),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  // draft → docs_pending → channels_pending → videos_pending → scraping → pain_points_pending → generating → done
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_projects_site').on(table.siteId),
  statusIdx: index('idx_bc_projects_status').on(table.status),
  createdAtIdx: index('idx_bc_projects_created_at').on(table.createdAt),
}));

// YouTube channels discovered/confirmed for a project
export const bcTargetChannels = pgTable('bc_target_channels', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  channelId: varchar('channel_id', { length: 100 }).notNull(),
  channelHandle: varchar('channel_handle', { length: 100 }),
  channelName: varchar('channel_name', { length: 255 }).notNull(),
  channelUrl: text('channel_url').notNull(),
  subscriberCount: integer('subscriber_count'),
  description: text('description'),
  discoveryMethod: varchar('discovery_method', { length: 50 }).notNull().default('auto'), // auto | manual
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_channels_site').on(table.siteId),
  projectIdx: index('idx_bc_channels_project').on(table.projectId),
}));

// Top videos selected per channel (3 per channel)
export const bcTargetVideos = pgTable('bc_target_videos', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  channelId: integer('channel_id').notNull().references(() => bcTargetChannels.id, { onDelete: 'cascade' }),
  videoId: varchar('video_id', { length: 50 }).notNull(),
  videoUrl: text('video_url').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  viewCount: integer('view_count'),
  commentCount: integer('comment_count'),
  publishedAt: timestamp('published_at'),
  relevanceScore: real('relevance_score'),
  isSelected: boolean('is_selected').notNull().default(true),
  isScraped: boolean('is_scraped').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_videos_site').on(table.siteId),
  projectIdx: index('idx_bc_videos_project').on(table.projectId),
  channelIdx: index('idx_bc_videos_channel').on(table.channelId),
}));

// Raw YouTube comments scraped via commentThreads API
export const bcComments = pgTable('bc_comments', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  videoId: integer('video_id').notNull().references(() => bcTargetVideos.id, { onDelete: 'cascade' }),
  commentId: varchar('comment_id', { length: 100 }).notNull(),  // YouTube comment ID
  commentText: text('comment_text').notNull(),
  voteCount: integer('vote_count').notNull().default(0),
  author: varchar('author', { length: 255 }),
  publishedAt: timestamp('published_at'),
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_comments_site').on(table.siteId),
  projectIdx: index('idx_bc_comments_project').on(table.projectId),
  videoIdx: index('idx_bc_comments_video').on(table.videoId),
  commentIdIdx: index('idx_bc_comments_cid').on(table.commentId),
}));

// Pain points extracted by LLM from comments — awaiting review
export const bcExtractedPainPoints = pgTable('bc_extracted_pain_points', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  painPointTitle: varchar('pain_point_title', { length: 255 }).notNull(),
  painPointDescription: text('pain_point_description').notNull(),
  emotionalIntensity: integer('emotional_intensity').notNull().default(5), // 1-10
  frequency: integer('frequency').notNull().default(1),
  vocabularyQuotes: text('vocabulary_quotes').array().notNull().default([]),
  category: varchar('category', { length: 50 }).notNull().default('focus'),
  customerLanguage: text('customer_language'),
  desiredOutcome: text('desired_outcome'),
  vocData: jsonb('voc_data').$type<{problemLabel:string;dominantEmotion:string;failedSolutions:string[];triggerMoment:string;successVision:string}>(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | approved | rejected
  sourceVideoIds: integer('source_video_ids').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_pp_site').on(table.siteId),
  projectIdx: index('idx_bc_pp_project').on(table.projectId),
  statusIdx: index('idx_bc_pp_status').on(table.status),
  intensityIdx: index('idx_bc_pp_intensity').on(table.emotionalIntensity),
}));

// Global LLM settings for Brand Clarity pipeline (single row, JSONB config)
export const bcSettings = pgTable('bc_settings', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  config: jsonb('config').notNull().$type<{
    provider: string;
    lpModel: string;
    scraperModel: string;
    clusterModel: string;
    generatorModel: string;
    extendedThinkingEnabled: boolean;
    lpThinkingBudget: number;
    scraperThinkingBudget: number;
    clusterThinkingBudget: number;
    generatorThinkingBudget: number;
  }>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_settings_site').on(table.siteId),
}));

// ── Iterations: Named LP generation runs with AI-selected pain point subsets ──
// Defined BEFORE bcLandingPageVariants and bcPainClusters to avoid forward references.

// Each iteration is a "folder" targeting a specific audience intent
export const bcIterations = pgTable('bc_iterations', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  intention: text('intention'),                              // free-text intent written by user
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  // draft → selecting → selected → clustering → clustered → generating → done
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_iter_site').on(table.siteId),
  projectIdx: index('idx_bc_iter_project').on(table.projectId),
}));

// Top-30 pain points chosen by AI for a given iteration
export const bcIterationSelections = pgTable('bc_iteration_selections', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  iterationId: integer('iteration_id').notNull().references(() => bcIterations.id, { onDelete: 'cascade' }),
  painPointId: integer('pain_point_id').notNull().references(() => bcExtractedPainPoints.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),                           // 1–30, AI-assigned
  selectionReason: text('selection_reason'),                 // why AI picked this PP
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_iter_sel_site').on(table.siteId),
  iterationIdx: index('idx_bc_iter_sel_iteration').on(table.iterationId),
}));

// Generated landing page variants (3 per project run)
export const bcLandingPageVariants = pgTable('bc_landing_page_variants', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  iterationId: integer('iteration_id').references(() => bcIterations.id, { onDelete: 'set null' }),
  variantType: varchar('variant_type', { length: 50 }).notNull(), // founder_vision | pain_point_1 | pain_point_2
  variantLabel: varchar('variant_label', { length: 255 }).notNull(),
  htmlContent: text('html_content').notNull(),
  improvementSuggestions: jsonb('improvement_suggestions')
    .$type<Record<string, string>>().default({}), // { hero: "...", problem: "...", ... }
  featurePainMap: jsonb('feature_pain_map').$type<{feature:string;painItSolves:string;vocQuote:string;section:string}[]>().default([]),
  primaryPainPointId: integer('primary_pain_point_id')
    .references(() => bcExtractedPainPoints.id), // null for founder_vision
  generationPromptUsed: text('generation_prompt_used'),
  generationModel: varchar('generation_model', { length: 100 }),
  isSelected: boolean('is_selected').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_variants_site').on(table.siteId),
  projectIdx: index('idx_bc_variants_project').on(table.projectId),
  iterationIdx: index('idx_bc_variants_iteration').on(table.iterationId),
}));

// Pain point clusters synthesized by Sonnet before LP generation
export const bcPainClusters = pgTable('bc_pain_clusters', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  projectId: integer('project_id').notNull().references(() => bcProjects.id, { onDelete: 'cascade' }),
  iterationId: integer('iteration_id').references(() => bcIterations.id, { onDelete: 'set null' }),
  clusterTheme: varchar('cluster_theme', { length: 255 }).notNull(),
  dominantEmotion: varchar('dominant_emotion', { length: 100 }),
  aggregateIntensity: real('aggregate_intensity'),
  bestQuotes: jsonb('best_quotes').$type<string[]>().default([]),
  synthesizedProblemLabel: text('synthesized_problem_label'),
  synthesizedSuccessVision: text('synthesized_success_vision'),
  painPointIds: jsonb('pain_point_ids').$type<number[]>().default([]),
  failedSolutions: jsonb('failed_solutions').$type<string[]>().default([]),
  triggerMoments: jsonb('trigger_moments').$type<string[]>().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('idx_bc_clusters_site').on(table.siteId),
  projectIdx: index('idx_bc_clusters_project').on(table.projectId),
  iterationIdx: index('idx_bc_clusters_iteration').on(table.iterationId),
}));

// ========================================
// SocialHub Module
// ========================================

export const shSettings = pgTable('sh_settings', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  config: jsonb('config').notNull().$type<{
    copywriterModel: string;
    copywriterThinkingBudget: number;
    videoProvider: string;
    videoModel: string;
    ttsProvider: string;
    distributionProvider: string;
    autoSchedule: boolean;
    defaultHashtags: string[];
    brandVoiceFile: string;
    maxPostLength: number;
    defaultSuggestionPrompt: string;
    toneOverrides: string;
    avatarImageUrl: string;
    elevenlabsVoiceId: string;
    viralEngine: ShViralEngineConfig;
  }>(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const shSocialAccounts = pgTable('sh_social_accounts', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  platform: varchar('platform', { length: 30 }).notNull(),
  accountName: varchar('account_name', { length: 255 }).notNull(),
  accountHandle: varchar('account_handle', { length: 255 }),
  authPayload: jsonb('auth_payload'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  platformIdx: index('idx_sh_accounts_platform').on(t.platform),
}));

export const shContentBriefs = pgTable('sh_content_briefs', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  sourceType: varchar('source_type', { length: 30 }).notNull(),
  sourceId: integer('source_id').notNull(),
  sourceTitle: varchar('source_title', { length: 500 }),
  sourceSnapshot: text('source_snapshot'),
  suggestionPrompt: text('suggestion_prompt'),
  outputFormat: varchar('output_format', { length: 20 }).notNull(),
  targetPlatforms: jsonb('target_platforms').$type<string[]>().notNull().default([]),
  targetAccountIds: jsonb('target_account_ids').$type<number[]>().notNull().default([]),
  kbEntriesUsed: jsonb('kb_entries_used').$type<number[]>().default([]),
  brandVoiceUsed: boolean('brand_voice_used').notNull().default(true),
  repurposeGroupId: integer('repurpose_group_id'),
  viralEngineEnabled: boolean('viral_engine_enabled').notNull().default(true),
  viralEngineMode: varchar('viral_engine_mode', { length: 30 }).notNull().default('default'),
  viralEngineProfile: jsonb('viral_engine_profile').$type<ShViralEngineConfig | null>(),
  viralEnginePrompt: text('viral_engine_prompt'),
  videoFormatSlug: varchar('video_format_slug', { length: 100 }),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('idx_sh_briefs_status').on(t.status),
  sourceIdx: index('idx_sh_briefs_source').on(t.sourceType, t.sourceId),
}));

export const shGeneratedCopy = pgTable('sh_generated_copy', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  hookLine: text('hook_line').notNull(),
  bodyText: text('body_text').notNull(),
  hashtags: jsonb('hashtags').$type<string[]>().default([]),
  cta: text('cta'),
  imageLayoutDescription: text('image_layout_description'),
  videoScript: text('video_script'),
  variantIndex: integer('variant_index').notNull().default(0),
  generationModel: varchar('generation_model', { length: 100 }),
  promptUsed: text('prompt_used'),
  viralEngineSnapshot: jsonb('viral_engine_snapshot').$type<ShViralEngineConfig | null>(),
  pcmProfile: jsonb('pcm_profile').$type<Record<string, string> | null>(),
  contentAngle: varchar('content_angle', { length: 100 }),
  videoFormatSlug: varchar('video_format_slug', { length: 100 }),
  isEdited: boolean('is_edited').notNull().default(false),
  editedAt: timestamp('edited_at'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  briefIdx: index('idx_sh_copy_brief').on(t.briefId),
  statusIdx: index('idx_sh_copy_status').on(t.status),
}));

export const shTemplates = pgTable('sh_templates', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  aspectRatio: varchar('aspect_ratio', { length: 10 }).notNull(),
  jsxTemplate: text('jsx_template').notNull(),
  previewUrl: text('preview_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  slugIdx: uniqueIndex('uq_sh_templates_site_slug').on(t.siteId, t.slug),
}));

export const shMediaAssets = pgTable('sh_media_assets', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  copyId: integer('copy_id').references(() => shGeneratedCopy.id),
  templateId: integer('template_id').references(() => shTemplates.id),
  type: varchar('type', { length: 10 }).notNull(),
  mediaUrl: text('media_url'),
  thumbnailUrl: text('thumbnail_url'),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: integer('duration_seconds'),
  fileSizeBytes: integer('file_size_bytes'),
  renderProvider: varchar('render_provider', { length: 30 }),
  renderModel: varchar('render_model', { length: 50 }),
  renderCostUsd: real('render_cost_usd'),
  videoFormatSlug: varchar('video_format_slug', { length: 100 }),
  viralEngineSnapshot: jsonb('viral_engine_snapshot').$type<ShViralEngineConfig | null>(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  briefIdx: index('idx_sh_media_brief').on(t.briefId),
  statusIdx: index('idx_sh_media_status').on(t.status),
}));

export const shPublishLog = pgTable('sh_publish_log', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  mediaAssetId: integer('media_asset_id').references(() => shMediaAssets.id),
  accountId: integer('account_id').notNull().references(() => shSocialAccounts.id),
  platform: varchar('platform', { length: 30 }).notNull(),
  externalPostId: varchar('external_post_id', { length: 255 }),
  externalPostUrl: text('external_post_url'),
  publishedAt: timestamp('published_at'),
  scheduledFor: timestamp('scheduled_for'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  briefIdx: index('idx_sh_publish_brief').on(t.briefId),
  statusIdx: index('idx_sh_publish_status').on(t.status),
  platformIdx: index('idx_sh_publish_platform').on(t.platform),
}));

export const shPostMetrics = pgTable('sh_post_metrics', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  publishLogId: integer('publish_log_id').notNull().references(() => shPublishLog.id, { onDelete: 'cascade' }),
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  engagementRate: real('engagement_rate'),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
});

export const shQueue = pgTable('sh_queue', {
  id: serial('id').primaryKey(),
  siteId: integer('site_id').references(() => sites.id, { onDelete: 'restrict' }),
  briefId: integer('brief_id').notNull().references(() => shContentBriefs.id, { onDelete: 'cascade' }),
  priority: integer('priority').notNull().default(50),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('idx_sh_queue_status').on(t.status),
  priorityIdx: index('idx_sh_queue_priority').on(t.priority),
}));
