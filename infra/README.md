# Infra — deploy notes (no credentials in repo)

## Frontend (Vercel static)
- Root: `frontend/`. Build: `npm ci && npm run build`. Output: `dist/`.
- `infra/vercel.json`: same-origin `/api/*` → Java (`${JAVA_API_URL}` — set per env).
  Preserves `Authorization` + guest cookie, `Cache-Control: no-store, private` for `/api/*`.
  SPA fallback applies ONLY after `/api/` + static assets.
- Env (Vercel project): `VITE_API_BASE=/api`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  Never `SERVICE_ROLE`, never DB password in `VITE_*`.

## Backend (Render Docker — proposed, no purchase authorized)
- `infra/Dockerfile.backend`: Maven build (Java 21) → JRE run, listens on `$PORT`.
  Readiness: `GET /api/health` (503 when DB down). Bounded Hikari pool (see `application.yml`).
- `infra/render.yaml`: blueprint only. Set secrets in Render dashboard, never in repo.
- Verify Supabase direct vs pooler connection + region networking before production.

## Supabase
- Separate dev/staging/prod projects (or clearly isolated envs). Previews never write prod.
- Migrations: canonical in `database/migrations/` (Flyway V1–V4). Sync into
  `backend/src/main/resources/db/migration/` for local runs. Migration owner ≠ runtime role
  (`elevateme_owner` DDL vs least-privilege `app_runtime` — see `database/README.md`).
- Storage: private bucket `profile-photos-private`. Java authorizes → short-lived signed URLs only.
- Auth: email confirmation ON. JWT verified in Java via JWKS (issuer/audience/expiry/signature).

## Email
- Authenticated SMTP via configured provider. Verified sender domain + test inbox are
  deployment inputs. Queue-insert ≠ "email sent" — expose queued/sent/failed (see outbox).

## Pre-production checklist
1. Real domain + allowed origins + consent copy (owner/legal sign-off, no invented claims).
2. `run migrations safely → verify backups/restore → pilot (1 MUN + 1 multi-session speaking)`.
3. Invitation-revocation + backup/restore runbooks in `docs/` before pilot.
