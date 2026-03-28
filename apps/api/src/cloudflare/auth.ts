import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';

export function createAuth(env: { DATABASE_URL: string; BETTER_AUTH_SECRET: string }) {
  return betterAuth({
    database: {
      provider: 'postgresql',
      url: env.DATABASE_URL,
    },
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: ['https://frinter.app', 'http://localhost:3000'],
  });
}
