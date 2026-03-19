import type { APIRoute } from 'astro';
import { absoluteUrl, getCurrentSiteConfig, getSitePresentation } from '@/lib/site-config';

export const GET: APIRoute = async () => {
  const site = getSitePresentation();
  const siteConfig = getCurrentSiteConfig();

  const body = `# Full Context: ${site.displayName}

## Identity
- Name: ${site.displayName}
- Canonical URL: ${site.canonicalBaseUrl}
- Primary domain: ${site.primaryDomain}
- Contact: ${site.contactEmail}

## Summary
${site.llmsSummary}

## Platform Context
${siteConfig.llmContext || 'No extended tenant-specific context has been configured yet.'}

## Discovery Endpoints
- Home: ${absoluteUrl('/')}
- Blog: ${absoluteUrl('/blog')}
- RSS: ${absoluteUrl('/rss.xml')}
- Sitemap: ${absoluteUrl('/sitemap.xml')}
- Structured context: ${absoluteUrl('/llms.txt')}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
