/**
 * TASK-08: Single source of truth for Social Hub source types.
 * Import from here instead of defining VALID_TYPES in each API file.
 */

export const SOURCE_TYPES = [
  'article',
  'pain_point',
  'pain_cluster',
  'content_gap',
  'kb_entry',
  'reddit_gap',
  'yt_gap',
] as const;

export type SourceType = typeof SOURCE_TYPES[number];

export const isValidSourceType = (t: string): t is SourceType =>
  (SOURCE_TYPES as readonly string[]).includes(t);

/** Normalise legacy plural forms written before BUG-01 was fixed */
export const LEGACY_TYPE_MAP: Record<string, SourceType> = {
  articles:      'article',
  pain_points:   'pain_point',
  pain_clusters: 'pain_cluster',
  content_gaps:  'content_gap',
  kb_entries:    'kb_entry',
  reddit_gaps:   'reddit_gap',
  yt_gaps:       'yt_gap',
};

export const normalizeSourceType = (t: string): SourceType | null =>
  isValidSourceType(t) ? t : (LEGACY_TYPE_MAP[t] ?? null);
