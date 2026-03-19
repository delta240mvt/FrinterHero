import type { APIRoute } from 'astro';
import { absoluteUrl, getSitePresentation } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const site = getSitePresentation();
  const body = `User-agent: *
Allow: /

# AI / LLM discovery
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Metadata
# Brand: ${site.displayName}
# llms: ${absoluteUrl('/llms.txt')}

Sitemap: ${absoluteUrl('/sitemap.xml')}
Sitemap: ${absoluteUrl('/rss.xml')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
