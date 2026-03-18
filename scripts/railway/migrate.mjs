import { spawn } from 'node:child_process';

const child = spawn('npm', ['run', 'migrate'], {
  cwd: process.cwd(),
  shell: true,
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
