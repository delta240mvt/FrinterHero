import {
  getDefaultSiteConfig,
  type DefaultSiteConfig,
  type SiteSlug,
} from '../../packages/site-config/src/index';

const DEFAULT_SITE_SLUG: SiteSlug = 'przemyslawfilipiak';

export interface SitePresentation {
  slug: SiteSlug;
  entityType: 'Person' | 'Organization';
  displayName: string;
  shortName: string;
  canonicalBaseUrl: string;
  primaryDomain: string;
  defaultTitle: string;
  defaultDescription: string;
  blogTitle: string;
  blogDescription: string;
  articleSuffix: string;
  authorName: string;
  contactEmail: string;
  socialLinks: string[];
  heroTagline: string;
  llmsSummary: string;
}

function normalizeSiteSlug(value: string | undefined): SiteSlug {
  if (value === 'focusequalsfreedom' || value === 'frinter' || value === 'przemyslawfilipiak') {
    return value;
  }

  return DEFAULT_SITE_SLUG;
}

export function getCurrentSiteSlug(): SiteSlug {
  return normalizeSiteSlug(process.env.SITE_SLUG);
}

export function getCurrentSiteConfig(): DefaultSiteConfig {
  return getDefaultSiteConfig(getCurrentSiteSlug()) ?? getDefaultSiteConfig(DEFAULT_SITE_SLUG)!;
}

export function getSitePresentation(): SitePresentation {
  const site = getCurrentSiteConfig();

  return {
    slug: site.slug,
    entityType: 'Person',
    displayName: site.displayName,
    shortName: site.brandConfig.shortName,
    canonicalBaseUrl: site.seoConfig.canonicalBaseUrl,
    primaryDomain: site.primaryDomain,
    defaultTitle: 'Przemysław Filipiak — High Performer. Deep Focus Founder. Wholebeing Maximizer.',
    defaultDescription: 'Personal site of Przemysław Filipiak — High Performer and Deep Focus Founder. Optimizing life through Focus Sprints (Frints) and WholeBeing performance systems.',
    blogTitle: 'Blog — Przemysław Filipiak',
    blogDescription: 'Essays on AI development, deep work, and building in public. By Przemysław Filipiak.',
    articleSuffix: 'Przemysław Filipiak',
    authorName: site.brandConfig.personName,
    contactEmail: `hello@${site.primaryDomain}`,
    socialLinks: [
      'https://github.com/delta240mvt',
      'https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/',
    ],
    heroTagline: 'AI Product Engineer. Deep Focus Founder. Wholebeing Maximizer.',
    llmsSummary: 'Przemysław Filipiak is a Polish AI developer and founder focused on deep work systems, GEO, and WholeBeing performance.',
  };
}

export function absoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${getSitePresentation().canonicalBaseUrl}/`).toString();
}
