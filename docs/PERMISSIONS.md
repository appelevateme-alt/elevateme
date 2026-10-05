# PERMISSIONS — current ElevateMe model

This is the authoritative permission summary for the temporary evaluator-access
cutover. Historical `coordinator` and `evaluator` labels may remain on old
profile rows for audit history, but those labels no longer grant application or
database staff access.

## Roles and entry points

| Actor | Entry point | Credential | Scope |
|---|---|---|---|
| Student | `/student/*` | Supabase Auth | Own profile, registrations, recommendations, messages, and released reports |
| Parent | `/parent/*` | Supabase Auth + approved `parent_links` row | Linked student’s released reports, recommendations, and messages |
| DI admin | `/admin/*` | Approved Supabase Auth profile with `admin` role | Platform administration, evaluator invitations, review, approval, release, and audit |
| Resource-person evaluator | `/evaluate/*` | One admin-issued fragment link, activated once | Assigned student sheets for one session until the fixed 24-hour deadline |

The evaluator link is not a Supabase account, password, or permanent role. The
fragment token is exchanged for a scoped HttpOnly cookie; the raw token is never
sent to the Java service in subsequent requests.

## Action matrix

| Action | Student | Parent | Guest evaluator | DI admin |
|---|---|---|---|---|
| View released performance | Own only | Approved/Verified linked student | Deny | Allow |
| View recommendations | Own | Linked student | Deny | Allow/manage |
| Edit recommendation status | Own progress only | Deny | Deny | Allow |
| Save evaluation draft | Deny | Deny | Assigned sheet only | Deny through guest flow |
| Submit evaluation | Deny | Deny | Assigned sheet only | Deny through guest flow |
| See evaluator identity/internal notes | Deny | Deny | Own identity only | Allow |
| Review or request changes | Deny | Deny | Deny | Allow |
| Release reports to students | Deny | Deny | Deny | Allow, session-wide |
| Manage programs/sessions | Register only | Read eligible catalogue | Deny | Allow |
| Manage evaluator assignments | Deny | Deny | Deny | Issue/revoke/replace links |
| Send/receive office messages | Own or linked threads | Own or linked threads | Deny | All threads |
| Approve users/programs | Deny | Deny | Deny | Audited RPCs |

## Server-side gates

- Supabase RLS is authoritative for student, parent, admin, and public data.
- Migration `010_temporary_evaluator_access.sql` removes old owner/assignment
  policies from programs, sessions, registrations, recommendations,
  announcements, profiles, and `program_evaluators`.
- Direct authenticated writes to legacy `evaluations` and
  `evaluation_scores`, plus the old `release_evaluations` and
  `submit_evaluation` RPCs, are revoked.
- `evaluator_private` is private to the separately provisioned Java database
  role. Browser roles cannot query it.
- Every guest request rechecks invitation/session expiry, revocation, sheet
  ownership, state, and optimistic version in a transaction.
- A report becomes visible only after an admin approves the submitted revision
  and releases the complete session. The student-facing projection excludes
  evaluator identity, private notes, and internal recommendations.
- Notifications are deduplicated by `(recipient_id, event_key)` and delivered
  in-app plus through the Java mail outbox when SMTP is enabled.

## Retired-role handling

- Public signup accepts only `student` and `parent`.
- `has_role('coordinator')` and `has_role('evaluator')` always return false.
- `set_profile_roles` accepts only `student`, `parent`, and `admin`.
- Old routes redirect to `/evaluate/invite`; they do not open a staff shell.
- Existing historical rows are retained for audit/reporting and can be
  corrected by an admin; they are not deleted automatically.

## Required tests

The access suite must keep passing before merge:

- one-use activation and database-clock expiry;
- cross-student/session denial;
- private-schema and legacy-RPC denial;
- retired-role denial for legacy ownership/assignment policies;
- admin-only review, exclusion, and release;
- student/parent visibility only after release and without evaluator identity.
