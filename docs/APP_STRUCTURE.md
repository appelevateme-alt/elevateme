# ElevateMe — Backend Structure & How It Works

> Generated 2026-09-21. Matches the live Supabase project
> (`aivdidyfygbwuhesfhce`, Postgres 14, region ap-southeast-2).
> Setup/credentials: `supabase/ADMIN_BOOTSTRAP.md`. Migrations: `supabase/migrations/` (001–008, run in order).

## 1. What the backend is

Supabase project providing Postgres + Auth + Row-Level Security for the
ElevateMe app. The frontend never enforces business rules — every state
transition, permission check, and audit write happens here, in triggers,
CHECK constraints, RLS policies, and SECURITY DEFINER RPCs that the UI calls
via `supabase.rpc()`.

## 2. Tables (15)

| Table | Purpose | Key rules |
|-------|---------|-----------|
| institutes | Institute directory | Public read; admin writes |
| profiles | One row per person (`id` = auth user id; **no FK** to `auth.users` so seed/signup rows can pre-exist) | `status`: Approved/PendingReview/Rejected/Suspended/ChangesRequested · `roles[]` + `active_role`: student/parent/coordinator/evaluator/admin · students only get `elevate_me_id` |
| parent_links | Parent↔student links | Statuses Pending/Approved/Verified/…; `parent_id <> student_id` |
| programs | Events & cohorts | Lifecycle Draft → Submitted → UnderReview → Approved → Published (plus Rejected/ChangesRequested, InProgress); `registered` counter cache |
| sessions | Committees / sessions inside a program | Belong to one program |
| registrations | Student signups for a program/session | Pending/Confirmed/Waitlisted/Rejected/Cancelled; NULL `session_id` allowed for program-level rows |
| evaluations | One sheet per student×session | Draft → Submitted → Locked; `released` flag controls student/parent visibility |
| evaluation_scores | One row per criterion per sheet | `score` numeric **0–100** (CHECK); PK is `(evaluation_id, criterion_key)` — no `id` column, so the app upserts on the composite key |
| evaluation_templates | Versioned rubric (`v1` active) | `scale_map`: 10 × 0–100 = /1000, final = total ÷ 10 (/100); max one active |
| recommendations | Evaluator/admin → student next steps | Student or cohort audience |
| announcements | Draft → Scheduled → Published broadcasts | Anon reads Published only |
| message_threads / message_replies | Parent ↔ office messaging | Replies append-only for non-admins |
| program_evaluators | Evaluator assignments to program/session | Composite key, no `id` column |
| audit_log | Append-only history of every decision | **No UPDATE/DELETE possible** (trigger raises); `id` from `audit_log_id_seq`; app roles have no INSERT policy — only triggers/RPCs write |

## 3. The six audited write paths (RPCs)

All `SECURITY DEFINER`, granted to `authenticated` only, all write `audit_log`:

| RPC | Who | Transition enforced |
|-----|-----|---------------------|
| `approve_program(p_program_id, p_decision, p_note)` | admin | Submitted/UnderReview → Approved/Rejected/ChangesRequested; Approved → Published |
| `decide_profile(p_profile_id, p_decision, p_note)` | admin | PendingReview/ChangesRequested → Approved/Rejected/ChangesRequested; approving a student issues the ElevateMe ID |
| `set_profile_roles(p_profile_id, p_roles, p_active_role)` | admin | Role whitelist; active role must be assigned (role corrections) |
| `confirm_registration(p_registration_id, p_decision)` | owning coordinator or admin | Pending/Waitlisted → Confirmed/Waitlisted/Rejected/Cancelled; Confirmed fails at capacity (row lock) |
| `release_evaluations(p_session_id)` | admin or owning coordinator | All Submitted sheets in session → Locked + `released=true` + timestamp; errors if none |
| `submit_evaluation(p_evaluation_id)` | assigned evaluator or admin | Own Draft sheet with ≥1 score → Submitted |

## 4. Triggers

- `on_auth_user_created` → `handle_new_user()`: builds the profile from signup metadata (`roles[]`, enrichment). Adopts seed placeholders by email. `requested_role=admin` activates immediately (**TEMPORARY bootstrap**).
- `trg_assign_elevate_me_id`: on transition into `Approved`, assigns `EM-00000` from `elevate_me_seq` (students with NULL id only; next is EM-00135; never reused).
- `trg_sync_program_registered`: keeps `programs.registered` = COUNT of Confirmed registrations.
- `trg_guard_profile_columns`: only admins change `status`/`roles`/`elevate_me_id` (NULL-`uid` contexts like seed/SQL editor bypass).
- `trg_guard_scores_editable`: scores change only while parent sheet is `Draft` (admins bypass; NULL-`uid` bypass for seed).
- `trg_guard_audit_immutable`: `audit_log` rejects every UPDATE/DELETE — including FK side-effects (deleting a referenced profile fails unless audit rows go first).

## 5. Security model (RLS)

- RLS enabled on all 15 tables. Anon: published programs + their sessions, Published announcements, institutes, active rubric. Nothing else.
- Authenticated: least privilege per role (own rows, linked students, owned programs, own assignments; admin = `Approved` + `admin` in roles).
- **Hard rule (lesson learned): no policy contains an inline subquery against another RLS table** — that caused `42P17 infinite recursion` and 500s on every sign-in. All cross-table checks go through `SECURITY DEFINER` helpers: `is_admin`, `has_role`, `is_linked_student`, `is_program_owner`, `is_program_registered`, `is_program_evaluator`, `is_program_browseable`, `is_session_registered`, `is_session_evaluator`, `is_coordinator_student`, `is_my_evaluee` (006).

## 6. Scoring model

Ten criteria × 0–100 = sheet total /1000; final = total ÷ 10 (/100). Range enforced by CHECK; no baseline, no bands.

## 7. Auth & onboarding (server side)

Email confirmation is ON: signup creates the auth user with no session, so the trigger (not the client) must build a complete profile from metadata. Admin approval flips status; students get IDs. First sign-in backfills any missing enrichment client-side (unprotected columns only).

## 8. Operations lessons

- The Management API `/database/query` endpoint returns success loosely: batches with leading `--` comment blocks or multi-statements can silently skip — the SQL runner strips full-line comments and runs one statement per call; **always verify with counts / `pg_proc` / `pg_policies` checks afterwards**.
- Deleting a profile referenced by `audit_log` fails (guard blocks the FK null-out): drop the guard trigger, delete, recreate it — or prefer status changes over row deletion.
- Never hand-assign `audit_log.id`; the sequence owns it (a manual `max(id)+1` once collided and broke approvals until `setval` re-synced it).

## 9. Live state (2026-09-21)

Clean: 2 profiles (both admins, no ElevateMe IDs), 1 active rubric, all other tables empty. `seed.sql` holds optional demo data if ever wanted back.
