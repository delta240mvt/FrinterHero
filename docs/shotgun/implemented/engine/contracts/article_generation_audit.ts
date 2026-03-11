/**
 * Article Generation Audit Trail
 * TypeScript interfaces for tracking generation lineage and publication history
 */

/**
 * Article generation record
 * Immutable audit trail linking articles to their source gaps and generation metadata
 */
export interface ArticleGeneration {
  id: number;
  article_id: number; // FK to articles table
  gap_id: number; // FK to content_gaps table
  generated_by_model: string; // e.g., 'anthropic/claude-sonnet-4-6'
  generation_prompt: string; // Full mega-prompt sent to AI (for debugging)
  original_content: string; // AI-generated content (before author edits)
  final_content?: string; // Published content (after author edits)
  author_notes: string; // Custom requirements author specified
  kb_entries_used: number[]; // IDs of KB entries that informed the draft
  models_queried: string[]; // Which models were considered (if multiple tried)
  generation_timestamp: Date; // When AI generated the draft
  publication_timestamp?: Date; // When article was published
  content_changed: boolean; // Did author edit the AI-generated content?
}

/**
 * Request to view generation history
 */
export interface GetArticleGenerationRequest {
  article_id?: number; // Filter by article
  gap_id?: number; // Filter by source gap
}

/**
 * Response with generation history
 */
export interface ArticleGenerationHistoryResponse {
  generations: ArticleGenerationSummary[];
}

/**
 * Summarized generation record (for UI display)
 */
export interface ArticleGenerationSummary {
  id: number;
  article_id: number;
  gap_id: number;
  generated_by_model: string;
  generation_timestamp: Date;
  publication_timestamp?: Date;
  content_changed: boolean;
  kb_entries_used_count: number;
  original_content_length: number;
  final_content_length?: number;
  author_notes: string;
}

/**
 * Generation source information
 * Metadata about how article was generated
 */
export interface GenerationSource {
  gap_id: number;
  gap_title: string;
  gap_description: string;
  gap_confidence_score: number;
  model_used: string;
  generated_timestamp: Date;
}

/**
 * Published article with generation metadata
 * Enhanced article record for display
 */
export interface PublishedArticleWithGeneration {
  article_id: number;
  title: string;
  slug: string;
  description: string;
  status: 'published';
  publishedAt: Date;
  generation_source?: GenerationSource;
  generation_id?: number;
  kb_entries_that_informed_it: {
    id: number;
    title: string;
    importance_score: number;
  }[];
}

/**
 * Content comparison
 * Shows what author changed in the AI-generated draft
 */
export interface ContentComparison {
  generation_id: number;
  original_title: string;
  final_title: string;
  title_changed: boolean;
  original_description: string;
  final_description: string;
  description_changed: boolean;
  original_content_length: number;
  final_content_length: number;
  content_length_delta: number; // words added/removed
  paragraphs_modified: number; // approximate count
}

/**
 * Gap acknowledgment confirmation
 * Record showing gap was addressed by published article
 */
export interface GapAcknowledgmentRecord {
  gap_id: number;
  gap_title: string;
  status_before: 'new' | 'in_progress';
  status_after: 'acknowledged';
  article_published: number; // article_id
  article_title: string;
  acknowledged_at: Date;
}

/**
 * Generation statistics
 * Aggregated metrics for dashboard
 */
export interface GenerationStatistics {
  total_articles_generated: number;
  total_articles_published: number;
  average_content_change_percentage: number; // % of words author edited
  average_time_to_publication_days: number;
  most_used_model: string;
  average_confidence_of_source_gaps: number; // 0-100
}

/**
 * Telemetry event for generation
 */
export interface GenerationTelemetryEvent {
  generation_id: number;
  gap_id: number;
  model: string;
  request_tokens: number;
  response_tokens: number;
  latency_ms: number;
  success: boolean;
  error_code?: string;
  content_length_generated: number; // characters
  tags_suggested: number;
  kb_entries_referenced: number;
}
