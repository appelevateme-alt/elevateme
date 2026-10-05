# ElevateMe — revamp monorepo pointer

> Review-branch note: the current Vercel deployment serves the root `src/`
> application. The temporary evaluator-access cutover in branch
> `feat/temporary-evaluator-review` therefore updates that deployed entrypoint
> and adds a separately deployable Java access service. The TypeScript revamp in
> `frontend/` remains isolated until the Vercel project is explicitly switched.

The current Vercel project still builds the root Vite entrypoint. The temporary
evaluator-access implementation therefore lives in the root `src/` app, while
the Java service in `backend/` owns the token, review, release, and notification
workflow. Start here for this branch:

- `frontend/` — React 18 + TS revamp (router, clean-arch slices, scoring/insights). Quickstart: [`frontend/README.md`](frontend/README.md)
- `backend/` — Spring Boot evaluator-access service. Quickstart: [`backend/README.md`](backend/README.md)
- `database/` — canonical Flyway SQL migrations (`database/migrations/`)
- `docs/` — spec sources: [`docs/REVMAP.md`](docs/REVMAP.md) (old → new routes), [`docs/SCORING.md`](docs/SCORING.md), [`docs/INSIGHTS.md`](docs/INSIGHTS.md), [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)
- `infra/` — deploy notes + Vercel/Render blueprints. Quickstart: [`infra/README.md`](infra/README.md)
- `tests/fixtures/scoring.json` — canonical golden fixtures for scoring + insights (single source of truth for Java + React tests)

## Quickstart

```bash
# frontend revamp
cd frontend && npm ci && npm run dev   # see frontend/README.md

# backend
cd backend && ./mvnw spring-boot:run   # see backend/README.md (Windows: mvnw.cmd)

# full deploy notes
# see infra/README.md + docs/
```

## Deployment note

This review branch deliberately targets the deployed root app so it can be
previewed without switching the Vercel project to `frontend/`. The TypeScript
revamp remains isolated until that hosting cutover is explicitly approved.
The evaluator-access Java service is deployed separately and reached through
the Vercel `/api/evaluation-access/*` gateway. See
[`docs/ElevateMe_Evaluator_Access_Deployment.md`](docs/ElevateMe_Evaluator_Access_Deployment.md).
