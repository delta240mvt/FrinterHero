const explicitTopics = process.argv[2];
const topics = (explicitTopics ?? process.env.WORKER_TOPICS ?? 'general')
  .split(',')
  .map((topic) => topic.trim())
  .filter(Boolean);

const workerName = process.env.WORKER_NAME ?? `worker:${topics.join('+')}`;
const concurrency = Number.parseInt(process.env.WORKER_CONCURRENCY ?? '1', 10);

console.log(`[${workerName}] bootstrap worker started`);
console.log(`[${workerName}] topics=${topics.join(', ')}`);
console.log(`[${workerName}] concurrency=${concurrency}`);

setInterval(() => {
  console.log(`[${workerName}] heartbeat ${new Date().toISOString()}`);
}, 30000);
