import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

let cloudflareDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setCloudflareDb(instance: unknown) {
  cloudflareDb = instance as ReturnType<typeof drizzle<typeof schema>>;
}

export function initCloudflareDb(hyperdrive: { connectionString: string }) {
  if (!cloudflareDb) {
    const pool = new Pool({ connectionString: hyperdrive.connectionString });
    cloudflareDb = drizzle(pool, { schema });
  }
}

export function getCloudflareDb() {
  if (!cloudflareDb) {
    throw new Error('Cloudflare DB has not been initialised');
  }

  return cloudflareDb;
}

export { schema };
