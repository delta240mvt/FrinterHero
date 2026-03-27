# Cloudflare runtime scaffold

Task 1 adds the shared Worker entrypoint for `apps/api` without replacing the existing Node server path.

Current runtime scaffold:

- `apps/api/wrangler.jsonc` defines the shared backend Worker entrypoint and placeholder bindings.
- `apps/api/src/cloudflare/env.ts` validates the minimum bindings required by the Worker runtime.
- `apps/api/src/cloudflare/index.ts` and `apps/api/src/cloudflare/router.ts` provide the initial `GET /health` route and JSON `404` responses.

Local verification commands:

- `npm run test:api:cf`
- `npm run check:api:cf`

Notes:

- `npm run check:api:cf` runs a local `wrangler types` config parse and does not require Cloudflare authentication.
- Real deploys, including `npm run deploy:api:cf -- --dry-run`, require Cloudflare authentication such as `CLOUDFLARE_API_TOKEN`.
