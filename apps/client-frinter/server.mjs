import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler } from './dist/server/entry.mjs';

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist', 'client');

const MIME = {
  woff2: 'font/woff2',
  webp: 'image/webp',
  js: 'application/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  json: 'application/json',
  txt: 'text/plain',
  xml: 'application/xml',
  webmanifest: 'application/manifest+json',
};

const IMMUTABLE_PREFIXES = ['/fonts/', '/faces/', '/_astro/'];

http.createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  const filePath = path.join(clientDir, urlPath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      handler(req, res);
      return;
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const isImmutable = IMMUTABLE_PREFIXES.some((p) => urlPath.startsWith(p));
    const cacheControl = isImmutable
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': cacheControl,
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(+(process.env.PORT ?? 4321), process.env.HOST ?? '0.0.0.0', () => {
  console.log(`frinter.app server listening on port ${process.env.PORT ?? 4321}`);
});
