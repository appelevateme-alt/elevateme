-- ============================================================================
-- ElevateMe migration 009 — Approved programs visible to authenticated users
-- Idempotent, safe to re-run. Postgres 14 compatible.
--
-- Product decision: once admin approves a program, students see it
-- immediately (no separate publish step). Scope: authenticated users only —
-- the anon/public catalogue still shows Published|InProgress only.
-- ============================================================================

DROP POLICY IF EXISTS programs_select_auth ON public.programs;
CREATE POLICY programs_select_auth ON public.programs
  FOR SELECT TO authenticated
  USING (
    status IN ('Published', 'InProgress', 'Approved')
    OR created_by = auth.uid()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.registrations r
               WHERE r.program_id = programs.id AND r.student_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.program_evaluators pe
               WHERE pe.program_id = programs.id AND pe.evaluator_id = auth.uid())
  );

DROP POLICY IF EXISTS sessions_select_auth ON public.sessions;
CREATE POLICY sessions_select_auth ON public.sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.programs p
            WHERE p.id = sessions.program_id
              AND (p.status IN ('Published', 'InProgress', 'Approved')
                   OR p.created_by = auth.uid()))
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.program_evaluators pe
               WHERE pe.session_id = sessions.id AND pe.evaluator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.registrations r
               WHERE (r.session_id = sessions.id OR r.program_id = sessions.program_id)
                 AND r.student_id = auth.uid())
  );