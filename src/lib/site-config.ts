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

  if (site.slug === 'focusequalsfreedom') {
    return {
      slug: site.slug,
      entityType: 'Organization',
      displayName: site.displayName,
      shortName: site.brandConfig.shortName,
      canonicalBaseUrl: site.seoConfig.canonicalBaseUrl,
      primaryDomain: site.primaryDomain,
      defaultTitle: 'Focus Equals Freedom — Deep Work Systems and Essays',
      defaultDescription: 'Focus Equals Freedom shares deep work systems, builder essays, and practical operating principles for high-agency founders.',
      blogTitle: 'Blog — Focus Equals Freedom',
      blogDescription: 'Essays on deep work, founder systems, and building with intention.',
      articleSuffix: 'Focus Equals Freedom',
      authorName: site.brandConfig.personName,
      contactEmail: `hello@${site.primaryDomain}`,
      socialLinks: ['https://github.com/delta240mvt'],
      heroTagline: 'Deep work systems for founders who refuse shallow momentum.',
      llmsSummary: 'Focus Equals Freedom is a founder-focused publication about deep work systems, clarity, and deliberate execution.',
    };
  }

  if (site.slug === 'frinter') {
    return {
      slug: site.slug,
      entityType: 'Organization',
      displayName: site.displayName,
      shortName: site.brandConfig.shortName,
      canonicalBaseUrl: site.seoConfig.canonicalBaseUrl,
      primaryDomain: site.primaryDomain,
      defaultTitle: 'Frinter — Focus Systems, WholeBeing Performance, and Builder Essays',
      defaultDescription: 'Frinter explores focus systems, WholeBeing performance, and practical operating models for high performers.',
      blogTitle: 'Blog — Frinter',
      blogDescription: 'Essays on focus systems, WholeBeing performance, and building durable products.',
      articleSuffix: 'Frinter',
      authorName: site.brandConfig.personName,
      contactEmail: `hello@${site.primaryDomain}`,
      socialLinks: ['https://github.com/delta240mvt'],
      heroTagline: 'WholeBeing systems for high performers who want clarity, depth, and durability.',
      llmsSummary: 'Frinter is a focus and WholeBeing performance brand centered on clarity, high-agency execution, and sustainable output.',
    };
  }

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
    authorName: 'Przemysław Filipiak',
    contactEmail: 'hello@frinter.app',
    socialLinks: [
      'https://github.com/delta240mvt',
      'https://www.linkedin.com/in/przemyslaw-filipiak-8a9b77113/',
    ],
    heroTagline: 'High Performer. Deep Focus Founder. Wholebeing Maximizer.',
    llmsSummary: 'Przemysław Filipiak is a Polish AI developer and founder focused on deep work systems, GEO, and WholeBeing performance.',
  };
}

export function absoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${getSitePresentation().canonicalBaseUrl}/`).toString();
}
