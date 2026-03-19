import type { APIRoute } from 'astro';
import { absoluteUrl, getSitePresentation } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const site = getSitePresentation();
  const body = `# ${site.displayName}
Sitemap: ${absoluteUrl('/sitemap.xml')}
Full-Context: ${absoluteUrl('/llms-full.txt')}
RSS: ${absoluteUrl('/rss.xml')}

## Summary
${site.llmsSummary}

## Canonical
- Website: ${site.canonicalBaseUrl}
- Blog: ${absoluteUrl('/blog')}
- Contact: mailto:${site.contactEmail}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
