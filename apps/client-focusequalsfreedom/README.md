# @frinter/client-focusequalsfreedom

Standalone Astro site for the FocusEqualsFreedom marketing/blog surface, built for Cloudflare Pages.

## Local development

Run these commands from `apps/client-focusequalsfreedom`:

- `npm run dev` - start the Astro dev server on the local network
- `npm run build` - build the production bundle into `dist/`
- `npm run preview` - serve the built `dist/` bundle with Cloudflare Pages via Wrangler
- `npm run deploy` - deploy the built `dist/` bundle to Cloudflare Pages

## Content authoring

Local blog posts are authored as MDX files in `src/content/blog/`.

## Notes

- The app uses the Cloudflare adapter configured in `astro.config.mjs`.
- Cloudflare Pages settings live in `wrangler.jsonc`.
