export type SiteSlug = 'przemyslawfilipiak' | 'focusequalsfreedom' | 'frinter';

export interface DefaultSiteConfig {
  slug: SiteSlug;
  displayName: string;
  primaryDomain: string;
  brandConfig: {
    siteName: string;
    shortName: string;
    personName: string;
  };
  seoConfig: {
    canonicalBaseUrl: string;
  };
  featureFlags: Record<string, boolean>;
  llmContext: string;
}

export const DEFAULT_SITE_CONFIGS: DefaultSiteConfig[] = [
  {
    slug: 'przemyslawfilipiak',
    displayName: 'Przemysław Filipiak',
    primaryDomain: 'przemyslawfilipiak.com',
    brandConfig: {
      siteName: 'Przemysław Filipiak',
      shortName: 'P·F',
      personName: 'Przemysław Filipiak',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://przemyslawfilipiak.com',
    },
    featureFlags: {
      brandClarity: true,
      socialHub: true,
    },
    llmContext: 'Primary legacy site for the existing monolith.',
  },
  {
    slug: 'focusequalsfreedom',
    displayName: 'Przemysław Filipiak',
    primaryDomain: 'focusequalsfreedom.com',
    brandConfig: {
      siteName: 'Przemysław Filipiak',
      shortName: 'P·F',
      personName: 'Przemysław Filipiak',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://focusequalsfreedom.com',
    },
    featureFlags: {
      brandClarity: true,
      socialHub: true,
    },
    llmContext: 'Replica tenant for the Przemyslaw Filipiak site on a separate client deployment.',
  },
  {
    slug: 'frinter',
    displayName: 'Przemysław Filipiak',
    primaryDomain: 'frinter.app',
    brandConfig: {
      siteName: 'Przemysław Filipiak',
      shortName: 'P·F',
      personName: 'Przemysław Filipiak',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://frinter.app',
    },
    featureFlags: {
      brandClarity: true,
      socialHub: true,
    },
    llmContext: 'Replica tenant for the Przemyslaw Filipiak site on a separate client deployment.',
  },
];

export function getDefaultSiteConfig(slug: string): DefaultSiteConfig | null {
  return DEFAULT_SITE_CONFIGS.find((site) => site.slug === slug) ?? null;
}
