export function sessionCanAccessSite(
  session: { siteId?: number | null },
  site: { id: number },
): boolean {
  if (session.siteId == null) return true;
  return session.siteId === site.id;
}
