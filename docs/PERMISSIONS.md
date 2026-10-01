# PERMISSIONS — Section 4 (code-enforceable, frozen)

## Shared-account ViewSwitcher note (normative)

- Student-shared account is ONE `profiles.id`. Student view and Parent view are presentation only.
- Switching views MUST NOT change `auth.uid`, account ID, or RLS identity.
- Messages sent while in Parent view MUST carry `sent-from-Parent-view` metadata; permission checks use the same account ID + `parent_links` (Approved/Verified) as before.
- Tests MUST assert: same ID across views, metadata flag set, no privilege gain from switching.

## Matrix (Action × Role)

| Action | student-shared (`/app/*`) | teacher / coordinator (`/staff/*`) | guest evaluator (`/evaluate/invite`) | DI admin (`/admin/*`, audited) |
|---|---|---|---|---|
| View own / linked performance + recommendations | own + linked-student released only | owned/assigned students, released or not | only token-scoped student×session | all, audited read |
| Submit / edit scores | deny | assigned evaluator + Draft sheet only | token-scoped Draft sheet only | bypass Draft guard, audited |
| Submit sheet (Draft→Submitted) | deny | own assignment via `submit_evaluation` | token-scoped submit only | deny (use RPC as evaluator excluded; admin release only) |
| Release (Submitted→Locked+released) | deny | owning coordinator via `release_evaluations` | deny | allow via `release_evaluations`, audited |
| Manage programs / sessions / registrations | register only | owning coordinator only (`confirm_registration`) | deny | allow, audited |
| Manage evaluator assignments | deny | owning coordinator | deny | allow, audited |
| Parent↔office messaging | own/linked threads only | own program threads | deny | all threads, audited |
| Approve users / roles / programs | deny | deny | deny | `decide_profile`, `set_profile_roles`, `approve_program`, audited |
| Provision staff / admin accounts | deny | deny | deny | admin-only invite RPC; NO public signup for staff/admin |

## Gates (must enforce in RLS + RPC, not UI)

- Teacher/coordinator: `is_program_owner` / `is_session_evaluator` / `is_coordinator_student` / `is_my_evaluee` (existing `SECURITY DEFINER` helpers). No ownership → deny.
- Guest: token → exactly one `program_evaluators` row + one session scope. No token → deny. No lateral reads.
- Admin: `is_admin` + every write via audited RPC into `audit_log`. No direct table writes from client.
- No public signup for teacher/coordinator/admin/guest. Staff and admin exist only via audited admin provisioning.

## TEMPORARY bootstrap — MUST-REMOVE

- Current `handle_new_user()` behavior `requested_role=admin activates immediately` is TEMPORARY bootstrap only.
- MUST-REMOVE before revamp launch: replace with PendingReview + admin approval for all roles. Tracked as launch blocker.
