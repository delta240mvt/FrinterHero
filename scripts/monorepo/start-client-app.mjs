import { spawn } from 'node:child_process';
import process from 'node:process';

const nodeCmd = process.execPath;

const child = spawn(nodeCmd, ['./dist/server/entry.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: process.env.HOST ?? '0.0.0.0',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
