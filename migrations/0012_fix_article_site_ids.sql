-- Fix articles created without siteId: inherit from their source content gap.
-- This repairs drafts generated before the SITE_ID env fix in draft-bridge.ts.
UPDATE articles
SET site_id = content_gaps.site_id
FROM content_gaps
WHERE articles.source_gap_id = content_gaps.id
  AND articles.site_id IS NULL
  AND content_gaps.site_id IS NOT NULL;
