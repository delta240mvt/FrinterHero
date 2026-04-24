import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const siteSlug = process.env.SITE_SLUG ?? 'przemyslawfilipiak';
const apiBaseUrl = process.env.API_BASE_URL ?? 'https://frinter-api.delta240mvt.workers.dev';

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({}),
  integrations: [tailwind({ configFile: './tailwind.config.mjs' })],
  vite: {
    define: {
      'import.meta.env.SITE_SLUG': JSON.stringify(siteSlug),
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBaseUrl),
    },
    resolve: {
      alias: [{ find: '@', replacement: path.resolve(appDir, 'src') }],
    },
    ssr: { noExternal: ['drizzle-orm'], external: ['node:*', 'pg', 'drizzle-orm/node-postgres'] },
  },
});
