export interface HyperdriveBinding {
  connectionString?: string;
}

export interface R2BucketBinding {
  put?: (...args: unknown[]) => Promise<unknown> | unknown;
}

export interface QueueBinding<Message = unknown> {
  send?: (message: Message, options?: unknown) => Promise<void> | void;
}

export interface ApiEnv {
  APP_ENV: string;
  API_BASE_URL: string;
  FRINTER_HOST: string;
  FOCUS_HOST: string;
  PRZEM_HOST: string;
  ADMIN_PASSWORD_HASH: string;
  HYPERDRIVE: HyperdriveBinding;
  ASSETS_BUCKET: R2BucketBinding;
  JOB_QUEUE: QueueBinding;
  YOUTUBE_API_KEY?: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
}

export function readApiEnv(env: Partial<ApiEnv>): ApiEnv {
  const missing: string[] = [];

  if (!env.API_BASE_URL) {
    missing.push('API_BASE_URL');
  }
  if (!env.ADMIN_PASSWORD_HASH) {
    missing.push('ADMIN_PASSWORD_HASH');
  }
  if (!env.HYPERDRIVE) {
    missing.push('HYPERDRIVE');
  }
  if (!env.ASSETS_BUCKET) {
    missing.push('ASSETS_BUCKET');
  }
  if (!env.JOB_QUEUE) {
    missing.push('JOB_QUEUE');
  }
  if (!env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }
  if (!env.BETTER_AUTH_SECRET) {
    missing.push('BETTER_AUTH_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare API env: ${missing.join(', ')}`);
  }

  return {
    APP_ENV: env.APP_ENV ?? 'development',
    API_BASE_URL: env.API_BASE_URL!,
    FRINTER_HOST: env.FRINTER_HOST ?? 'frinter.pl',
    FOCUS_HOST: env.FOCUS_HOST ?? 'focusequalsfreedom.com',
    PRZEM_HOST: env.PRZEM_HOST ?? 'przemyslawfilipiak.com',
    ADMIN_PASSWORD_HASH: env.ADMIN_PASSWORD_HASH!,
    HYPERDRIVE: env.HYPERDRIVE!,
    ASSETS_BUCKET: env.ASSETS_BUCKET!,
    JOB_QUEUE: env.JOB_QUEUE!,
    YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
    DATABASE_URL: env.DATABASE_URL!,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET!,
  };
}
