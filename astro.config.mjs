import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';

// DEPLOYMENT NOTE (TASK-7.1.1):
// For local development: using @astrojs/node adapter (current)
// For Cloudflare Pages deployment: switch to @astrojs/cloudflare adapter
//   1. Install: npm install @astrojs/cloudflare
//   2. Replace adapter below with: import cloudflare from '@astrojs/cloudflare';
//   3. Change adapter: to: cloudflare()
//   4. Set build command in CF Pages dashboard: npm run build
//   5. Set output directory: dist
//   See: https://docs.astro.build/en/guides/integrations-guide/cloudflare/

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind({ configFile: './tailwind.config.mjs' })],
  vite: {
    ssr: { noExternal: ['drizzle-orm'] }
  }
});
