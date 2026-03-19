# Documentation Index

This repository uses a simple documentation layout:

- `docs/architecture/`
  - target architecture, migration plans, implementation order
- `docs/deployment/`
  - Railway service topology, env and rollout guidance
- `docs/audits/`
  - dated state-of-repo audits based on the code that actually exists
- `docs/handoffs/`
  - dated operator handoffs for the next session
- `docs/modules/`
  - domain-specific notes for `brand-clarity`, `reddit`, `youtube`, `social-hub`, `seo`
- `docs/prompts/`
  - operator and agent prompts
- `docs/archive/`
  - historical implementation packs and superseded plans

## Naming Rules

- Use lowercase kebab-case for folder and file names.
- Reserve `README.md` for directory indexes only.
- Prefer names that describe both scope and type.
- Historical docs may keep old internal wording, but they should live under `docs/archive/`.

## Current Source Of Truth

Start here for the current distributed architecture:

- [architecture/current-architecture-reference.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/architecture/current-architecture-reference.md)
- [architecture/monolith-to-api-clients-railway-plan.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/architecture/monolith-to-api-clients-railway-plan.md)
- [architecture/api-client-split-implementation-order.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/architecture/api-client-split-implementation-order.md)
- [deployment/railway-distributed-deployment.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/deployment/railway-distributed-deployment.md)
- [audits/monorepo-split-audit-2026-03-19.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/audits/monorepo-split-audit-2026-03-19.md)
- [handoffs/next-session-handoff-2026-03-19.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/handoffs/next-session-handoff-2026-03-19.md)

## Status By Category

- `architecture`, `deployment`, `audits`, `handoffs`
  - active and maintained
- `modules`
  - mixed: some docs are still valuable but may describe legacy route paths
- `archive`
  - historical context only, not operational source of truth
