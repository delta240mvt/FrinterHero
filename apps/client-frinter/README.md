# apps/client-frinter

Primary Astro client for tenant `frinter`.

Current state:

- this is the active `client3` app runtime
- public assets, pages, components, styles, middleware, and Astro config live in this app
- app-local helper/config surface now lives under `src/config` plus app-owned modules under `src/lib`
- local helper modules now cover `site-config`, `internal-api`, `privacy-policy`, `sprites`, `bc-settings`, `admin/dashboard-data`, and `utils/markdown`
- Astro/Vite and TypeScript now resolve app code through the app-local `@/*` alias only

Standalone boundary:

- no app code in `apps/client-frinter/src` should rely on repo-root `src/lib`, `src/utils`, or `src/db`
- runtime API access is handled through `src/lib/internal-api.ts`, which proxies to the external frinter API base URL
