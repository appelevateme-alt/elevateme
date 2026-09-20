# ElevateMe — Admin bootstrap (fresh Supabase project, email confirmation ON)

> **STATUS 2026-09-20: database is LIVE.** All 6 migrations + seed were executed
> against the project via the Management API and verified. Migration 005
> reworked scoring to the 1000-point model (10 × 0–100, final = total/10;
> e-1 sheet 800/1000 → 80/100). Migration 006 fixed RLS infinite recursion
> (42P17) by routing every cross-table policy check through SECURITY DEFINER
> helpers — without it, any authenticated profile read 500s and users strand
> on pending-approval. Do NOT re-run sections 1–2 unless rebuilding
> from scratch.
>
> 2026-09-20 audit fixes: non-admin signups now get roles from metadata
> (previously roles '{}' + NULL active_role — every student/parent/
> coordinator/evaluator signup was broken); approval queue + metrics use the
> real `PendingReview` vocabulary; all decisions (program/user/release/
> submit/confirm) go through audited RPCs; coordinators can Confirm/Waitlist/
> Reject registrations (previously stuck Pending forever).
> Note: `profiles.id` has no FK to `auth.users` (placeholder rows must exist
> before signup — see `001_core.sql`); the query API silently skips failing
> statements, so any future re-seed must be verified with row counts.

> **TEMPORARY (remove when told):** until the bootstrap option is removed from
> sign-up, admins self-register via **Create account → Administrator (temporary
> bootstrap)** and are activated immediately after email confirmation. Steps 3–4
> below remain as the permanent (non-bootstrap) path. Removal checklist:
> 1. `src/views/auth.jsx` — delete the `admin` role option + `isAdmin` branches
>    (marked `TEMPORARY-BOOTSTRAP`).
> 2. `supabase/migrations/004_logic.sql` — delete the `TEMPORARY-BOOTSTRAP`
>    block in `handle_new_user()` and re-run that file.
> 3. This file — delete this notice.

## Fast path (temporary bootstrap, recommended for now)

1. Complete steps 1–2 below (migrations + seed).
2. Open the app → **Create account** → choose **Administrator (temporary
   bootstrap)** → complete the 5 steps.
3. Confirm via the email link, then **sign in** — you land straight in the
   admin workspace. No manual SQL promotion needed.

## 1. Run the migrations in order

In the Supabase dashboard open **SQL editor → New query**, paste one file at a
time, press **Run**, and wait for success before the next:

1. `supabase/migrations/001_core.sql` — institutes, profiles, parent_links, programs, sessions
2. `supabase/migrations/002_participation.sql` — registrations, evaluations (+scores, templates), recommendations, announcements, message threads/replies, evaluator assignments, audit log
3. `supabase/migrations/003_rls.sql` — RLS + role policies
4. `supabase/migrations/004_logic.sql` — signup trigger, ElevateMe-ID trigger, counter trigger, guards, RPCs
5. `supabase/migrations/005_scoring_rework.sql` — 1000-point model (score 0–100 per criterion)
6. `supabase/migrations/006_rls_recursion_fix.sql` — SECURITY DEFINER helpers, recursion-free policies (REQUIRED — without it sign-in breaks)
7. `supabase/migrations/007_signup_roles_audit.sql` — signup trigger reads `requested_role` + persists enrichment; `decide_profile` RPC for audited user approvals

Each file is idempotent (`IF NOT EXISTS` / `DROP … IF EXISTS` / `CREATE OR REPLACE`).

## 2. Run the seed

New query → paste `supabase/seed.sql` → **Run**. Safe to re-run. This inserts
the 3 institutes, 5 user placeholder profiles + 6 roster students, 4 programs,
3 sessions, assignments, registrations, evaluations, recommendations,
announcements, threads + reply, audit rows, and the active `v1` rubric.

## 3. Sign up the admin through the app

1. Open the Vite app sign-up page and register with the admin email
   (`admin@diplomaticimpact.org` or your replacement).
2. **Confirm via the email link first** (confirmation is ON — the account cannot
   sign in until verified).
3. Sign in once. The `handle_new_user` trigger adopts the seeded placeholder
   profile row (matched by email) and re-keys it to the real `auth.users` id,
   so all seeded FK rows follow automatically. The account lands in
   `PendingReview` and sees the pending-approval screen.

## 4. Promote that account to admin

New query → paste the block below (**with the email replaced**) → **Run**.
It flips the profile to `Approved` with the `admin` role. No ElevateMe ID is
assigned (students only — the trigger skips non-students automatically).

```sql
-- Replace the email, then run:
UPDATE public.profiles
SET status      = 'Approved',
    roles       = '{admin}',
    active_role = 'admin',
    updated_at  = now()
WHERE email = 'admin@diplomaticimpact.org';

-- Verify (expect 1 row: Approved | {admin} | admin | elevate_me_id NULL):
SELECT email, status, roles, active_role, elevate_me_id
FROM public.profiles
WHERE email = 'admin@diplomaticimpact.org';
```

## 5. Sanity checks

```sql
SELECT slug, status, registered FROM public.programs ORDER BY slug;
SELECT slug, state, released FROM public.evaluations ORDER BY slug;
SELECT count(*) AS score_rows_for_e1
FROM public.evaluation_scores
WHERE evaluation_id = (SELECT id FROM public.evaluations WHERE slug = 'e-1');
-- expect 6
SELECT version, is_active FROM public.evaluation_templates;
SELECT status, count(*) FROM public.profiles GROUP BY status;
```

Sign out/in as the admin in the app — the admin shell and approval queue
should now be reachable. Repeat steps 3–4 (with `coordinator`/`evaluator`
roles as needed) for the other seed users.
