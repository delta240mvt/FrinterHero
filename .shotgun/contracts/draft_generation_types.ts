/**
 * Draft Generation Types
 * TypeScript interfaces for AI-powered article draft generation workflow
 */

/**
 * Draft generation request
 * Triggered after author curates and approves a gap
 */
export interface GenerateDraftRequest {
  gap_id: number;
  author_notes: string;
  model: string; // e.g., 'anthropic/claude-sonnet-4-6'
}

/**
 * Draft generation response (immediate, synchronous)
 */
export interface GenerateDraftResponse {
  article_id: number;
  gap_id: number;
  status: 'draft';
  title: string;
  slug: string;
  description: string;
  content: string; // HTML
  tags: string[];
  reading_time: number; // minutes
  generated_by_model: string;
  generation_timestamp: Date;
  kb_entries_used: number[]; // IDs of KB entries that informed draft
  featured: boolean;
}

/**
 * Async draft generation job (for long-running generations)
 */
export interface DraftGenerationJob {
  job_id: string;
  gap_id: number;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress?: string;
  started_at: Date;
  completed_at?: Date;
  error_reason?: string;
  article?: GenerateDraftResponse; // populated on completion
}

/**
 * Get draft generation job status
 */
export interface DraftGenerationJobStatus {
  job_id: string;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress?: string;
  started_at: Date;
  completed_at?: Date;
  error_reason?: string;
}

/**
 * Mega-prompt context
 * Complete context sent to AI model for draft generation
 */
export interface DraftGenerationMegaPrompt {
  system_identity: string; // Author's identity, tone, philosophy
  gap_context: {
    gap_title: string;
    gap_description: string;
    suggested_angle: string;
    author_notes: string;
  };
  knowledge_base_context: {
    entry_id: number;
    title: string;
    content_excerpt: string;
    importance_score: number;
  }[];
  output_format_spec: string; // JSON schema specification
  seo_guidelines: string; // Keyword density, structure tips
  brand_voice_guardrails: string; // Examples of natural brand integration
}

/**
 * AI model response for draft
 * Structured JSON returned by LLM
 */
export interface DraftAIResponse {
  title: string;
  description: string;
  content: string; // Markdown
  tags: string[];
  mentions: string[]; // Products/projects mentioned (frinter.app, etc.)
}

/**
 * Draft generation error details
 */
export interface DraftGenerationError {
  error_code: string; // 'INVALID_GAP', 'API_ERROR', 'VALIDATION_FAILED', etc.
  error_message: string;
  details: Record<string, unknown>;
  retry_allowed: boolean;
}

/**
 * Draft generation quality metrics
 */
export interface DraftQualityMetrics {
  response_validation: boolean; // All required fields present
  length_check: boolean; // 800-2500 words
  tone_alignment_score: number; // 0-100
  brand_mention_count: number; // How many brand products mentioned naturally
  hallucination_risk: 'low' | 'medium' | 'high'; // Based on KB grounding
}

/**
 * Suggested editing recommendations from AI
 */
export interface DraftEditingSuggestions {
  tone_improvements: string[];
  clarity_improvements: string[];
  seo_improvements: string[];
  brand_voice_alignment: string[];
}

/**
 * Draft generation telemetry
 */
export interface DraftGenerationTelemetry {
  gap_id: number;
  model: string;
  request_tokens: number;
  response_tokens: number;
  latency_ms: number;
  success: boolean;
  quality_metrics: DraftQualityMetrics;
}
