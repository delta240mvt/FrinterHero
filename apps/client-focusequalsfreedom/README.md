# apps/client-focusequalsfreedom

BFF shell workspace for client2.

Current state:

- starts through `scripts/monorepo/client-bff.mjs`
- `SITE_SLUG=focusequalsfreedom` is injected during launch
- proxies to the central API and can still use transitional fallback routes where needed
