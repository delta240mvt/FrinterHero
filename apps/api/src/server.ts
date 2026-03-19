import * as http from 'node:http';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { json } from './helpers.js';
import { routeRequest } from './router.js';

dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env.local') });

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch((error) => {
    console.error('[api] request failed', error);
    json(res, 500, {
      error: 'Internal server error',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
});

server.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`);
});
