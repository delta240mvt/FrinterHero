# workers

Worker workspaces for the distributed Railway deployment.

Current runtime split:

- `worker-general` via `workers/runner`
- `worker-bc` for `bc-scrape`, `bc-parse`, `bc-selector`, `bc-cluster`, `bc-generate`
- `worker-sh-copy`
- `worker-sh-video`

`worker-general` handles:

- `geo`
- `draft`
- `reddit`
- `youtube`
- `sh-publish`

`worker-bc` handles:

- `bc-scrape`
- `bc-parse`
- `bc-selector`
- `bc-cluster`
- `bc-generate`

Later optional splits:

- `worker-reddit`
- `worker-youtube`

Legacy / local helper:

- `worker-geo-drafts`

Important:

- dedicated worker workspaces are deployable service targets
- they currently reuse the shared implementation in `workers/runner/src/index.ts`
