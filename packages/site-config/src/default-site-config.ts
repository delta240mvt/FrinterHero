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
    displayName: 'Focus Equals Freedom',
    primaryDomain: 'focusequalsfreedom.com',
    brandConfig: {
      siteName: 'Focus Equals Freedom',
      shortName: 'FEF',
      personName: 'Focus Equals Freedom',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://focusequalsfreedom.com',
    },
    featureFlags: {
      brandClarity: true,
      socialHub: true,
    },
    llmContext: 'Bootstrap tenant for future client2 extraction.',
  },
  {
    slug: 'frinter',
    displayName: 'Frinter',
    primaryDomain: 'frinter.app',
    brandConfig: {
      siteName: 'Frinter',
      shortName: 'FR',
      personName: 'Frinter',
    },
    seoConfig: {
      canonicalBaseUrl: 'https://frinter.app',
    },
    featureFlags: {
      brandClarity: true,
      socialHub: true,
    },
    llmContext: 'Bootstrap tenant for future client3 extraction.',
  },
];

export function getDefaultSiteConfig(slug: string): DefaultSiteConfig | null {
  return DEFAULT_SITE_CONFIGS.find((site) => site.slug === slug) ?? null;
}
