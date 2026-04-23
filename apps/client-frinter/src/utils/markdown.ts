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
