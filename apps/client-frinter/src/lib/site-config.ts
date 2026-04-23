import { SITE } from '../config/site';
import { SEO, absoluteUrl as absoluteSeoUrl } from '../config/seo';

export interface SitePresentation {
  slug: typeof SITE.slug;
  entityType: typeof SITE.entityType;
  displayName: string;
  shortName: string;
  siteName: string;
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

const SITE_PRESENTATION: SitePresentation = {
  slug: SITE.slug,
  entityType: SITE.entityType,
  displayName: SITE.displayName,
  shortName: SITE.shortName,
  siteName: SITE.siteName,
  canonicalBaseUrl: SEO.canonicalBaseUrl,
  primaryDomain: SITE.primaryDomain,
  defaultTitle: SITE.defaultTitle,
  defaultDescription: SITE.defaultDescription,
  blogTitle: SITE.blogTitle,
  blogDescription: SITE.blogDescription,
  articleSuffix: SEO.titleSuffix,
  authorName: SITE.authorName,
  contactEmail: SITE.contactEmail,
  socialLinks: SITE.socialLinks,
  heroTagline: SITE.heroTagline,
  llmsSummary: SITE.llmsSummary,
};

export function getSitePresentation(): SitePresentation {
  return SITE_PRESENTATION;
}

export function getCurrentSiteSlug(): SitePresentation['slug'] {
  return SITE_PRESENTATION.slug;
}

export function absoluteUrl(pathname: string): string {
  return absoluteSeoUrl(pathname);
}
