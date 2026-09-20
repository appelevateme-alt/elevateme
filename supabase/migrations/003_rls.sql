-- ============================================================================
-- ElevateMe migration 003_rls
-- Run THIRD in the Supabase SQL editor (after 002_participation.sql).
-- Postgres 14 compatible.
--
-- Model:
--   * RLS enabled on every table.
--   * anon (unauthenticated): SELECT published programs (Published|InProgress)
--     + sessions of those programs + Published announcements + active
--     evaluation template + institutes directory. Nothing else.
--   * authenticated: least privilege per role. Admin = profiles.status
--     'Approved' AND 'admin' = ANY(roles). Students see own rows + released
--     evaluations only; parents see linked students' released rows;
--     coordinators manage OWN programs (INSERT drafts, UPDATE only
--     Draft|ChangesRequested); evaluators read/write own assignments while
--     the sheet is Draft.
--   * profiles: users SELECT/UPDATE their own row; contact fields only --
--     status/roles/elevate_me_id changes by non-admins are rejected by the
--     guard trigger in 004_logic.sql (RLS is row-level, so column protection
--     lives there).
--   * audit_log: NO update/delete for anyone; only admins may SELECT; rows
--     are INSERTed by SECURITY DEFINER triggers/RPCs (table owner bypasses
--     RLS), never directly by app roles -- so no INSERT policy is created.
--
-- Recursion safety: every policy that needs to inspect the `profiles` table
-- (own status/roles) goes through the SECURITY DEFINER helpers below, which
-- read `profiles` as the table owner and therefore do NOT re-enter RLS.
-- Policies never SELECT from `profiles` directly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER => bypass RLS, no recursion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'Approved'
      AND 'admin' = ANY (p.roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(r text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'Approved'
      AND r = ANY (p.roles)
  );
$$;

-- True when the caller is the verified/approved parent of the given student.
CREATE OR REPLACE FUNCTION public.is_linked_student(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_links pl
    WHERE pl.parent_id = auth.uid()
      AND pl.student_id = sid
      AND pl.status IN ('Approved', 'Verified')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_linked_student(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_student(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS on everything
-- ----------------------------------------------------------------------------
ALTER TABLE public.institutes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_replies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_evaluators   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INSTITUTES: public directory; admin-only writes
-- ============================================================================
DROP POLICY IF EXISTS institutes_select_public ON public.institutes;
CREATE POLICY institutes_select_public ON public.institutes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS institutes_admin_all ON public.institutes;
CREATE POLICY institutes_admin_all ON public.institutes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- PROFILES
-- ============================================================================
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_select_linked_student ON public.profiles;
CREATE POLICY profiles_select_linked_student ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_linked_student(id));

-- Coordinators see students registered in programs they created.
DROP POLICY IF EXISTS profiles_select_coordinator_roster ON public.profiles;
CREATE POLICY profiles_select_coordinator_roster ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.registrations r
    JOIN public.programs p ON p.id = r.program_id
    WHERE r.student_id = profiles.id AND p.created_by = auth.uid()
  ));

-- Evaluators see students they are assigned to evaluate.
DROP POLICY IF EXISTS profiles_select_evaluator_students ON public.profiles;
CREATE POLICY profiles_select_evaluator_students ON public.profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.student_id = profiles.id AND e.evaluator_id = auth.uid()
  ));

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

-- Signup path (the handle_new_user trigger runs as owner and bypasses RLS;
-- this policy is a fallback for client-side row creation only).
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Own-row updates only; protected columns enforced by guard trigger in 004.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- PARENT LINKS: the two linked parties + admin
-- ============================================================================
DROP POLICY IF EXISTS parent_links_select_parties ON public.parent_links;
CREATE POLICY parent_links_select_parties ON public.parent_links
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid() OR student_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS parent_links_insert_parties ON public.parent_links;
CREATE POLICY parent_links_insert_parties ON public.parent_links
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid() OR student_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS parent_links_update_parties ON public.parent_links;
CREATE POLICY parent_links_update_parties ON public.parent_links
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid() OR student_id = auth.uid() OR public.is_admin())
  WITH CHECK (parent_id = auth.uid() OR student_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS parent_links_delete_parties ON public.parent_links;
CREATE POLICY parent_links_delete_parties ON public.parent_links
  FOR DELETE TO authenticated
  USING (parent_id = auth.uid() OR student_id = auth.uid() OR public.is_admin());

-- ============================================================================
-- PROGRAMS
-- ============================================================================
-- anon: published catalogue only.
DROP POLICY IF EXISTS programs_select_anon ON public.programs;
CREATE POLICY programs_select_anon ON public.programs
  FOR SELECT TO anon USING (status IN ('Published', 'InProgress'));

-- authenticated: published + own drafts + registrations + evaluator assignments.
DROP POLICY IF EXISTS programs_select_auth ON public.programs;
CREATE POLICY programs_select_auth ON public.programs
  FOR SELECT TO authenticated
  USING (
    status IN ('Published', 'InProgress')
    OR created_by = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.registrations r
               WHERE r.program_id = programs.id AND r.student_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.program_evaluators pe
               WHERE pe.program_id = programs.id AND pe.evaluator_id = auth.uid())
  );

-- Coordinators INSERT drafts only (admins unrestricted).
DROP POLICY IF EXISTS programs_insert_coordinator ON public.programs;
CREATE POLICY programs_insert_coordinator ON public.programs
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role('coordinator') OR public.is_admin())
    AND (status = 'Draft' OR public.is_admin())
    AND (created_by = auth.uid() OR public.is_admin())
  );

-- Coordinators UPDATE only their own Draft|ChangesRequested rows.
DROP POLICY IF EXISTS programs_update_owner ON public.programs;
CREATE POLICY programs_update_owner ON public.programs
  FOR UPDATE TO authenticated
  USING (public.is_admin()
         OR (created_by = auth.uid() AND status IN ('Draft', 'ChangesRequested')))
  WITH CHECK (public.is_admin()
         OR (created_by = auth.uid() AND status IN ('Draft', 'Submitted', 'ChangesRequested')));

DROP POLICY IF EXISTS programs_delete_owner_draft ON public.programs;
CREATE POLICY programs_delete_owner_draft ON public.programs
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (created_by = auth.uid() AND status = 'Draft'));

-- ============================================================================
-- SESSIONS: visible exactly when the parent program is visible / manageable
-- ============================================================================
DROP POLICY IF EXISTS sessions_select_anon ON public.sessions;
CREATE POLICY sessions_select_anon ON public.sessions
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.programs p
                 WHERE p.id = sessions.program_id
                   AND p.status IN ('Published', 'InProgress')));

DROP POLICY IF EXISTS sessions_select_auth ON public.sessions;
CREATE POLICY sessions_select_auth ON public.sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.programs p
            WHERE p.id = sessions.program_id
              AND (p.status IN ('Published', 'InProgress')
                   OR p.created_by = auth.uid()))
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.program_evaluators pe
               WHERE pe.session_id = sessions.id AND pe.evaluator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.registrations r
               WHERE (r.session_id = sessions.id OR r.program_id = sessions.program_id)
                 AND r.student_id = auth.uid())
  );

DROP POLICY IF EXISTS sessions_write_owner ON public.sessions;
CREATE POLICY sessions_write_owner ON public.sessions
  FOR ALL TO authenticated
  USING (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = sessions.program_id AND p.created_by = auth.uid()))
  WITH CHECK (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = sessions.program_id AND p.created_by = auth.uid()));

-- ============================================================================
-- REGISTRATIONS
-- ============================================================================
DROP POLICY IF EXISTS registrations_select ON public.registrations;
CREATE POLICY registrations_select ON public.registrations
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_linked_student(student_id)
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = registrations.program_id AND p.created_by = auth.uid())
  );

-- Students create their own Pending requests; admins may insert anything.
DROP POLICY IF EXISTS registrations_insert ON public.registrations;
CREATE POLICY registrations_insert ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (student_id = auth.uid()
        AND status = 'Pending'
        AND evaluation_state = 'NotStarted')
  );

-- Students may cancel their own; coordinators manage their programs; admin all.
DROP POLICY IF EXISTS registrations_update ON public.registrations;
CREATE POLICY registrations_update ON public.registrations
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = registrations.program_id AND p.created_by = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR (student_id = auth.uid() AND status = 'Cancelled')
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = registrations.program_id AND p.created_by = auth.uid())
  );

DROP POLICY IF EXISTS registrations_delete ON public.registrations;
CREATE POLICY registrations_delete ON public.registrations
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (student_id = auth.uid() AND status = 'Pending')
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = registrations.program_id AND p.created_by = auth.uid())
  );

-- ============================================================================
-- EVALUATIONS: released-only for students/parents; own assignments for
-- evaluators (read/write while Draft); own programs for coordinators; admin all
-- ============================================================================
DROP POLICY IF EXISTS evaluations_select ON public.evaluations;
CREATE POLICY evaluations_select ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR (released = true AND student_id = auth.uid())
    OR (released = true AND public.is_linked_student(student_id))
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = evaluations.program_id AND p.created_by = auth.uid())
  );

DROP POLICY IF EXISTS evaluations_insert ON public.evaluations;
CREATE POLICY evaluations_insert ON public.evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (evaluator_id = auth.uid() AND state = 'Draft' AND released = false)
  );

-- Evaluators move their own Draft -> Submitted (submit_evaluation RPC does the
-- state change server-side; this policy permits the client path too).
DROP POLICY IF EXISTS evaluations_update ON public.evaluations;
CREATE POLICY evaluations_update ON public.evaluations
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (evaluator_id = auth.uid() AND state = 'Draft')
  )
  WITH CHECK (
    public.is_admin()
    OR (evaluator_id = auth.uid() AND state IN ('Draft', 'Submitted') AND released = false)
  );

DROP POLICY IF EXISTS evaluations_delete_admin ON public.evaluations;
CREATE POLICY evaluations_delete_admin ON public.evaluations
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================================
-- EVALUATION SCORES: mirror the parent evaluation's visibility; writes only
-- on own Draft sheets (plus a BEFORE trigger in 004 that hard-blocks edits
-- once the sheet leaves Draft).
-- ============================================================================
DROP POLICY IF EXISTS evaluation_scores_select ON public.evaluation_scores;
CREATE POLICY evaluation_scores_select ON public.evaluation_scores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.id = evaluation_scores.evaluation_id
      AND (public.is_admin()
           OR e.evaluator_id = auth.uid()
           OR (e.released = true AND e.student_id = auth.uid())
           OR (e.released = true AND public.is_linked_student(e.student_id))
           OR EXISTS (SELECT 1 FROM public.programs p
                      WHERE p.id = e.program_id AND p.created_by = auth.uid()))
  ));

DROP POLICY IF EXISTS evaluation_scores_write ON public.evaluation_scores;
CREATE POLICY evaluation_scores_write ON public.evaluation_scores
  FOR ALL TO authenticated
  USING (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.evaluations e
                    WHERE e.id = evaluation_scores.evaluation_id
                      AND e.evaluator_id = auth.uid() AND e.state = 'Draft'))
  WITH CHECK (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.evaluations e
                    WHERE e.id = evaluation_scores.evaluation_id
                      AND e.evaluator_id = auth.uid() AND e.state = 'Draft'));

-- ============================================================================
-- EVALUATION TEMPLATES: everyone reads the active rubric; admin manages
-- ============================================================================
DROP POLICY IF EXISTS evaluation_templates_select ON public.evaluation_templates;
CREATE POLICY evaluation_templates_select ON public.evaluation_templates
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS evaluation_templates_admin ON public.evaluation_templates;
CREATE POLICY evaluation_templates_admin ON public.evaluation_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- RECOMMENDATIONS: student reads own; parent reads linked; admin manages;
-- coordinators read recommendations of students in their programs.
-- Students may flip their own New -> Viewed -> Completed.
-- ============================================================================
DROP POLICY IF EXISTS recommendations_select ON public.recommendations;
CREATE POLICY recommendations_select ON public.recommendations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR student_id = auth.uid()
    OR public.is_linked_student(student_id)
    OR EXISTS (SELECT 1 FROM public.registrations r
               JOIN public.programs p ON p.id = r.program_id
               WHERE r.student_id = recommendations.student_id
                 AND p.created_by = auth.uid())
  );

DROP POLICY IF EXISTS recommendations_admin_write ON public.recommendations;
CREATE POLICY recommendations_admin_write ON public.recommendations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS recommendations_student_progress ON public.recommendations;
CREATE POLICY recommendations_student_progress ON public.recommendations
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND status IN ('New', 'Viewed', 'Completed'));

-- ============================================================================
-- ANNOUNCEMENTS: anon reads Published; auth reads Published (+ own drafts);
-- DI admin publishes; coordinators may stage own drafts.
-- ============================================================================
DROP POLICY IF EXISTS announcements_select_anon ON public.announcements;
CREATE POLICY announcements_select_anon ON public.announcements
  FOR SELECT TO anon USING (status = 'Published');

DROP POLICY IF EXISTS announcements_select_auth ON public.announcements;
CREATE POLICY announcements_select_auth ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'Published' OR created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS announcements_insert ON public.announcements;
CREATE POLICY announcements_insert ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR ((public.has_role('coordinator')) AND status = 'Draft' AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS announcements_update ON public.announcements;
CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR (created_by = auth.uid() AND status = 'Draft'))
  WITH CHECK (public.is_admin() OR (created_by = auth.uid()));

DROP POLICY IF EXISTS announcements_delete ON public.announcements;
CREATE POLICY announcements_delete ON public.announcements
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (created_by = auth.uid() AND status = 'Draft'));

-- ============================================================================
-- MESSAGE THREADS + REPLIES: participants (creator / linked student / parent)
-- and admin. Replies are append-only for non-admins.
-- ============================================================================
DROP POLICY IF EXISTS message_threads_select ON public.message_threads;
CREATE POLICY message_threads_select ON public.message_threads
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR student_id = auth.uid()
    OR public.is_linked_student(student_id)
  );

DROP POLICY IF EXISTS message_threads_insert ON public.message_threads;
CREATE POLICY message_threads_insert ON public.message_threads
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS message_threads_update ON public.message_threads;
CREATE POLICY message_threads_update ON public.message_threads
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = auth.uid()
         OR student_id = auth.uid() OR public.is_linked_student(student_id))
  WITH CHECK (public.is_admin() OR created_by = auth.uid()
         OR student_id = auth.uid() OR public.is_linked_student(student_id));

DROP POLICY IF EXISTS message_threads_delete_admin ON public.message_threads;
CREATE POLICY message_threads_delete_admin ON public.message_threads
  FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS message_replies_select ON public.message_replies;
CREATE POLICY message_replies_select ON public.message_replies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = message_replies.thread_id
      AND (public.is_admin() OR t.created_by = auth.uid()
           OR t.student_id = auth.uid() OR public.is_linked_student(t.student_id))
  ));

DROP POLICY IF EXISTS message_replies_insert ON public.message_replies;
CREATE POLICY message_replies_insert ON public.message_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = message_replies.thread_id
        AND (public.is_admin() OR t.created_by = auth.uid()
             OR t.student_id = auth.uid() OR public.is_linked_student(t.student_id))
    )
  );

DROP POLICY IF EXISTS message_replies_admin_all ON public.message_replies;
CREATE POLICY message_replies_admin_all ON public.message_replies
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- PROGRAM EVALUATORS: evaluator reads own assignments; owning coordinator
-- manages; admin all
-- ============================================================================
DROP POLICY IF EXISTS program_evaluators_select ON public.program_evaluators;
CREATE POLICY program_evaluators_select ON public.program_evaluators
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.programs p
               WHERE p.id = program_evaluators.program_id AND p.created_by = auth.uid())
  );

DROP POLICY IF EXISTS program_evaluators_write ON public.program_evaluators;
CREATE POLICY program_evaluators_write ON public.program_evaluators
  FOR ALL TO authenticated
  USING (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = program_evaluators.program_id AND p.created_by = auth.uid()))
  WITH CHECK (public.is_admin()
         OR EXISTS (SELECT 1 FROM public.programs p
                    WHERE p.id = program_evaluators.program_id AND p.created_by = auth.uid()));

-- ============================================================================
-- AUDIT LOG: append-only. Admins may SELECT. NO insert/update/delete policies
-- for app roles, so direct writes are denied; SECURITY DEFINER triggers/RPCs
-- (table owner) bypass RLS and are the only write path.
-- ============================================================================
DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;
CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
