# workers/runner

Generic worker runtime for phase 1.

Use with:

- `WORKER_TOPICS`
- `WORKER_NAME`
- `WORKER_CONCURRENCY`

This keeps the first Railway rollout simple before splitting into dedicated worker entrypoints.
