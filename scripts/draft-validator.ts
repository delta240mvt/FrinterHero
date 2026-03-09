/**
 * draft-validator.ts
 * Validates AI-generated draft responses before article insertion.
 * Input: DraftAIResponse object
 * Output: ValidationResult with isValid, errors, metrics
 * Error handling: never throws, returns structured errors
 */

export interface DraftAIResponse {
  title: string;
  description: string;
  content: string; // markdown
  tags: string[];
  mentions: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  metrics: {
    wordCount: number;
    toneAlignmentScore: number;
    brandMentionCount: number;
  };
}

const IDENTITY_KEYWORDS = [
  'deep work', 'focus', 'founder', 'frinter', 'frinterflow', 'sprint',
  'productivity', 'high performer', 'flow state', 'przemysław', 'delta240',
  'whole being', 'builder', 'building in public', 'three spheres',
  'cal newport', 'rozkwit', 'relacje', 'skupienie',
];

const BRAND_PRODUCTS = ['frinter.app', 'frinterflow', 'frinter', 'delta240'];

function countWords(text: string): number {
  return text.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean).length;
}

function calculateToneAlignmentScore(content: string): number {
  const lowerContent = content.toLowerCase();
  const found = IDENTITY_KEYWORDS.filter(kw => lowerContent.includes(kw));
  return Math.min(100, Math.round((found.length / IDENTITY_KEYWORDS.length) * 100));
}

function countBrandMentions(content: string): number {
  const lowerContent = content.toLowerCase();
  return BRAND_PRODUCTS.reduce((count, product) => {
    const regex = new RegExp(product.replace('.', '\\.'), 'gi');
    return count + (lowerContent.match(regex) || []).length;
  }, 0);
}

export function validateDraft(draft: DraftAIResponse): ValidationResult {
  const errors: string[] = [];

  // Title validation
  if (!draft.title || draft.title.trim() === '') {
    errors.push('title: Missing or empty');
  } else if (draft.title.length > 150) {
    errors.push(`title: Too long (${draft.title.length} chars, max 150)`);
  }

  // Description validation (SEO)
  if (!draft.description || draft.description.trim() === '') {
    errors.push('description: Missing or empty');
  } else if (draft.description.length < 100) {
    errors.push(`description: Too short (${draft.description.length} chars, min 100)`);
  } else if (draft.description.length > 160) {
    errors.push(`description: Too long (${draft.description.length} chars, max 160)`);
  }

  // Content validation
  if (!draft.content || draft.content.trim() === '') {
    errors.push('content: Missing or empty');
  }

  const wordCount = countWords(draft.content || '');
  if (wordCount < 800) {
    errors.push(`content: Too short (${wordCount} words, min 800)`);
  } else if (wordCount > 2500) {
    errors.push(`content: Too long (${wordCount} words, max 2500)`);
  }

  // Tags validation
  if (!draft.tags || !Array.isArray(draft.tags) || draft.tags.length < 3) {
    errors.push(`tags: Too few tags (${draft.tags?.length || 0}, min 3)`);
  }

  const toneAlignmentScore = calculateToneAlignmentScore((draft.content || '') + ' ' + (draft.title || ''));
  const brandMentionCount = countBrandMentions((draft.content || '') + ' ' + (draft.description || ''));

  return {
    isValid: errors.length === 0,
    errors,
    metrics: {
      wordCount,
      toneAlignmentScore,
      brandMentionCount,
    },
  };
}
