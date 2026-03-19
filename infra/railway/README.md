# Railway Service Templates

Ten katalog zawiera gotowe template'y `railway.toml` dla docelowych serwisów.

Sposób użycia:

1. W Railway utwórz osobny service z tego samego repo.
2. W `Settings -> Source` wskaż ten sam branch.
3. W `Settings -> Service Config` wklej odpowiedni plik z tego katalogu albo przepisz z niego:
   - `buildCommand`
   - `startCommand`
   - `healthcheckPath` dla HTTP runtime
4. Ustaw env vars zgodnie z typem runtime:
   - `api` i klienci: `infra/railway/env/api.env.example`, `client-*.env.example`
   - `worker-general`: `infra/railway/env/worker-general.env.example`
   - `worker-bc`: `infra/railway/env/worker-bc.env.example`
   - `worker-sh-copy`: `infra/railway/env/worker-sh-copy.env.example`
   - `worker-sh-video`: `infra/railway/env/worker-sh-video.env.example`
   - `worker-reddit`: `infra/railway/env/worker-reddit.env.example`
   - `worker-youtube`: `infra/railway/env/worker-youtube.env.example`
5. Dla wygody skopiuj bazowy profil env z `infra/railway/env/*.env.example`.

Docelowy zestaw runtime:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-general`
- `worker-bc` - sole BC worker for `bc-scrape`, `bc-parse`, `bc-selector`, `bc-cluster`, `bc-generate`
- `worker-sh-copy`
- `worker-sh-video`

Opcjonalne później:

- `worker-reddit`
- `worker-youtube`

Ważne:

- `worker-general`, `worker-bc`, `worker-reddit`, `worker-youtube`, `worker-sh-copy` i `worker-sh-video` są dziś cienkimi runtime wrapperami nad wspólnym `workers/runner/src/index.ts`
- to jest poprawny stan deployowy, ale nie należy opisywać tych workspace'ów jako całkowicie niezależnych codebase'ów
- ownership topiców powinien pozostać rozłączny: `worker-general` nie powinien konsumować `bc-*`
