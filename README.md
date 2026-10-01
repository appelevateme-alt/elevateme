# ElevateMe — revamp monorepo pointer

ElevateMe revamp lives in dedicated packages — this root is legacy entry only
(see Legacy note below). Start here:

- `frontend/` — React 18 + TS revamp (router, clean-arch slices, scoring/insights). Quickstart: [`frontend/README.md`](frontend/README.md)
- `backend/` — Spring Boot modular monolith (`/api/v1`). Quickstart: [`backend/README.md`](backend/README.md)
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

## Legacy note (root entry)

Root `package.json` / `vite.config.js` / `index.html` serve the legacy `src/` (Vite `src/main.jsx`)
template only — kept building for reference. The revamp lives in `frontend/` per
`docs/REVMAP.md` migration plan. Do not add new features at root; work in `frontend/`.
