import http from 'node:http';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const host = process.env.HOST ?? '0.0.0.0';

const payload = {
  service: 'api',
  status: 'bootstrap',
  message: 'Bootstrap API service for monolith split is running.',
  timestamp: new Date().toISOString(),
};

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/live' || url === '/health' || url === '/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...payload, path: url }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
});

server.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`);
});
