/**
 * Content Gaps Models
 * TypeScript interfaces for gap detection, curation, and tracking
 */

/**
 * Gap status enumeration
 */
export type ContentGapStatus = 'new' | 'acknowledged' | 'archived' | 'in_progress';

/**
 * Content gap record
 * Represents identified visibility gap detected by AI analysis
 */
export interface ContentGap {
  id: number;
  gap_title: string;
  gap_description: string;
  confidence_score: number; // 0-100
  suggested_angle: string;
  related_queries: string[];
  source_models: string[]; // e.g., ['openai/gpt-4', 'anthropic/claude-sonnet']
  author_notes?: string;
  status: ContentGapStatus;
  created_at: Date;
  acknowledged_at?: Date;
  geo_run_id: number; // FK to geoRuns
}

/**
 * Request to acknowledge/approve gap
 */
export interface AcknowledgeGapRequest {
  author_notes: string;
  selected_models: string[];
  action: 'generate_draft' | 'snooze' | 'archive';
}

/**
 * Response after acknowledging gap
 */
export interface AcknowledgeGapResponse {
  gap_id: number;
  status: ContentGapStatus;
  author_notes: string;
  acknowledged_at: Date;
  draft_generation_started: boolean;
  draft_id?: number;
}

/**
 * Archive gap request
 */
export interface ArchiveGapRequest {
  reason: string;
}

/**
 * Snooze gap request (hide temporarily)
 */
export interface SnoozeGapRequest {
  days: number; // e.g., 14
}

/**
 * Query parameters for gap listing
 */
export interface ContentGapsQueryParams {
  status?: ContentGapStatus | ContentGapStatus[];
  confidence_min?: number;
  confidence_max?: number;
  sort_by?: 'confidence' | 'recency';
  limit?: number;
  offset?: number;
}

/**
 * List gaps response with pagination and stats
 */
export interface ListContentGapsResponse {
  gaps: ContentGap[];
  recent_run: {
    id: number;
    runAt: Date;
    queriesCount: number;
    gapsFound: number;
    gapsDeduped: number;
  };
  stats: {
    total_new: number;
    total_acknowledged: number;
    total_archived: number;
  };
}

/**
 * Gap creation (from gap analysis engine)
 * Used internally when gaps are detected
 */
export interface CreateContentGapRequest {
  gap_title: string;
  gap_description: string;
  confidence_score: number;
  suggested_angle: string;
  related_queries: string[];
  source_models: string[];
  geo_run_id: number;
}

/**
 * Dashboard stats widget
 */
export interface GapDashboardStats {
  last_run_timestamp: Date;
  total_gaps_in_run: number;
  gaps_acknowledged: number;
  gaps_archived: number;
  next_run_countdown_minutes: number;
}

/**
 * Gap with context for curator UI
 */
export interface GapWithContext extends ContentGap {
  knowledge_base_hints: {
    id: number;
    title: string;
    importance_score: number;
  }[];
}
