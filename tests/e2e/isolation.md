# Phase 1c — Student A vs B isolation proof (manual e2e)

Exit criteria: cross-student reads are 404 (no enumeration), unauthenticated is 401,
pending staff roster reads are 403 `ACCOUNT_PENDING` with no roster data leaked.

No real secrets in this file. Use placeholder env vars; create test users in a
non-production project with `example.test` domains only.

## 0. Setup

```bash
export API="http://localhost:8080/api/v1"
# Supabase Auth test users (create via dashboard / Auth API — test domains only):
#   student-a@example.test / student-b@example.test / teacher-pending@example.test
# Sign each in (Supabase JS / GoTrue) and export their access JWTs:
export JWT_A="<student-A-access-jwt>"
export JWT_B="<student-B-access-jwt>"
export JWT_PENDING="<pending-teacher-access-jwt>"
```

Backend must run with `app_runtime` (least-privilege, no DDL) after
`database/migrations/V5__rls_lockdown.sql`. RLS is deny-by-default
(`deny_all` policies `USING (false)`); Java JDBC scoping is authoritative.

## 1. Seed: release a report for Student A only

Via admin (DB `role='admin'`, `status='Approved'`) — no public admin signup:

```bash
# Admin releases session reports (idempotent; preview counts first per API):
curl -s -X POST "$API/sessions/$SESSION_ID/release-reports" \
  -H "Authorization: Bearer $JWT_ADMIN" \
  -H "Idempotency-Key: release-$SESSION_ID-001" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false}' | tee /tmp/release.json

# Capture one released report id belonging to Student A:
export REPORT_A="<released-evaluation-id-for-student-A>"
```

## 2. Student A reads own reports — 200 with A only

```bash
curl -s -w '\n%{http_code}\n' "$API/me/reports" \
  -H "Authorization: Bearer $JWT_A"
# expect: 200, array containing REPORT_A, no rows for any other student

curl -s -w '\n%{http_code}\n' "$API/me/reports/$REPORT_A" \
  -H "Authorization: Bearer $JWT_A"
# expect: 200 with id == $REPORT_A
```

## 3. Student B tries Student A's report — 404 (no enumeration)

```bash
curl -s -w '\n%{http_code}\n' "$API/me/reports/$REPORT_A" \
  -H "Authorization: Bearer $JWT_B"
# expect: 404 {"code":"NOT_FOUND",...} — same shape as unknown id (no existence oracle)

curl -s "$API/me/reports" -H "Authorization: Bearer $JWT_B" | head -c 500
# expect: 200, does NOT contain $REPORT_A
```

Isolation passes iff B's fetch of A's id is indistinguishable from a random id
(both 404), and B's list never includes A's rows. Denials emit audit
`(actor, ACCESS_DENIED, student_read, requestId)` with no PII message text.

## 4. Unauthenticated — 401

```bash
curl -s -w '\n%{http_code}\n' "$API/me/reports"
# expect: 401 (no token) — frontend re-auths via /sign-in?next=%2Fapp%2Freports

curl -s -w '\n%{http_code}\n' "$API/me/reports/$REPORT_A"
# expect: 401
```

## 5. Pending teacher roster — 403 ACCOUNT_PENDING, no data

Teacher row: `app.profiles.status='PendingReview'` (role coordinator/evaluator):

```bash
curl -s -w '\n%{http_code}\n' "$API/sessions/$SESSION_ID/roster" \
  -H "Authorization: Bearer $JWT_PENDING"
# expect: 403 {"code":"ACCOUNT_PENDING",...} with empty/no roster rows
```

Frontend: `RequireActive` redirects `status==PendingReview` to `/account/pending`
before any roster fetch. Verify in devtools: no `/roster` request fires after the
redirect.

## 6. Teacher (non-admin) publish — 403

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/programs/$PROGRAM_ID/publish" \
  -H "Authorization: Bearer $JWT_TEACHER_APPROVED"
# expect: 403 {"code":"FORBIDDEN",...} (admin role from DB only)
```

## Pass checklist

- [ ] A `GET /me/reports` 200 contains A, B's list lacks A
- [ ] B `GET /me/reports/$REPORT_A` 404 (same as random id)
- [ ] Unauthenticated 401 on both report endpoints
- [ ] Pending teacher `/sessions/:id/roster` 403 `ACCOUNT_PENDING`, zero roster bytes
- [ ] Teacher publish 403; admin publish path unaffected
- [ ] `audit_events` has `ACCESS_DENIED` / `ACCESS_DENIED_PENDING` rows with requestIds, no message PII
