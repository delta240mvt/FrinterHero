import * as schema from './schema';

let cloudflareDb: unknown = null;

export function setCloudflareDb(instance: unknown) {
  cloudflareDb = instance;
}

export function getCloudflareDb() {
  if (!cloudflareDb) {
    throw new Error('Cloudflare DB has not been initialised');
  }

  return cloudflareDb;
}

export { schema };
