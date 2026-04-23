export type SiteSlug = 'frinter';

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
  slug: 'frinter',
  entityType: 'Person',
  displayName: 'Przemysław Filipiak',
  shortName: 'P·F',
  siteName: 'Przemysław Filipiak',
  primaryDomain: 'frinter.app',
  canonicalBaseUrl: 'https://frinter.app',
  defaultTitle: 'Przemysław Filipiak - High Performer. Deep Focus Founder. WholeBeing Maximizer.',
  defaultDescription:
    'Personal site of Przemysław Filipiak. Focused on Frinter, AI product engineering, and whole-being performance systems.',
  blogTitle: 'Blog - Przemysław Filipiak',
  blogDescription: 'Notes on AI development, deep work, and building Frinter in public.',
  authorName: 'Przemysław Filipiak',
  contactEmail: 'hello@frinter.app',
  socialLinks: [
    'https://github.com/delta240mvt',
    'https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/',
  ],
  heroTagline: 'AI Product Engineer. Deep Focus Founder. WholeBeing Maximizer.',
  llmsSummary:
    'Przemysław Filipiak is a Polish AI product engineer and founder building Frinter around focus, privacy, and whole-being performance.',
};

export function getSiteConfig(): SiteConfig {
  return SITE;
}

export function getSitePresentation(): SiteConfig {
  return SITE;
}
