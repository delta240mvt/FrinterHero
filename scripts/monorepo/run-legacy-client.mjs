import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const mode = process.argv[2] ?? 'start';
const siteSlug = process.argv[3] ?? 'unknown-site';

const commandMap = {
  dev: 'dev:legacy',
  build: 'build:legacy',
  start: 'start:legacy',
  preview: 'preview:legacy',
};

const rootScript = commandMap[mode];

if (!rootScript) {
  console.error(`[client:${siteSlug}] unsupported mode: ${mode}`);
  process.exit(1);
}

const rootDir = path.resolve(process.cwd(), '..', '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log(`[client:${siteSlug}] delegating to root script: ${rootScript}`);

const child = spawn(npmCmd, ['run', rootScript], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    SITE_SLUG: siteSlug,
    CLIENT_SLUG: siteSlug,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
