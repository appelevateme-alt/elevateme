# Temporary evaluator access deployment

Migration `010_temporary_evaluator_access.sql` replaces the old password-based
`coordinator`/`evaluator` workflow with admin-issued, single-use links. A link
has a fixed 24-hour expiry, is redeemed once, and creates an HttpOnly evaluator
session cookie scoped to the access API. Evaluators can only edit their assigned
student sheets. They cannot view other sessions, approve reports, release
reports, or access the student application.

## Database cutover

1. Take a Supabase backup and apply migrations `001` through `010` in order.
2. Run migration `010` as the database migration owner, not as the Java runtime
   user. It creates the `evaluator_private` schema and the `elevateme_access`
   NOLOGIN group role.
3. Create a separate LOGIN role through the managed database connection and
   grant it membership in the group role. Keep the password in the Java host's
   secret store, never in Git or Vercel.

```sql
CREATE ROLE elevateme_access_runtime LOGIN PASSWORD '<secret-from-your-secret-store>';
GRANT elevateme_access TO elevateme_access_runtime;
```

4. Confirm that no client-facing role has `INSERT`, `UPDATE`, or `DELETE`
   privileges on `public.evaluations` or `public.evaluation_scores`, and that
   the old `release_evaluations` and `submit_evaluation` functions are not
   executable by `authenticated`.

## Java service

Build and run `infra/Dockerfile.access` as the Java service. The container
starts `com.diplomaticimpact.access.AccessApplication`, which scans only the
temporary-access package and does not start the unrelated revamp controllers.

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `APP_PUBLIC_URL` | Exact Vercel origin, for origin checks and email links |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Used only to verify authenticated admin sessions through Supabase Auth |
| `JDBC_URL` | Direct or pooler PostgreSQL URL for the evaluator-access database |
| `JDBC_USER` | `elevateme_access_runtime` or another LOGIN member of `elevateme_access` |
| `JDBC_PASS` | Runtime role password |
| `ACCESS_MAIL_ENABLED` | `true` only after SMTP settings are configured |
| `MAIL_FROM` | Verified sender address for report notifications |

The existing Spring mail variables (`MAIL_HOST`, `MAIL_PORT`,
`MAIL_USERNAME`, and `MAIL_PASSWORD`) configure SMTP. Leave mail disabled until
the outbox is verified in staging.

## Vercel frontend

The root `vercel.json` explicitly rewrites `/api/evaluation-access/*` to
`https://elevateme-q23u.vercel.app/api/evaluation-access/*`. It disables caching
on these routes. `JAVA_API_URL` is no longer used by the deployed proxy.
The React frontend uses this same-origin route; keep Java's `APP_PUBLIC_URL`
set to the frontend production origin. A change of backend domain also requires
updating the rewrite destination. Preview frontends currently target this same
backend; do not use real records for preview testing.

## Audit migration 011

Apply `supabase/migrations/011_access_runtime_and_parent_consent.sql` once,
after migration 010, using the migration owner. It adds the runtime's missing
parent-link read and `auth.uid()` execution privileges needed during release.
It also blocks parent self-approval and changes to link participants. It does
not grant public session updates or access to auth tables.
Review existing approved parent links: the earlier permissive policy allowed
self-approval, and this migration cannot establish historical consent.
Do not replay migration 005 (it deletes historical score rows).

## Staging acceptance checks

- Create an invitation for two confirmed students; verify the generated URL
  contains a fragment token and is never returned again by the API.
- Redeem the URL twice and from two browsers at the same time; exactly one
  activation succeeds.
- Advance the invitation/session clock beyond 24 hours; workspace, sheet reads,
  saves, and submits all return 401 while saved drafts remain available to DI.
- Submit a complete sheet; verify the admin queue shows evaluator identity and
  the student preview contains only scores and feedback.
- Request changes; verify the evaluator can edit only after the request and a
  new revision is created.
- Attempt to approve/release as the evaluator, access another session, call the
  old RPCs, or query `evaluator_private` from the browser; all must fail.
- Approve and release a session; verify students and linked parents see the
  report only after release, evaluator identity is absent, and in-app/email
  notifications are deduplicated.
