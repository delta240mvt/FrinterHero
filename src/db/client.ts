import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  // DATABASE_PUBLIC_URL — public Railway proxy, resolvable during Docker build AND runtime
  // DATABASE_URL       — postgres.railway.internal, runtime-only (ENOTFOUND during build)
  const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_PUBLIC_URL or DATABASE_URL environment variable is required');
  }
  const isInternal = connectionString.includes('.railway.internal');
  const pool = new Pool({
    connectionString,
    ...(isInternal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  _db = drizzle(pool, { schema });
  return _db;
}

// Convenience export — lazily initialised on first use
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
