-- ============================================================================
-- ElevateMe migration 006 — RLS recursion fix
-- Run AFTER 005, or fresh after 001-004 (idempotent, safe to re-run).
-- Postgres 14 compatible.
--
-- Root cause of `42P17 infinite recursion detected in policy for relation
-- "programs"`: several policies used INLINE subqueries against other
-- RLS-protected tables, forming a programs <-> registrations cycle
-- (profiles_select_coordinator_roster -> registrations+programs ->
-- programs_select_auth -> registrations -> registrations_select ->
-- programs -> ...). Any authenticated SELECT touching that chain (e.g. the
-- sign-in profile lookup) failed with HTTP 500, stranding users on the
-- pending-approval screen.
--
-- Fix: the file's own stated rule, now enforced everywhere — NO policy
-- contains an inline subquery against another RLS table. Every cross-table
-- check goes through a SECURITY DEFINER helper (table owner bypasses RLS,
-- so evaluation terminates). Policy names and semantics are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Cross-table helpers (SECURITY DEFINER => bypass RLS, no recursion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_program_owner(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = pid AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_program_registered(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.program_id = pid AND r.student_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_program_evaluator(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.program_evaluators pe
    WHERE pe.program_id = pid AND pe.evaluator_id = auth.uid()
  );
$$;

-- Program visible in the catalogue sense (published/in-progress) or owned.
CREATE OR REPLACE FUNCTION public.is_program_browseable(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = pid
      AND (p.status IN ('Published', 'InProgress') OR p.created_by = auth.uid())
  );
$$;

-- Caller is registered for the session directly or via its program.
CREATE OR REPLACE FUNCTION public.is_session_registered(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    JOIN public.sessions s ON s.id = sid
    WHERE r.student_id = auth.uid()
      AND (r.session_id = sid OR r.program_id = s.program_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_session_evaluator(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.program_evaluators pe
    WHERE pe.session_id = sid AND pe.evaluator_id = auth.uid()
  );
$$;

-- Caller coordinates (created the program of) a registration of this student.
CREATE OR REPLACE FUNCTION public.is_coordinator_student(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    JOIN public.programs p ON p.id = r.program_id
    WHERE r.student_id = sid AND p.created_by = auth.uid()
  );
$$;

-- Caller evaluates this student on at least one sheet.
CREATE OR REPLACE FUNCTION public.is_my_evaluee(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.student_id = sid AND e.evaluator_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_program_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_program_registered(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_program_evaluator(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_program_browseable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_session_registered(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_session_evaluator(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_coordinator_student(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_my_evaluee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_registered(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_evaluator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_program_browseable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_registered(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_evaluator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coordinator_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_evaluee(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- PROFILES: roster + evaluee checks via helpers (no inline RLS-table reads)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_coordinator_roster ON public.profiles;
CREATE POLICY profiles_select_coordinator_roster ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_coordinator_student(profiles.id));

DROP POLICY IF EXISTS profiles_select_evaluator_students ON public.profiles;
CREATE POLICY profiles_select_evaluator_students ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_my_evaluee(profiles.id));

-- ----------------------------------------------------------------------------
-- PROGRAMS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS programs_select_auth ON public.programs;
CREATE POLICY programs_select_auth ON public.programs
  FOR SELECT TO authenticated
  USING (
    status IN ('Published', 'InProgress')
    OR created_by = auth.uid()
    OR public.is_admin()
    OR public.is_program_registered(programs.id)
    OR public.is_program_evaluator(programs.id)
  );

-- ----------------------------------------------------------------------------
-- SESSIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS sessions_select_auth ON public.sessions;
CREATE POLICY sessions_select_auth ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.is_program_browseable(sessions.program_id)
    OR public.is_admin()
    OR public.is_session_evaluator(sessions.id)
    OR public.is_session_registered(sessions.id)
  );

DROP POLICY IF EXISTS sessions_write_owner ON public.sessions;
CREATE POLICY sessions_write_owner ON public.sessions
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_program_owner(sessions.program_id))
  WITH CHECK (public.is_admin() OR public.is_program_owner(sessions.program_id));

-- ----------------------------------------------------------------------------
-- REGISTRATIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS registrations_select ON public.registrations;
CREATE POLICY registrations_select ON public.registrations
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_linked_student(student_id)
    OR public.is_admin()
    OR public.is_program_owner(registrations.program_id)
  );

DROP POLICY IF EXISTS registrations_update ON public.registrations;
CREATE POLICY registrations_update ON public.registrations
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR student_id = auth.uid()
    OR public.is_program_owner(registrations.program_id)
  )
  WITH CHECK (
    public.is_admin()
    OR (student_id = auth.uid() AND status = 'Cancelled')
    OR public.is_program_owner(registrations.program_id)
  );

DROP POLICY IF EXISTS registrations_delete ON public.registrations;
CREATE POLICY registrations_delete ON public.registrations
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (student_id = auth.uid() AND status = 'Pending')
    OR public.is_program_owner(registrations.program_id)
  );

-- ----------------------------------------------------------------------------
-- EVALUATIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS evaluations_select ON public.evaluations;
CREATE POLICY evaluations_select ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR (released = true AND student_id = auth.uid())
    OR (released = true AND public.is_linked_student(student_id))
    OR public.is_program_owner(evaluations.program_id)
  );

-- ----------------------------------------------------------------------------
-- EVALUATION SCORES (inner program check via helper)
-- ----------------------------------------------------------------------------
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
           OR public.is_program_owner(e.program_id))
  ));

-- ----------------------------------------------------------------------------
-- RECOMMENDATIONS (coordinator check via helper)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS recommendations_select ON public.recommendations;
CREATE POLICY recommendations_select ON public.recommendations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR student_id = auth.uid()
    OR public.is_linked_student(student_id)
    OR public.is_coordinator_student(recommendations.student_id)
  );

-- ----------------------------------------------------------------------------
-- PROGRAM EVALUATORS (owner checks via helper)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS program_evaluators_select ON public.program_evaluators;
CREATE POLICY program_evaluators_select ON public.program_evaluators
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR public.is_program_owner(program_evaluators.program_id)
  );

DROP POLICY IF EXISTS program_evaluators_write ON public.program_evaluators;
CREATE POLICY program_evaluators_write ON public.program_evaluators
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_program_owner(program_evaluators.program_id))
  WITH CHECK (public.is_admin() OR public.is_program_owner(program_evaluators.program_id));
