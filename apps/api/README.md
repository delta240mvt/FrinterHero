# apps/api

Central API workspace.

Current state:

- real runtime entrypoint is `apps/api/src/server.ts`
- this workspace is the central HTTP backend for the distributed split
- it is the intended DB-connected public backend for auth, CRUD, orchestration and job APIs
