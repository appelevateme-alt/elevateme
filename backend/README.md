# ElevateMe Backend (Spring Boot modular monolith skeleton)

Revamp backend skeleton. No secrets in repo. All controllers stub-return `501` with `requestId`
until domain logic is implemented. No business bypass: repositories scope by authenticated
subject, JWT verified (signature/issuer/audience/expiry).

## Prerequisites

- Java 21 (e.g. Temurin 21 / Oracle 21). Verify: `java -version`
- Maven 3.9+ **or** the Maven wrapper (see below). Verify: `mvn -version`
- Postgres 15+ (local or Supabase Postgres). No secrets committed.
- If Maven wrapper binaries are absent, install Maven **or** see
  `.mvn/wrapper/maven-wrapper.properties` install step below.

## Maven wrapper note

This skeleton ships `.mvn/wrapper/maven-wrapper.properties` (pinned distribution).
If `mvnw` / `mvnw.cmd` binaries cannot be generated in your environment, either:

1. Install Maven 3.9+ and substitute `mvn` for `./mvnw` in every command below, or
2. Generate the wrapper jars via `mvn -N wrapper:wrapper -Dmaven=3.9.9` (requires network),
   which restores `./mvnw` / `mvnw.cmd`.

CI should use the pinned wrapper distribution from `.mvn/wrapper/maven-wrapper.properties`.

## How to run

```bash
cd backend
./mvnw spring-boot:run
# Windows:
mvnw.cmd spring-boot:run
```

- Listens on `${PORT:-8080}` (see `src/main/resources/application.yml`).
- Readiness: `GET /api/health` → `{"status":"UP"}` when DB + app are reachable.
  (Actuator also exposes `/actuator/health` internally; the contract readiness probe is `/api/health`.)

## How to test

```bash
cd backend
./mvnw test
```

- Pure unit tests (`ScoringServiceTest`, `InsightsServiceTest`) run without a DB.
- `ReleaseAtomicityTest` / `GuestScopeTest` are Testcontainers outlines (need Docker);
  they are stubbed with TODOs and skipped/placeholder until migrations land.

## Migrate (Flyway)

Canonical SQL migrations live in `../../database/migrations`
(repo-relative from `backend/` → `elevateme/database/migrations`).
`backend/src/main/resources/db/migration/` contains mirrored copies of all
canonical versions (V1–V10 incl. V5 → V5.1 → V6…) + README, so the backend
compiles/boots without duplicating SQL authorship.

Flow:

```bash
# 1. Author migration in database/migrations, e.g. V11__next.sql
# 2. Sync into backend Flyway path for local runs (until automation lands):
cp ../database/migrations/V*.sql src/main/resources/db/migration/
# 3. Run (Flyway auto-migrates on boot; or: ./mvnw flyway:migrate)
./mvnw spring-boot:run
```

Flyway settings (see `application.yml`): `baseline-on-migrate: true`,
`validate-on-migrate: true`, locations `classpath:db/migration`.

## Runtime least-privilege role vs migration owner

- **Migration owner** (DDL): owns schema, runs Flyway. Example `ELEVATE_MIGRATION_USER`.
  Grant: `CONNECT, CREATE, TEMPORARY` on DB + ownership of app tables.
- **Runtime app role** (least privilege): used by `JDBC_USER` at runtime.
  Grant only: `CONNECT` + `SELECT/INSERT/UPDATE/DELETE` on app tables + `USAGE` on sequences.
  **No** `CREATE/DROP/ALTER`, no superuser, no `pg_*` admin roles.

```sql
-- example (run as migration owner / superuser once):
-- REVOKE CREATE ON SCHEMA public FROM app_runtime;
-- GRANT CONNECT ON DATABASE elevateme TO app_runtime;
-- GRANT USAGE ON SCHEMA public TO app_runtime;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
```

## Env vars

No defaults with secrets. All secrets via environment (never commit `.env`).

| Var | Purpose | Example |
|---|---|---|
| `PORT` | HTTP listen port | `8080` |
| `JDBC_URL` | Postgres JDBC URL | `jdbc:postgresql://localhost:5432/elevateme` |
| `JDBC_USER` | Runtime least-privilege role | `app_runtime` |
| `JDBC_PASS` | Runtime role password | (secret) |
| `SUPABASE_ISSUER` | Expected JWT `iss` | `https://<ref>.supabase.co/auth/v1` |
| `SUPABASE_JWKS_URL` | JWKS endpoint for signature verify | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_AUDIENCE` | Expected JWT `aud` | `authenticated` |
| `STORAGE_ENDPOINT` | S3-compatible storage endpoint (photos) | `https://<ref>.supabase.co/storage/v1` |
| `STORAGE_BUCKET_PRIVATE` | Private bucket for profile photos | `profile-photos-private` |
| `STORAGE_ACCESS_KEY` | Storage access key | (secret) |
| `STORAGE_SECRET_KEY` | Storage secret | (secret) |
| `GUEST_COOKIE_SECRET` | HMAC secret for guest fragment→cookie exchange (32+ bytes) | (secret, demand 32+ chars) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:5173` |
| `MAIL_HOST` / `MAIL_PORT` | SMTP host/port | `smtp.example.com` / `587` |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | SMTP creds | (secret) |
| `MAIL_FROM` | From address | `no-reply@example.com` |
| `APP_PUBLIC_URL` | Public base URL (links in mail) | `http://localhost:5173` |

Copy-paste local template:

```bash
export PORT=8080
export JDBC_URL=jdbc:postgresql://localhost:5432/elevateme
export JDBC_USER=app_runtime
export JDBC_PASS=changeme
export SUPABASE_ISSUER=https://example.supabase.co/auth/v1
export SUPABASE_JWKS_URL=https://example.supabase.co/auth/v1/.well-known/jwks.json
export SUPABASE_AUDIENCE=authenticated
export STORAGE_ENDPOINT=https://example.supabase.co/storage/v1
export STORAGE_BUCKET_PRIVATE=profile-photos-private
export STORAGE_ACCESS_KEY=dummy
export STORAGE_SECRET_KEY=dummy
export GUEST_COOKIE_SECRET=0123456789abcdef0123456789abcdef
export ALLOWED_ORIGINS=http://localhost:5173
export MAIL_HOST=localhost MAIL_PORT=1025 MAIL_USERNAME=dummy MAIL_PASSWORD=dummy MAIL_FROM=no-reply@example.com
export APP_PUBLIC_URL=http://localhost:5173
```

## API surface (all stub 501 until implemented)

Prefix `/api/v1` (spec §11). Health: `/api/health`. Every error body is
`ApiError{code,message,fieldErrors,requestId}`. `X-Request-Id` echoed per request.
Idempotency: mutating POSTs accept `Idempotency-Key` scoped to actor+operation.

See controller sources under `src/main/java/com/elevateme/**` for exact paths + TODO rules.
