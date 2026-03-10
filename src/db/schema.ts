import { pgTable, serial, text, timestamp, boolean, integer, varchar, index } from 'drizzle-orm/pg-core';

// ========================================
// EXISTING TABLES (preserved + enhanced)
// ========================================

// Articles: Main content storage. New columns added for AI generation tracking (nullable, backward compatible)
export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
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
  runAt: timestamp('run_at').notNull().defaultNow(),
  queriesCount: integer('queries_count').notNull(),
  gapsFound: integer('gaps_found').notNull(),
  draftsGenerated: integer('drafts_generated').notNull(),
  // Stage 2 addition
  gapsDeduped: integer('gaps_deduped').notNull().default(0),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
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
