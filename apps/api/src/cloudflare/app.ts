import { Hono } from 'hono';
import type { ApiEnv } from './env.ts';
import { initCloudflareDb, getCloudflareDb } from '../../../../src/db/client.ts';
import { createAuth } from './auth.ts';
import { authRouter } from './routes/auth.ts';
import { jobsRouter } from './routes/jobs.ts';
import { adminRouter } from './routes/admin.ts';
import { sitesRouter } from './routes/sites.ts';
import { articlesRouter } from './routes/articles.ts';
import { knowledgeRouter } from './routes/knowledge.ts';
import { geoRouter } from './routes/geo.ts';
import { contentGapsRouter } from './routes/content-gaps.ts';
import { redditRouter } from './routes/reddit.ts';
import { youtubeRouter } from './routes/youtube.ts';
import { brandClarityRouter } from './routes/brand-clarity.ts';
import { socialHubRouter } from './routes/social-hub.ts';
import { yoloRouter } from './routes/yolo.ts';

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
      initCloudflareDb(c.env.HYPERDRIVE as { connectionString: string });
      c.set('db', getCloudflareDb());
    }
    await next();
  });

  app.get('/health', (c) => c.json({ service: 'api', status: 'ok' }));

  app.all('/api/auth/*', async (c) => {
    const auth = createAuth({
      DATABASE_URL: c.env.DATABASE_URL,
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
    });
    return auth.handler(c.req.raw);
  });

  app.route('/', authRouter);
  app.route('/', jobsRouter);
  app.route('/', adminRouter);
  app.route('/', sitesRouter);
  app.route('/', articlesRouter);
  app.route('/', knowledgeRouter);
  app.route('/', geoRouter);
  app.route('/', contentGapsRouter);
  app.route('/', redditRouter);
  app.route('/', youtubeRouter);
  app.route('/', brandClarityRouter);
  app.route('/', socialHubRouter);
  app.route('/', yoloRouter);

  return app;
}

export const honoApp = createApp();
