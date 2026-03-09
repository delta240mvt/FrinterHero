/**
 * Knowledge Base Models
 * TypeScript interfaces for knowledge base entries and sources
 */

/**
 * Knowledge entry type enumeration
 */
export type KnowledgeEntryType = 
  | 'project_spec'
  | 'published_article'
  | 'external_research'
  | 'personal_note';

/**
 * Knowledge source type enumeration
 */
export type KnowledgeSourceType =
  | 'internal_article'
  | 'external_link'
  | 'imported_markdown'
  | 'api_data';

/**
 * Knowledge source status
 */
export type KnowledgeSourceStatus = 'active' | 'archived';

/**
 * Knowledge source record
 * Tracks where KB entries originate for audit trail and deduplication
 */
export interface KnowledgeSource {
  id: number;
  source_type: KnowledgeSourceType;
  source_name: string;
  source_url?: string;
  import_timestamp: Date;
  status: KnowledgeSourceStatus;
  version: number;
}

/**
 * Knowledge entry record
 * Core unit of author's domain knowledge
 */
export interface KnowledgeEntry {
  id: number;
  type: KnowledgeEntryType;
  title: string;
  content: string;
  source_url?: string;
  tags: string[];
  importance_score: number; // 0-100
  created_at: Date;
  updated_at: Date;
  source_id: number; // FK to knowledge_sources
}

/**
 * Create knowledge entry request
 */
export interface CreateKnowledgeEntryRequest {
  type: KnowledgeEntryType;
  title: string;
  content: string;
  source_url?: string;
  tags: string[];
  importance_score: number;
}

/**
 * Knowledge base search/list response
 */
export interface ListKnowledgeEntriesResponse {
  entries: KnowledgeEntry[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Knowledge entry metadata (for display in draft generation context)
 */
export interface KnowledgeEntryMetadata {
  id: number;
  title: string;
  type: KnowledgeEntryType;
  importance_score: number;
  tags: string[];
  created_at: Date;
}

/**
 * Query parameters for KB search
 */
export interface KnowledgeBaseQueryParams {
  search?: string;
  tags?: string; // comma-separated
  type?: KnowledgeEntryType;
  sort_by?: 'importance' | 'recency';
  limit?: number;
  offset?: number;
}
