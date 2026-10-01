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

## Nav matrix (routes × role — mirrors `frontend/src/lib/permissions.ts`)

| Route | student / parent | teacher / coordinator / evaluator | admin |
|---|---|---|---|
| `/app/*` (home, programs, performance, reports, recommendations, development, queries) | allow | deny | allow |
| `/staff/*` (programs list, builder, workspace, edit, roster, evaluations, students, comment bank) | deny | allow (own programs + assigned sessions; writes still checked server-side) | allow (bypasses staff ownership for management reads; writes still checked + audited server-side) |
| `/staff/programs` list | deny | allow | allow |
| `/staff/programs/new` builder | deny | allow | allow |
| `/staff/programs/:id` workspace + `:id/edit` (draft only) | deny | allow (owner / assigned) | allow |
| `/staff/programs/:id/sessions/:sessionId/roster` → evaluate flow (`/staff/evaluations/:id`, Next student) | deny | allow (assigned) | allow |
| `/staff/students/:id` detail | deny | allow (assigned) | allow |
| `/staff/comment-bank` (shared + own private) | deny | allow | allow |
| `/admin/*` (programs review, users review, recommendations, development, payments, queries, outbox, shared snippets) | deny | deny | allow |
| `/admin/programs` (Approve / Request changes / Reject + note, Publish) | deny | deny | allow |
| `/admin/users` + `/admin/users/:id` (account review) | deny | deny | allow |
| `/admin/comment-bank` (shared snippets curation) | deny | deny | allow |
| `/evaluate/invite`, `/evaluate/session`, `/evaluate/students/:studentId` (guest token scope) | deny | allow | allow |

Notes:

- Guards: `StaffLayout allow=['staff','coordinator','evaluator','admin']`,
  `AdminLayout allow=['admin']`. Admin links never point at staff routes that
  would exclude admin; admin reaches staff workspaces through the staff guard.
- Placeholders never redirect to an unrelated page (no outbox catch-all).
  Secondary non-MVP pages either link to their real owner page or show a
  "Deferred" badge with a docs hint.
- `canAccess(path, session)` in `lib/permissions.ts` is nav-only. It never
  grants backend access — the backend (ScopeGuard + RLS + RPC) stays
  authoritative and already enforced.

## Gates (must enforce in RLS + RPC, not UI)

- Teacher/coordinator: `is_program_owner` / `is_session_evaluator` / `is_coordinator_student` / `is_my_evaluee` (existing `SECURITY DEFINER` helpers). No ownership → deny.
- Guest: token → exactly one `program_evaluators` row + one session scope. No token → deny. No lateral reads.
- Admin: `is_admin` + every write via audited RPC into `audit_log`. No direct table writes from client.
- No public signup for teacher/coordinator/admin/guest. Staff and admin exist only via audited admin provisioning.

## TEMPORARY bootstrap — MUST-REMOVE

- Current `handle_new_user()` behavior `requested_role=admin activates immediately` is TEMPORARY bootstrap only.
- MUST-REMOVE before revamp launch: replace with PendingReview + admin approval for all roles. Tracked as launch blocker.
