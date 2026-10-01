# E2E (Playwright skeleton — no live run by default)

All specs under `frontend/e2e/` are **skeleton only**. They self-skip unless
explicitly opted in, so unit CI stays green.

- Skip gate: `test.skip(process.env.E2E_LIVE !== '1')`
- Run live only with: `E2E_LIVE=1`
- Selectors: `data-testid="page-sign-in"`, `data-testid="page-home"` (already in code)

## 0. Install (documented only — do NOT commit lockfile churn)

Playwright is **not** a committed dependency. Install locally when needed:

```bash
cd elevateme/frontend
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

`playwright.config.ts` (already in `frontend/`): `testDir ./e2e`,
`baseURL http://localhost:5173`, `fullyParallel: true`, `reporter: list`.

## 1. Postgres

```bash
# local Postgres 15+ (or Supabase Postgres for hosted)
# example local:
# createdb elevateme
# JDBC_URL=jdbc:postgresql://localhost:5432/elevateme
```

Migrations live in `elevateme/database/migrations` (Flyway auto-migrates on backend boot).

## 2. Backend (Java 21)

```bash
java -version   # must be 21
cd elevateme/backend
./mvnw spring-boot:run      # Windows: mvnw.cmd spring-boot:run
# listens on ${PORT:-8080}, readiness: GET /api/health -> {"status":"UP"}
```

Env (see `elevateme/.env.example`): `JDBC_URL`, `JDBC_USER`, `JDBC_PASS`,
`SUPABASE_*`, `ALLOWED_ORIGINS=http://localhost:5173`.

## 3. Frontend

```bash
cd elevateme/frontend
npm ci
npm run dev -- --port 5173 --strictPort
# /api proxied to http://localhost:8080 (vite.config.ts)
```

## 4. Playwright

```bash
cd elevateme/frontend
# skeleton check (no browser):
npx tsc --noEmit -p tsconfig.json  # e2e/ excluded, build stays green
npm run build                       # must pass

# live run (explicit opt-in only):
E2E_LIVE=1 npx playwright test e2e/smoke.spec.ts
```

## Rules

- **Synthetic accounts only**: e.g. `test+e2e-<stamp>@example.com`. Never real emails.
- **No prod**: local stack only (`localhost:5173` + `localhost:8080` + local PG).
- **No emails sent**: do not configure real `MAIL_*`; use stub / empty.
- Unit CI runs `npm run build` + `vitest run` only — never Playwright browsers.

## External deps

- Postgres 15+ (local DB)
- Java 21 + Maven 3.9+ (or `./mvnw` wrapper)
- Node 20+ / npm (frontend Vite dev)
- Playwright browsers (only after manual `npx playwright install`, live runs only)
- Supabase project (JWT/anon key for backend verification — local stub values OK for skeleton)
