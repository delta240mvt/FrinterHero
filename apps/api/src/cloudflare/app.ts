import { Hono } from 'hono';
import type { ApiEnv } from './env.ts';
import { readApiEnv } from './env.ts';
import { routeRequest } from './router.ts';
import { getCloudflareDb } from '../../../../src/db/client.ts';

export type HonoEnv = {
  Bindings: ApiEnv;
  Variables: {
    db: ReturnType<typeof getCloudflareDb>;
    session: unknown | null;
  };
};

export function createApp() {
  const app = new Hono<HonoEnv>();

  app.use('*', async (c, next) => {
    if (c.env?.HYPERDRIVE) {
      const { setCloudflareDb } = await import('../../../../src/db/client.ts');
      // Initialize DB if needed
      setCloudflareDb({});
      c.set('db', getCloudflareDb());
    }
    await next();
  });

  // Delegate all routes to the existing router for now
  // This will be replaced with individual Hono routes in subsequent tasks
  app.all('*', async (c) => {
    const method = c.req.method;
    const pathname = new URL(c.req.url).pathname;

    let response: Response;

    try {
      if (method === 'GET' && pathname === '/health') {
        response = await routeRequest(c.req as Request);
      } else {
        response = await routeRequest(c.req as Request, readApiEnv(c.env));
      }
    } catch (error) {
      // Re-throw to let index.ts's error handler deal with it
      throw error;
    }

    return response;
  });

  // Error handler - ensures all errors are returned as JSON
  app.onError((error, c) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      type: 'error',
      message: errorMessage,
    }));
    return c.json({
      error: 'Internal server error',
      detail: errorMessage,
    }, 500);
  });

  return app;
}

export const honoApp = createApp();
