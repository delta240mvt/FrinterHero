import { Hono } from 'hono';
import type { ApiEnv } from './env.ts';
import { initCloudflareDb, getCloudflareDb } from '../../../../src/db/client.ts';

export type HonoEnv = {
  Bindings: ApiEnv;
  Variables: {
    db: ReturnType<typeof getCloudflareDb>;
    session: import('../../../../src/db/schema.ts').SessionRecord | null;
  };
};

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use('*', async (c, next) => {
    if (c.env?.HYPERDRIVE) {
      initCloudflareDb(c.env.HYPERDRIVE);
      c.set('db', getCloudflareDb());
    }
    await next();
  });

  app.get('/health', (c) => c.json({ service: 'api', status: 'ok' }));

  return app;
}

export const honoApp = createApp();
