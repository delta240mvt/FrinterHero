import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, '..', '..');

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({}),
  integrations: [tailwind({ configFile: './tailwind.config.mjs', applyBaseStyles: false })],
  vite: {
    define: {
      'process.env.SITE_SLUG': JSON.stringify('frinter'),
    },
    resolve: {
      alias: [
        { find: '@/db', replacement: path.resolve(repoRoot, 'src/db') },
        { find: '@/lib', replacement: path.resolve(repoRoot, 'src/lib') },
        { find: '@/utils', replacement: path.resolve(repoRoot, 'src/utils') },
        { find: '@', replacement: path.resolve(appDir, 'src') },
      ],
    },
    ssr: { noExternal: ['drizzle-orm'], external: ['node:*', 'pg', 'drizzle-orm/node-postgres'] },
  },
});
