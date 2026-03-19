import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPathSegments, json } from './helpers.js';
import type { RouteContext } from './helpers.js';
import { handle as handleAdmin } from './routes/admin.js';
import { handle as handleArticles } from './routes/articles.js';
import { handle as handleAuth } from './routes/auth.js';
import { handle as handleBrandClarity } from './routes/brand-clarity.js';
import { handle as handleContentGaps } from './routes/content-gaps.js';
import { handle as handleGeo } from './routes/geo.js';
import { handle as handleJobs } from './routes/jobs.js';
import { handle as handleKnowledge } from './routes/knowledge.js';
import { handle as handleReddit } from './routes/reddit.js';
import { handle as handleSites } from './routes/sites.js';
import { handle as handleSocialHub } from './routes/social-hub.js';
import { handle as handleYoutube } from './routes/youtube.js';

const routeHandlers = [
  handleSites,
  handleAuth,
  handleAdmin,
  handleGeo,
  handleArticles,
  handleKnowledge,
  handleContentGaps,
  handleSocialHub,
  handleBrandClarity,
  handleReddit,
  handleYoutube,
  handleJobs,
];

export async function routeRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET';
  const { url, pathname, segments } = getPathSegments(req);

  if (pathname === '/health' || pathname === '/live' || pathname === '/ready') {
    json(res, 200, { service: 'api', status: 'ok', path: pathname, timestamp: new Date().toISOString() });
    return;
  }

  const ctx: RouteContext = { req, res, method, url, pathname, segments };

  for (const handler of routeHandlers) {
    if (await handler(ctx)) return;
  }

  json(res, 404, { error: 'Not found', method, pathname });
}
