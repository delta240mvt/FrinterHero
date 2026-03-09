/**
 * kb-importer.ts
 * Batch markdown importer for Knowledge Base entries.
 * Input: array of {filename, content} (raw markdown with YAML frontmatter)
 * Output: { valid: ValidatedEntry[], errors: ImportError[] }
 * Error handling: returns per-file errors, never throws
 */

export interface ParsedFrontmatter {
  type?: string;
  title?: string;
  tags?: string | string[];
  importance_score?: number;
  source_url?: string;
}

export interface ValidatedKBEntry {
  type: string;
  title: string;
  content: string;
  tags: string[];
  importanceScore: number;
  sourceUrl?: string;
  filename: string;
}

export interface ImportError {
  filename: string;
  errors: string[];
}

export interface ImportResult {
  valid: ValidatedKBEntry[];
  errors: ImportError[];
}

const VALID_TYPES = ['project_spec', 'published_article', 'external_research', 'personal_note'];

function parseFrontmatter(raw: string): { frontmatter: ParsedFrontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const yamlBlock = match[1];
  const body = match[2].trim();
  const frontmatter: ParsedFrontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (key === 'type') frontmatter.type = value;
    else if (key === 'title') frontmatter.title = value;
    else if (key === 'source_url') frontmatter.source_url = value;
    else if (key === 'importance_score') frontmatter.importance_score = parseInt(value, 10);
    else if (key === 'tags') {
      if (value.startsWith('[')) {
        frontmatter.tags = value.slice(1, -1).split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
      } else if (value) {
        frontmatter.tags = value.split(',').map(t => t.trim());
      }
    }
  }

  // Handle YAML list format for tags
  const tagListMatch = yamlBlock.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (tagListMatch) {
    frontmatter.tags = tagListMatch[1]
      .split('\n')
      .filter(l => l.trim().startsWith('-'))
      .map(l => l.replace(/^\s*-\s*/, '').trim());
  }

  return { frontmatter, body };
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function isValidUrl(url: string): boolean {
  try { new URL(url); return true; } catch { return false; }
}

export function importMarkdownFiles(
  files: Array<{ filename: string; content: string }>
): ImportResult {
  const valid: ValidatedKBEntry[] = [];
  const errors: ImportError[] = [];

  for (const file of files) {
    const fileErrors: string[] = [];
    const { frontmatter, body } = parseFrontmatter(file.content);

    if (!frontmatter.type) {
      fileErrors.push('Missing required field: type');
    } else if (!VALID_TYPES.includes(frontmatter.type)) {
      fileErrors.push(`Invalid type "${frontmatter.type}". Must be one of: ${VALID_TYPES.join(', ')}`);
    }

    if (!frontmatter.title || frontmatter.title.trim() === '') {
      fileErrors.push('Missing required field: title');
    }

    if (!body || body.trim().length < 50) {
      fileErrors.push(`Content too short (${body?.trim().length || 0} chars). Minimum 50 characters required`);
    }

    let importanceScore = 50;
    if (frontmatter.importance_score !== undefined) {
      if (isNaN(frontmatter.importance_score) || frontmatter.importance_score < 0 || frontmatter.importance_score > 100) {
        fileErrors.push('importance_score must be an integer between 0 and 100');
      } else {
        importanceScore = frontmatter.importance_score;
      }
    }

    if (frontmatter.source_url && !isValidUrl(frontmatter.source_url)) {
      fileErrors.push(`Invalid source_url format: "${frontmatter.source_url}"`);
    }

    if (fileErrors.length > 0) {
      errors.push({ filename: file.filename, errors: fileErrors });
      continue;
    }

    const rawTags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : frontmatter.tags ? [frontmatter.tags] : [];

    valid.push({
      type: frontmatter.type!,
      title: frontmatter.title!.trim(),
      content: body,
      tags: rawTags.map(normalizeTag).filter(Boolean),
      importanceScore,
      sourceUrl: frontmatter.source_url || undefined,
      filename: file.filename,
    });
  }

  return { valid, errors };
}
