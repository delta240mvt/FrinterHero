const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/railway/smoke-http.mjs <url>');
  process.exit(1);
}

const url = target.endsWith('/health') ? target : `${target.replace(/\/$/, '')}/health`;

try {
  const response = await fetch(url);
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
} catch (error) {
  console.error(String(error));
  process.exit(1);
}
