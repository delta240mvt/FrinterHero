import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(process.cwd());
const SRC_ROOT = path.join(APP_ROOT, 'src');
const IMPORT_RE =
  /(?:import|export)\s.+?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) {
    return path.resolve(SRC_ROOT, specifier.slice(2));
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  return null;
}

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (/\.(astro|ts|tsx|js|mjs|mdx)$/.test(entry)) files.push(fullPath);
  }
  return files;
}

test('client-focusequalsfreedom has no imports to shared backend or monorepo-only runtime modules', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(IMPORT_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const resolved = resolveSpecifier(file, specifier);
      if (!resolved) continue;
      if (!resolved.startsWith(APP_ROOT)) {
        offenders.push(`${path.relative(APP_ROOT, file)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
