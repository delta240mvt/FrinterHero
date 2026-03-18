import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] ?? 'workspace';
const cwd = process.cwd();
const distDir = path.join(cwd, 'dist');

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  path.join(distDir, 'BUILD_INFO.txt'),
  `Bootstrap build placeholder for ${target}\nGenerated at ${new Date().toISOString()}\n`,
  'utf8',
);

console.log(`[build] ${target}: bootstrap build completed`);
