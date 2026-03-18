# apps/api

Bootstrap workspace for the future central API service.

Current state:

- exposes a minimal HTTP runtime via `scripts/monorepo/api-server.mjs`
- intended to replace monolithic `src/pages/api/*`
- will become the only DB-connected public backend
