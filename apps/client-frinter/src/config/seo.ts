import { SITE, type SiteConfig } from './site';

export interface SeoConfig {
  site: SiteConfig;
  canonicalBaseUrl: string;
  themeColor: string;
  backgroundColor: string;
  manifestName: string;
  manifestShortName: string;
  titleSuffix: string;
}

export const SEO: SeoConfig = {
  site: SITE,
  canonicalBaseUrl: SITE.canonicalBaseUrl,
  themeColor: '#0f172a',
  backgroundColor: '#0f172a',
  manifestName: SITE.displayName,
  manifestShortName: SITE.shortName,
  titleSuffix: 'Przemysław Filipiak',
};

export function getSeoConfig(): SeoConfig {
  return SEO;
}

export function absoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${SEO.canonicalBaseUrl}/`).toString();
}

export function formatRssDate(date: Date): string {
  return date.toUTCString();
}

export function formatSitemapDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getLatestDate(dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;

  for (const date of dates) {
    if (!date) {
      continue;
    }

    if (!latest || date.getTime() > latest.getTime()) {
      latest = date;
    }
  }

  return latest;
}
