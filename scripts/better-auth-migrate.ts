#!/usr/bin/env tsx
/**
 * better-auth-migrate.ts
 *
 * Creates BetterAuth tables in NeonDB.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/better-auth-migrate.ts
 *
 * Or with .env file:
 *   npx tsx scripts/better-auth-migrate.ts
 */

import pg from 'pg';
import * as dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const MIGRATION_SQL = `
-- BetterAuth tables for NeonDB
-- Run this once against your NeonDB database

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  image TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP,
  "refreshTokenExpiresAt" TIMESTAMP,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"("userId");
CREATE INDEX IF NOT EXISTS account_user_id_idx ON "account"("userId");
`;

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Connecting to NeonDB...');
    const client = await pool.connect();

    console.log('Running BetterAuth migration...');
    await client.query(MIGRATION_SQL);

    console.log('BetterAuth tables created successfully');
    console.log('\nNext steps:');
    console.log('1. Set DATABASE_URL in your Cloudflare Worker secrets:');
    console.log('   wrangler secret put DATABASE_URL');
    console.log('2. Set BETTER_AUTH_SECRET:');
    console.log('   wrangler secret put BETTER_AUTH_SECRET');
    console.log('3. Create your admin user via the auth API:');
    console.log('   POST /api/auth/sign-up/email');
    console.log('   { "email": "admin@example.com", "password": "...", "name": "Admin" }');

    client.release();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
