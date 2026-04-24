import { marked } from 'marked';

export function parseMarkdown(markdown: string): string {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  const result = marked.parse(markdown);

  if (typeof result === 'string') {
    return result;
  }

  return markdown;
}

export function calculateReadingTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, ' ');
  const wordCount = text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  const minutes = Math.ceil(wordCount / 200);
  return Math.max(1, minutes);
}
