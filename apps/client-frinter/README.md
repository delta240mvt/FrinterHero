# apps/client-frinter

BFF shell workspace for client3.

Current state:

- starts through `scripts/monorepo/client-bff.mjs`
- `SITE_SLUG=frinter` is injected during launch
- proxies to the central API and can still use transitional fallback routes where needed
