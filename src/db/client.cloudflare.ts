import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// drizzle-orm/neon-http calls neon() as sql(query, params, opts).
// @neondatabase/serverless v1.x removed that — only tagged template or sql.query() allowed.
// This proxy redirects direct function calls to sql.query() so drizzle works with neon v1.x.
function createNeonClient(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return new Proxy(sql, {
    apply(_target, _thisArg, args: [string, unknown[]?, unknown?]) {
      return (sql as any).query(args[0], args[1], args[2]);
    },
  });
}

let cloudflareDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setCloudflareDb(instance: unknown) {
  cloudflareDb = instance as ReturnType<typeof drizzle<typeof schema>>;
}

export function initCloudflareDb(_hyperdrive: unknown, databaseUrl: string) {
  if (!cloudflareDb) {
    const sql = createNeonClient(databaseUrl);
    cloudflareDb = drizzle(sql as any, { schema });
  }
}

export function getCloudflareDb() {
  if (!cloudflareDb) {
    throw new Error('Cloudflare DB has not been initialised');
  }

  return cloudflareDb;
}

export { schema };
