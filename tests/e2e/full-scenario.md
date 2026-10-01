# Full scenario — end-to-end (acceptance 1–18)

Manual e2e covering the 18 permission/quality essentials. No real secrets:
use placeholder env vars and `example.test` users in a non-production project.
Backend base `http://localhost:8080/api/v1` (dev proxy `/api` → Java).
Frontend `http://localhost:5173`.

```bash
export API="http://localhost:8080/api/v1"
export WEB="http://localhost:5173"
# Create via dashboard/Auth API (test domains only), then export access JWTs:
export JWT_ADMIN="<admin-access-jwt>"
export JWT_TEACHER="<approved-teacher-access-jwt>"
export JWT_A="<student-A-access-jwt>"
export JWT_B="<student-B-access-jwt>"
export JWT_PENDING="<pending-teacher-access-jwt>"
export PROGRAM_ID="<program-id-placeholder>"
export SESSION_ID="<session-id-placeholder>"
export REPORT_A="<released-report-id-for-student-A>"
```

## 1. Student A reads own reports — 200, A only

```bash
curl -s -w '\n%{http_code}\n' "$API/me/reports" -H "Authorization: Bearer $JWT_A"
# expect 200, contains REPORT_A, no other-student rows
curl -s -w '\n%{http_code}\n' "$API/me/reports/$REPORT_A" -H "Authorization: Bearer $JWT_A"
# expect 200, id == REPORT_A
```

UI: sign in as A → `/app/reports` lists own; `/app/reports/$REPORT_A` opens
10 marks + total/1000 + normalized/100, no staff-private notes.

## 2. Student B reads A's report — 404 (no enumeration)

```bash
curl -s -w '\n%{http_code}\n' "$API/me/reports/$REPORT_A" -H "Authorization: Bearer $JWT_B"
# expect 404 {"code":"NOT_FOUND",...} — same as random id
curl -s "$API/me/reports" -H "Authorization: Bearer $JWT_B" | grep -c "$REPORT_A"
# expect 0
```

## 3. Teacher cannot publish program — 403

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/programs/$PROGRAM_ID/publish" \
  -H "Authorization: Bearer $JWT_TEACHER"
# expect 403 {"code":"FORBIDDEN",...}
```

## 4. Teacher cannot preview/publish recommendation — 403

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/audiences/preview" \
  -H "Authorization: Bearer $JWT_TEACHER" -H 'Content-Type: application/json' \
  -d '{"individualIds":["<student-id-placeholder>"]}'
# expect 403
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/recommendations" \
  -H "Authorization: Bearer $JWT_TEACHER" -H 'Content-Type: application/json' \
  -d '{"title":"T","action":"Do X","reason":"Because Y","priority":"MED","individualIds":["<student-id-placeholder>"]}'
# expect 403
```

## 5. Guest cannot release — 403

```bash
# With guest_session cookie (exchange a placeholder fragment first):
curl -s -w '\n%{http_code}\n' -X POST "$API/sessions/$SESSION_ID/release-reports" \
  -b "guest_session=<guest-session-placeholder>" -H 'Content-Type: application/json' -d '{}'
# expect 403 (no release row, no outbox, audited ACCESS_DENIED)
```

UI: guest workspace shows no Release control.

## 6. Guest scoped read: unrelated session — 404

```bash
curl -s -w '\n%{http_code}\n' "$API/guest/evaluations/<eval-in-other-session-placeholder>" \
  -b "guest_session=<guest-session-placeholder>"
# expect 404 (single-invitation scope, no enumeration)
```

## 7. Revocation immediate — replay 401

Admin/staff: `POST /sessions/$SESSION_ID/invitations` → revoke
(`DELETE` per API), then:

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/guest/exchange" \
  -H 'Content-Type: application/json' -d '{"fragment":"<revoked-fragment-placeholder>"}'
# expect 401
curl -s -w '\n%{http_code}\n' "$API/guest/evaluations/<eval-id-placeholder>" \
  -b "guest_session=<revoked-session-placeholder>"
# expect 401 (no grace window)
```

## 8. Admin-only targeting (preview) — non-admin 403, admin 200

Same as §4 for 403; then as admin:

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/audiences/preview" \
  -H "Authorization: Bearer $JWT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"individualIds":["<student-id-placeholder>"]}'
# expect 200 {recipientIds, count}
```

## 9. Admin-only development assign — non-admin 403

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/development/<event-id-placeholder>/assign" \
  -H "Authorization: Bearer $JWT_TEACHER" -H 'Content-Type: application/json' \
  -d '{"recipientIds":["<student-id-placeholder>"],"reason":"pilot"}'
# expect 403
```

## 10. Paid pending until verified — claim does NOT confirm

```bash
# Student registers PAID dev event:
curl -s -X POST "$API/me/development/<event-id-placeholder>/register" \
  -H "Authorization: Bearer $JWT_A" | tee /tmp/paid.json
# expect status AWAITING_PAYMENT_VERIFICATION + external paymentUrl + holdExpiresAt
export REG_ID="<registration-id-from-paid.json>"

# "I have paid" submits reference only:
curl -s -X POST "$API/registrations/$REG_ID/payment-reference" \
  -H "Authorization: Bearer $JWT_A" -H 'Content-Type: application/json' \
  -d '{"reference":"<external-ref-placeholder>"}' | tee /tmp/claim.json
# expect state PENDING, confirmed false (registration NOT confirmed)
```

## 11. Admin VERIFIED confirms (+ admin + time)

```bash
export PAY_ID="<payment-id-from-claim>"
curl -s -X POST "$API/admin/payments/$PAY_ID/verify" \
  -H "Authorization: Bearer $JWT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"decision":"VERIFIED"}'
# expect state VERIFIED + verifiedBy (admin) + verifiedAt; registration CONFIRMED
```

## 12. REJECTED needs reason (422); double-verify 409

```bash
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/payments/$PAY_ID/verify" \
  -H "Authorization: Bearer $JWT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"decision":"REJECTED","reason":"  "}'
# expect 422
curl -s -w '\n%{http_code}\n' -X POST "$API/admin/payments/$PAY_ID/verify" \
  -H "Authorization: Bearer $JWT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"decision":"VERIFIED"}'
# expect 409 INVALID_STATE (already VERIFIED)
```

## 13. Release atomic + repeat-safe (same key, no dup)

```bash
export IDEM="release-$SESSION_ID-pilot-001"
curl -s -X POST "$API/sessions/$SESSION_ID/release-reports" \
  -H "Authorization: Bearer $JWT_ADMIN" -H "Idempotency-Key: $IDEM" \
  -H 'Content-Type: application/json' -d '{}' | tee /tmp/rel1.json
curl -s -X POST "$API/sessions/$SESSION_ID/release-reports" \
  -H "Authorization: Bearer $JWT_ADMIN" -H "Idempotency-Key: $IDEM" \
  -H 'Content-Type: application/json' -d '{}' | tee /tmp/rel2.json
# expect identical bodies (repeated true on second), one release row
# Preview first: .../release-reports?dryRun=true shows submitted/expected/excluded
```

UI: staff roster → preview counts → Confirm release → notice shows
released/submitted/expected/excluded; repeat shows "Already released".

## 14. Fault → no partial (covered automated)

Automated: `ReleaseAtomicityTest.faultMidTransaction_noPartialReleases`
(lock fault → no release row, no outbox, no audit).
Manual: stop DB mid-release is out of scope; verify preview + release counts
match and `audit_events` has a single `REPORTS_RELEASED` row per release.

## 15. Alert <30 creates, 30 does NOT

Seed or release: criterion score 29 → `app.criterion_alerts` ACTIVE row;
score 30 → no alert row. UI: latest report with a sub-30 mark shows the calm
"below 30" nudge; a 30 shows none. Automated:
`PermissionRegressionTest.acceptance15_alertBelow30Creates_30DoesNot`.

## 16. Resolve ≥30 (30 resolves, 29 stays active)

Later chronological released score ≥30 on the alerted criterion → alert
`resolved_at` set (history kept); later 29 → stays ACTIVE (evidence refresh,
no dup email). Automated:
`PermissionRegressionTest.acceptance16_alertResolve30_resolves_29Stays`.

## 17. Pending staff roster — 403 ACCOUNT_PENDING, zero bytes

```bash
curl -s -w '\n%{http_code}\n' "$API/sessions/$SESSION_ID/roster" \
  -H "Authorization: Bearer $JWT_PENDING"
# expect 403 {"code":"ACCOUNT_PENDING",...}, no roster rows
```

UI: sign in as pending → `/account/pending` before any roster fetch
(devtools: no `/roster` request after redirect).

## 18. Targeting invisibility — non-assignee 404 + cross-student rec 404

```bash
curl -s -w '\n%{http_code}\n' "$API/me/development/<event-id-placeholder>" \
  -H "Authorization: Bearer $JWT_B"
# expect 404 when B is not assigned
curl -s -w '\n%{http_code}\n' -X PATCH "$API/me/recommendations/<recipient-id-of-A>" \
  -H "Authorization: Bearer $JWT_B" -H 'Content-Type: application/json' \
  -d '{"completed":true}'
# expect 404 (no enumeration)
```

UI a11y/spot checks while here: keyboard-only score entry (native inputs,
visible focus), dialogs trap + restore focus + Escape, charts have data tables,
live regions announce save/loading, reduced-motion honored, 44px targets,
contrast from existing vars. Perf: staff/admin routes lazy-load, charts lazy,
images lazy + responsive, roster/queries paginated (no bulk fetch).

## Pass checklist

- [ ] 1–2 isolation 200/404 + B list lacks A
- [ ] 3–4 teacher publish/recommend 403
- [ ] 5–7 guest release 403, scoped 404, revoke 401
- [ ] 8–9 admin-only targeting 403/200
- [ ] 10–12 paid pending → verified confirms; rejected needs reason; double 409
- [ ] 13–14 release repeat-safe + atomic (single audit row)
- [ ] 15–16 <30 alerts / 30 not; ≥30 resolves
- [ ] 17 pending roster 403 ACCOUNT_PENDING, zero data
- [ ] 18 non-assignee + cross-student rec 404
- [ ] Outbox: `GET /admin/outbox?state=FAILED` 200 (admin), 403 (non-admin);
  SENT rows carry `provider_message_id`
- [ ] `audit_events` has denials with requestIds, no PII message text
