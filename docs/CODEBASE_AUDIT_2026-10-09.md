# ElevateMe codebase audit — 9 October 2026

## Summary

Baseline: main `540f778bfe19cdbdee433eb2f93277142b4c259e` (PR #11 merged).
Review branch: `fix/codebase-audit`. Production data, deployment settings and
database policies were not changed during this audit. Merge and migration remain
owner-controlled. This is a bounded code/test audit, not a guarantee of zero bugs
or a completed production penetration test.

## Confirmed findings and fixes

| Area | Finding | Fix / evidence |
| --- | --- | --- |
| Report release | Runtime cannot read `parent_links`; release transaction can fail while notifying parents. | Migration 011 gives read-only table access with a role-specific SELECT policy. Restricted-role test passes. |
| Score publication | Existing score trigger calls `auth.uid()` but runtime lacks schema access. | Reproduced PostgreSQL permission error using actual repository SQL; 011 grants schema usage and execution of this function only. Same test then passes. |
| Parent privacy | Parent can create/approve a link to a student without their consent using direct API calls. | Parent can request Pending or revoke; approval requires student/DI. Participants cannot be changed via UPDATE. Denial and consent tests added. Historical links require manual review. |
| Evaluator logout | Logout only deleted browser cookie, leaving copied session credentials valid. | Stored session expiry is reduced to database time before deleting cookie; replay and service tests added. |
| Invitation identity | A new invitation could silently resume a different already-active evaluator cookie. | Explicit invitation is activated first. Failed logout no longer pretends to have succeeded. Dirty-form warning added. |
| Performance correctness | Static SVG always rose; strongest/weakest claims and filter success were fabricated. | Shared student/parent component uses released reports and real scores. Criterion/time/session filters and line/bar toggle are wired. Empty charts show no data. |
| Performance completeness | An unfiltered 100-score limit could truncate 20 reports; missing scores could look like zero. | Fetch up to 200 scores scoped to the selected 20 reports; only complete ten-criterion reports produce overall totals. True zero remains valid. |
| Diagnostics | Generic 500 discarded useful failure information; malformed UUIDs also became 500. | Safe reference plus exception class/SQLSTATE logging; no raw SQL, messages, token or feedback logging. Invalid path values get 422. |
| CI | Deployed root app/database tests were absent; backend ran only a short allowlist, excluding PR #11's regression. | Added deployed-app job and full `mvn test`; 193 Java tests pass, zero skips. |
| Dependencies | Root had 1 advisory; isolated revamp had 11, including critical development-tool advisories. | Updated lockfile and pinned revamp dependencies; both npm audits return zero known advisories. Both builds and 130 revamp tests pass. |
| Operations docs | Deployment docs still referenced the deleted serverless proxy. | Updated to the actual Vercel rewrite and migration 011 deployment instructions. |

## Verification

- Root Vite production build: passed.
- TypeScript check and revamp Vite production build: passed after upgrades.
- Revamp Vitest: 130 passing tests in 15 files.
- Full Java build/tests on GitHub Java 21 runner: 193 passing, 0 failed/skipped.
- Root Node tests cover privacy/migrations, redemption/expiry, restricted-role
  SQL, logout expiry and released-data insights. No real student data used.
- Lint succeeds with pre-existing React warnings; bundle-size warning remains.
- Contract fixture check: passed.
- npm audit: 0 advisories in both package trees at audit time. This is not a
  Java dependency/CVE scan or a guarantee against undisclosed vulnerabilities.

The local environment has Java 17 rather than the required Java 21; Java
execution was therefore verified by GitHub CI, not claimed as a local run.

## Rollout

1. Review this PR and migration 011; take the normal database backup.
2. Apply **only** `supabase/migrations/011_access_runtime_and_parent_consent.sql`
   after 010 using the migration owner. Never replay all historical migrations.
3. Merge and allow both Vercel projects to deploy. No new environment variables.
4. With synthetic accounts: generate invite, activate once, save, submit,
   review the internal identity/student preview, approve and release.
5. Verify released score/notification for student and a legitimately linked
   parent; verify unrelated users remain denied. Test logout and cookie replay.
6. Audit existing parent links for genuine consent; do not mass-delete them.

## Remaining limitations / next audit priorities

- No authenticated production end-to-end test, browser visual/accessibility
  audit, load test, or true multi-connection race test was performed. PGlite SQL
  tests establish permissions/SQL behavior, not deployment equivalence or races.
- SMTP remains unverified; mail worker delivery on a scale-to-zero container
  needs an operational scheduler/worker decision. Do not promise email delivery
  until this is configured and tested.
- The active access service lacks a dedicated distributed activation rate
  limiter. Edge rate limits should be evaluated before wider rollout.
- Two independent app/schema implementations remain. The root app is deployed;
  the TypeScript/app-schema revamp still has legacy staff concepts. Do not switch
  Vercel's root or Java entrypoint without a separate compatibility migration.
- Performance view deliberately says **up to 20 most recently released reports**,
  filters by release date, and calls its maximum “Best in view,” not lifetime
  personal best. Full-history pagination, session-date analysis and lifetime
  aggregate metrics remain separate work. Session choices use program + ordinal
  until the safe published projection includes session names.
- Program/other prototype chart callers without score data now show an honest
  empty state rather than an invented rising curve. Several older overview,
  development and parent-switcher screens still contain prototype behavior;
  they need product acceptance work, not just passing unit tests.
- Root bundle size and existing hook/fast-refresh lint warnings remain.
- Previously shared credentials should be revoked/rotated if still active.

No claim is made that every historical file or user journey is defect-free.
