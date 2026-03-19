import { spawn } from 'node:child_process';

const targetServiceId = process.env.TARGET_SERVICE_ID?.trim();
const targetEnvironment = process.env.TARGET_ENVIRONMENT?.trim();
const targetProjectId = process.env.TARGET_PROJECT_ID?.trim();
const railwayToken = process.env.RAILWAY_TOKEN?.trim();

if (!targetServiceId) {
  console.error('Missing TARGET_SERVICE_ID');
  process.exit(1);
}

if (!targetEnvironment) {
  console.error('Missing TARGET_ENVIRONMENT');
  process.exit(1);
}

if (!targetProjectId) {
  console.error('Missing TARGET_PROJECT_ID');
  process.exit(1);
}

if (!railwayToken) {
  console.error('Missing RAILWAY_TOKEN');
  process.exit(1);
}

const startedAt = new Date().toISOString();
console.log(`[nightly-rebuild] starting at ${startedAt}`);
console.log(
  `[nightly-rebuild] redeploying serviceId="${targetServiceId}" environment="${targetEnvironment}" project="${targetProjectId}"`
);

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '-y',
  '@railway/cli',
  'redeploy',
  '--service',
  targetServiceId,
  '--yes',
];

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[nightly-rebuild] railway CLI terminated by signal ${signal}`);
    process.exit(1);
  }

  if (code !== 0) {
    console.error(`[nightly-rebuild] redeploy failed with exit code ${code ?? 1}`);
    process.exit(code ?? 1);
  }

  console.log(`[nightly-rebuild] redeploy completed successfully at ${new Date().toISOString()}`);
  process.exit(0);
});
