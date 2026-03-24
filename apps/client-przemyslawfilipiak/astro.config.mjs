import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '..', '..');

export default defineConfig({
  output: 'hybrid',
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4321,
  },
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind({ configFile: './tailwind.config.mjs' })],
  vite: {
    define: {
      'process.env.SITE_SLUG': JSON.stringify('przemyslawfilipiak'),
    },
    resolve: {
      alias: [
        { find: '@/db', replacement: path.resolve(repoRoot, 'src/db') },
        { find: '@/lib', replacement: path.resolve(repoRoot, 'src/lib') },
        { find: '@/utils', replacement: path.resolve(repoRoot, 'src/utils') },
        { find: '@', replacement: path.resolve(appDir, 'src') },
      ],
    },
    ssr: { noExternal: ['drizzle-orm'] },
  },
});
