# Railway Service Templates

Ten katalog zawiera gotowe template'y `railway.toml` dla docelowych serwisów.

Sposób użycia:

1. W Railway utwórz osobny service z tego samego repo.
2. W `Settings -> Source` wskaż ten sam branch.
3. W `Settings -> Service Config` wklej odpowiedni plik z tego katalogu albo przepisz z niego:
   - `buildCommand`
   - `startCommand`
   - `healthcheckPath` dla HTTP runtime
4. Ustaw env vars zgodnie z [docs/railway-distributed-deployment.md](/C:/Users/delta/Desktop/FRINTER.APP%20+%20PERSONAL%20BRAND/FRINTER%20-%20CURSOR%20-%2026.11.25/FrinterHero/docs/railway-distributed-deployment.md).
5. Dla wygody skopiuj bazowy profil env z `infra/railway/env/*.env.example`.

Docelowy zestaw runtime:

- `api`
- `client-przemyslawfilipiak`
- `client-focusequalsfreedom`
- `client-frinter`
- `worker-general`
- `worker-bc`
- `worker-sh-copy`
- `worker-sh-video`

Opcjonalne później:

- `worker-reddit`
- `worker-youtube`
