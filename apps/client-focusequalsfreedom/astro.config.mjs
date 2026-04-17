import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({}),
  integrations: [mdx(), tailwind({ configFile: './tailwind.config.mjs' })],
  vite: {
    define: {
      'import.meta.env.SITE_SLUG': JSON.stringify('focusequalsfreedom'),
      'import.meta.env.API_BASE_URL': JSON.stringify('https://frinter-api.delta240mvt.workers.dev'),
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(appDir, 'src') },
      ],
    },
    ssr: { noExternal: ['drizzle-orm'], external: ['node:*', 'pg', 'drizzle-orm/node-postgres'] },
  },
});
