# DEPLOY SKELETON (Phase 1d — verified without provisioning)

No secrets in repo. No purchases authorized. Nothing below provisions or contacts
Render/Vercel APIs. Staging URLs are placeholders until the owner approves hosting.

## 1. Local startup

### Frontend — `npm run dev` on :5173, `/api` proxied to :8080 Java

```bash
cd frontend
npm ci
npm run dev   # http://localhost:5173
```

`frontend/vite.config.ts` proxies same-origin `/api` → `http://localhost:8080`
(`changeOrigin: true`), which preserves guest HttpOnly cookies. SPA fallback
applies AFTER `/api` — proxied API requests are forwarded, never fallen back to
`index.html`.

### Backend — `./mvnw spring-boot:run`, env from `.env.example`

```bash
cp .env.example .env   # then fill per environment; never commit .env
cd backend
./mvnw spring-boot:run # Windows: mvnw.cmd spring-boot:run
```

- Listens on `${PORT:-8080}` (see `backend/src/main/resources/application.yml`).
- Readiness: `GET /api/health` → `{"status":"UP"}`.
- Env names only — see `.env.example` (JDBC_URL/JDBC_USER/JDBC_PASS,
  SUPABASE_ISSUER/SUPABASE_JWKS_URL/SUPABASE_AUDIENCE, STORAGE_*,
  GUEST_COOKIE_SECRET, ALLOWED_ORIGINS, APP_PUBLIC_URL, MAIL_*).
- If `mvnw`/`mvnw.cmd` binaries are absent, either install Maven 3.9+ and use
  `mvn` in place of `./mvnw`, or run `mvn -N wrapper:wrapper -Dmaven=3.9.9`
  once with network access (pinned distribution in
  `backend/.mvn/wrapper/maven-wrapper.properties`).

### Supabase — local vs cloud project choice

- **Local (default for dev):** `supabase start` (Supabase CLI + Docker). Use the
  local anon key + local Postgres URL in `.env`. Free, no cloud project needed.
- **Cloud (opt-in, owner approval):** create ONE project (e.g. region closest to
  users), then set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (frontend) and
  `SUPABASE_ISSUER` / `SUPABASE_JWKS_URL` / `JDBC_URL` (backend) from the cloud
  dashboard. Never commit the service-role key.

### Storage bucket creation step

Create the private profile-photo bucket once per Supabase project (local or cloud):

```bash
# via Supabase dashboard: Storage → New bucket → name: profile-photos-private, Private: ON
# or via SQL:
insert into storage.buckets (id, name, public) values ('profile-photos-private', 'profile-photos-private', false);
```

Backend serves photos via signed URLs only (`STORAGE_ENDPOINT`,
`STORAGE_BUCKET_PRIVATE`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` in env).
No public bucket. RLS: deny anonymous reads on the bucket.

### Verified sender domain placeholder

Email (report-ready notifications) needs a verified sender domain before staging
sends real mail:

- `MAIL_FROM=no-reply@<STAGING-DOMAIN-PLACEHOLDER>` (e.g. `no-reply@staging.example.com`)
- Set `MAIL_HOST` / `MAIL_PORT` / `MAIL_USERNAME` / `MAIL_PASSWORD` in the host
  env (Render dashboard / staging secrets), never in git.
- Until the domain is verified, keep mail on the local catcher (e.g.
  `MAIL_HOST=localhost MAIL_PORT=1025` via MailHog/Mailpit).

## 2. Staging URL placeholders (no provisioning done)

| Tier    | Frontend (Vercel)              | Backend (Render Docker)        |
|---------|--------------------------------|--------------------------------|
| Staging | `https://<app>-staging.vercel.app` | `https://<app>-staging.onrender.com` |
| Prod    | `https://<app>.vercel.app`          | `https://<app>.onrender.com`          |

- Frontend deploy: Vercel project rooted at `frontend/`, build `npm run build`,
  output `dist` (see `infra/vercel.json`). `/api/:path*` rewrites to
  `${JAVA_API_URL}/api/:path*`; `/api` responses carry
  `Cache-Control: no-store, private` + `Vary: Authorization, Cookie`.
- Backend deploy: Render blueprint `infra/render.yaml` (type `web`,
  runtime `docker`, `dockerfilePath: ./infra/Dockerfile.backend`,
  health check `/api/health`). All env vars `sync: false` — set them in the
  Render dashboard per environment.

## 3. Preview-never-writes-prod rule

- Every Vercel preview deployment MUST point at a preview/ephemeral backend +
  preview Supabase project (or local stubs). Previews MUST NEVER use prod
  `JAVA_API_URL`, prod `JDBC_URL`, or prod Supabase keys.
- Enforcement: `JAVA_API_URL` is per-environment config in Vercel
  (Production vs Preview vs Development). CI does not inject prod secrets —
  `.github/workflows/ci.yml` needs no secrets at all.
- Backend guard: staging/preview instances use distinct `JDBC_USER` and
  `SUPABASE_*` values; prod values exist only in the prod host env.

## 4. Backup / restore pointer (commands only, no real connection strings)

Supabase Postgres (or local Postgres) — run on demand before risky migrations:

```bash
# Backup (custom format). Connection string comes from the host env, never git.
pg_dump "$DATABASE_URL" -Fc -f elevateme-backup-$(date +%F).dump

# Restore into an EMPTY database (verify target first — never restore over prod
# from a preview shell).
pg_restore --clean --if-exists -d "$RESTORE_TARGET_URL" elevateme-backup-<date>.dump
```

- Keep at least one known-good backup before each Flyway migration that alters
  evaluation/summary tables.
- Canonical migrations live in `database/migrations/`; backend Flyway path
  `backend/src/main/resources/db/migration/` holds a placeholder + README
  pointer (see `backend/README.md`).

## 5. Phase 1d verification record (no secrets, no purchases)

- Frontend `npm run build` (tsc + vite) passes; `frontend/dist/index.html` exists;
  `infra/vercel.json` `/api/:path*` headers verified `no-store, private`.
- Frontend `npm run test` (vitest) passes.
- Backend: requires JDK 21 + Maven 3.9.9 (pinned wrapper
  `backend/.mvn/wrapper/maven-wrapper.properties`); this machine has JDK 17 and
  no `mvn`, so `mvn -B -o -DskipTests package` was NOT run locally — CI
  (Temurin 21) runs `mvn -B -DskipTests package` then the pure-unit
  `ScoringServiceTest,JwtVerifierTest,InsightsServiceTest` (no DB).
- Docker: `docker build` of the Java image was NOT run (heavyweight, pulls
  `maven:3.9.9-eclipse-temurin-21`); only a `--check` syntax lint of
  `infra/Dockerfile.backend` was performed. No image pushed, no Render/Vercel
  API contacted, no credentials invented.
