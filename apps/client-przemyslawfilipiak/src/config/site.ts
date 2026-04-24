export type SiteSlug = 'przemyslawfilipiak';

export interface SiteConfig {
  slug: SiteSlug;
  entityType: 'Person';
  displayName: string;
  shortName: string;
  siteName: string;
  primaryDomain: string;
  canonicalBaseUrl: string;
  defaultTitle: string;
  defaultDescription: string;
  blogTitle: string;
  blogDescription: string;
  authorName: string;
  contactEmail: string;
  socialLinks: string[];
  heroTagline: string;
  llmsSummary: string;
}

export const SITE: SiteConfig = {
  slug: 'przemyslawfilipiak',
  entityType: 'Person',
  displayName: 'Przemyslaw Filipiak',
  shortName: 'P·F',
  siteName: 'Przemyslaw Filipiak',
  primaryDomain: 'przemyslawfilipiak.com',
  canonicalBaseUrl: 'https://przemyslawfilipiak.com',
  defaultTitle: 'Przemyslaw Filipiak — High Performer. Deep Focus Founder. Wholebeing Maximizer.',
  defaultDescription:
    'Personal site of Przemyslaw Filipiak — High Performer and Deep Focus Founder. Optimizing life through Focus Sprints and WholeBeing performance systems.',
  blogTitle: 'Blog — Przemyslaw Filipiak',
  blogDescription: 'Essays on AI development, deep work, and building in public. By Przemyslaw Filipiak.',
  authorName: 'Przemyslaw Filipiak',
  contactEmail: 'hello@frinter.app',
  socialLinks: [
    'https://github.com/delta240mvt',
    'https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/',
  ],
  heroTagline: 'AI Product Engineer. Deep Focus Founder. Wholebeing Maximizer.',
  llmsSummary:
    'Przemyslaw Filipiak is a Polish AI developer and founder focused on deep work systems, GEO, and WholeBeing performance.',
};

export function getSiteConfig(): SiteConfig {
  return SITE;
}

export function getSitePresentation(): SiteConfig {
  return SITE;
}
