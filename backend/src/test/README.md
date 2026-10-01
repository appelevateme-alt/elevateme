# Backend tests — unit vs Postgres-backed (Phase 5 verification foundations)

All tests under `backend/src/test/java/com/elevateme/**` are currently
**pure unit tests (JUnit5 + Mockito, no DB, no Testcontainers, no Spring
context)**. They run with `./mvnw test` on Java 21 and need no Docker,
no Postgres, no network.

> Java prerequisite: `pom.xml` pins `java.version=21`
> (`maven.compiler.source/target=21`, Spring Boot 3.3.5).
> Verify with `java -version` (expect `openjdk 21`).
> The Maven wrapper scripts (`backend/mvnw`, `backend/mvnw.cmd`) enforce
> this and download Maven 3.9.9 on first use. No wrapper jar is committed.

## 1. Current test inventory (all pure Mockito — no live PG)

| Test class | What it covers (prompt list in bold) | Needs live PG? |
|---|---|---|
| `performance.ReleaseAtomicityTest` | **release**: preview counts, **incomplete blocks 409 INCOMPLETE**, repeat-safe same `Idempotency-Key`, **concurrency** duplicate same key → single release, **dedupe** payload-conflict 409, mid-tx fault → zero partial, **outbox** `emitStrict` per recipient same-tx, absent-excluded never zero | No — mocked `ReleaseRepository`/`OutboxService`. Real **concurrency / atomicity / outbox same-tx** needs PG (see §3). |
| `security.PermissionRegressionTest` (18 acceptance) | **release** repeat-safe + atomic, **ownership** A-own-200 / B-cross-404, **guest-revocation** revoked replay 401 + guest scoped 404 + guest never-release 403, **dedupe** assign/recipient, **outbox** backoff bounds, paid claim/verify, alerts, pending 403, targeting invisibility | No — mocked repos + real `ScopeGuard`/`IdempotencyService`/`OutboxWorker.backoffSeconds` pure logic. SQL scoping (`FOR UPDATE`, `UNIQUE(actor,key)`, RLS) needs PG. |
| `participation.GuestScopeTest` | **guest-revocation**: hash-only store, exchange→cookie, cross-session 404, revoke immediate 401, guest never release 403 | No. Cookie `HttpOnly/Secure/SameSite` + hash-lookup race needs PG integration. |
| `opportunities.PaymentFlowTest` | **ownership** non-assignee fetch 404, **dedupe** `dedupeIds` + overlapping assign batches, paid claim stays `PENDING`, `VERIFIED` confirms + admin/time, `REJECTED` needs reason, double-verify 409, 48h hold/expiry | No. Capacity/hold race + `UNIQUE` dedupe needs PG concurrency test. |
| `recommendations.RecommendationTargetingTest` | targeting preview union (missing ≠ zero), **dedupe** overlapping create batches, pin budget 3, teacher 403, cross-student patch 404 (**ownership**) | No. Criterion join on latest *released* + recipient `UNIQUE` needs PG. |
| `queries.QueryExchangeTest` | title-120/body-5000 validation, **dedupe** same-key-different-payload 409, first-reply state flip, close/reopen | No. State-machine races need PG. |
| `evaluation.EvaluationSubmitTest` | draft partial ok, submit requires 10× int 0–100, optimistic version mismatch 409 | No. Version-guard (`WHERE version=`) race needs PG. |
| `evaluation.GuestEvaluateTest` | guest assigned-only read/write, draft PATCH, submit locks | No. Session-scope join needs PG. |
| `programs.ProgramsLifecycleTest` (+ `PublicDiscoveryTest`) | create→publish→archive, registration persist, capacity/duplicate 409 | No (has TODO comment: Testcontainers concurrency outline at `ProgramsLifecycleTest:194`). True capacity race needs PG. |
| `isolation.IsolationTest`, `identity.MeIsolationTest`, `identity.AdminBootstrapClosedTest`, `identity.PhotoAuthTest`, `common.security.JwtVerifierTest` | **ownership** A/B 404, pending 403, no-admin-backdoor, photo 403/422, JWT claims | No. |
| `evaluation.ScoringServiceTest`, `performance.PerformanceMathTest`, `performance.InsightsServiceTest`, `performance.InsightsRulesTest` | totals/normalized, released-only charts, `<30` alert / `≥30` resolve | No — pure math. |

**Testcontainers usage today: zero.** `pom.xml` declares
`testcontainers-bom 1.20.1` + `junit-jupiter` + `postgresql` (test scope),
but no test imports `org.testcontainers.*`. The two places that mention
it (`backend/README.md` "Testcontainers outlines", `ProgramsLifecycleTest:194`
concurrency outline) are stubs/TODOs.

## 2. What still requires a live Postgres to prove (not covered by mocks)

Mocks assert *service logic* (which repo method is called, which exception
maps to which HTTP code). They cannot prove:

1. Flyway `V1..V10` actually apply in order (`database/migrations/` ↔
   `src/main/resources/db/migration/`).
2. `SELECT ... FOR UPDATE` (`lockEligibleEvaluations`, `lockSessionRoster`,
   `lockProgramRow`) serialises concurrent releases/registrations.
3. `UNIQUE(actor, idempotency_key)` / recipient/assignment dedupe holds under
   true concurrent duplicate POSTs.
4. Outbox rows + release rows commit/roll back in the **same transaction**
   (mock `emitStrict` never touches JDBC).
5. RLS deny-by-default (`V5_1__rls_lockdown.sql`) + JDBC subject scoping agree
   (ownership 404 vs 403 vs 401 shapes).
6. Revocation is immediate in the DB (no grace window) under replay.

These need the PG-backed suite below.

## 3. Running the PG-backed suite (Docker + Flyway V1..V10)

Canonical migrations: `elevateme/database/migrations/V1..V10`
(synced into `backend/src/main/resources/db/migration/` for local runs).
Do **not** invent schema — Flyway validates on boot
(`baseline-on-migrate: true`, `validate-on-migrate: true`, `ddl-auto: validate`).

```powershell
# 1. Start postgres:14 (matches requested PG-backed matrix)
docker run -d --name elevateme-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=elevateme -p 5432:5432 postgres:14

# 2. Env (no secrets committed; local-only values)
$env:JDBC_URL="jdbc:postgresql://localhost:5432/elevateme"
$env:JDBC_USER="postgres"
$env:JDBC_PASS="postgres"
$env:SUPABASE_ISSUER="https://example.supabase.co/auth/v1"
$env:SUPABASE_JWKS_URL="https://example.supabase.co/auth/v1/.well-known/jwks.json"
$env:SUPABASE_AUDIENCE="authenticated"
$env:GUEST_COOKIE_SECRET="0123456789abcdef0123456789abcdef"
$env:ALLOWED_ORIGINS="http://localhost:5173"

# 3a. Unit suite only (no DB, default — works everywhere, Java 21 required)
cd backend
./mvnw test                 # Linux/macOS
mvnw.cmd test               # Windows

# 3b. Single test class
./mvnw -Dtest=ReleaseAtomicityTest test
./mvnw "-Dtest=PermissionRegressionTest,GuestScopeTest,PaymentFlowTest" test

# 3c. Future live-PG integration tests (convention: @Tag("pg"))
#     Run ONLY unit tests (exclude PG):
./mvnw -Dgroups='!pg' test
#     Run ONLY PG-backed tests (needs Docker PG above + Flyway V1..V10 applied):
./mvnw -Dgroups='pg' "-Dspring.datasource.url=${JDBC_URL}" test
#     Legacy surefire property form (equivalent):
#     ./mvnw -Dtest='*PgIT' "-Dspring.datasource.url=jdbc:postgresql://localhost:5432/elevateme" test
```

Bash equivalent:

```bash
export JDBC_URL=jdbc:postgresql://localhost:5432/elevateme
export JDBC_USER=postgres JDBC_PASS=postgres
export SUPABASE_ISSUER=https://example.supabase.co/auth/v1
export SUPABASE_JWKS_URL=https://example.supabase.co/auth/v1/.well-known/jwks.json
export SUPABASE_AUDIENCE=authenticated
export GUEST_COOKIE_SECRET=0123456789abcdef0123456789abcdef
export ALLOWED_ORIGINS=http://localhost:5173
cd backend
./mvnw -Dtest=ReleaseAtomicityTest test
./mvnw -Dgroups='pg' -Dspring.datasource.url="$JDBC_URL" test
```

### Writing a new PG test (convention — keeps `mvn test` Docker-free)

```java
@Tag("pg")                       // excluded from default runs via -Dgroups='!pg'
@Testcontainers
class ReleasePgIT {
  @Container
  static PostgreSQLContainer<?> pg =
      new PostgreSQLContainer<>("postgres:14").withDatabaseName("elevateme");
  // @DynamicPropertySource: spring.datasource.url/username/password from pg,
  // then Flyway V1..V10 auto-migrates on context boot.
  // Assert: concurrent duplicate Idempotency-Key → 1 release row;
  //         fault mid-tx → 0 release rows + 0 outbox rows;
  //         revoked fragment replay → 401.
}
```

Rules: never commit a wrapper jar or `.env`; least-privilege runtime role
(`app_runtime`: `SELECT/INSERT/UPDATE/DELETE` + `USAGE` on sequences, no DDL)
vs migration owner (see `backend/README.md`); every denial test asserts the
HTTP shape (`401` unauthenticated / `403` forbidden+`ACCOUNT_PENDING` /
`404` no-enumeration) plus `audit_events` row with `requestId` and no PII.
