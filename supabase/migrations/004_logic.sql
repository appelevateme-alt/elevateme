-- ============================================================================
-- ElevateMe migration 004_logic
-- Run FOURTH in the Supabase SQL editor (after 003_rls.sql).
-- Postgres 14 compatible.
--
-- Contents:
--   A. handle_new_user()      -- auto-create profiles row on auth.users insert
--   B. elevate_me_id sequence + trigger (format EM-00000, students only)
--   C. programs.registered counter maintenance
--   D. Column / state guards (profiles protected cols, locked sheets, audit)
--   E. SECURITY DEFINER RPCs (each validates state + writes audit_log):
--        approve_program, release_evaluations, confirm_registration,
--        submit_evaluation
-- ============================================================================

-- ============================================================================
-- A. Auto-create a profiles row whenever someone signs up.
-- Email confirmation is ON, so this fires at sign-up; the row starts as
-- PendingReview and can sign in but sees the "pending approval" screen until
-- an admin approves it (see supabase/ADMIN_BOOTSTRAP.md).
-- If seed.sql already created a placeholder row with the same email, adopt it
-- by re-keying its PK to the real auth.users id (FKs are ON UPDATE CASCADE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  text;
  v_roles text[];
BEGIN
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'fullName', ''),
    split_part(NEW.email, '@', 1)
  );

  IF NEW.raw_user_meta_data ? 'roles' THEN
    SELECT COALESCE(array_agg(x), '{}') INTO v_roles
    FROM jsonb_array_elements_text(NEW.raw_user_meta_data -> 'roles') AS x;
  ELSIF NULLIF(NEW.raw_user_meta_data ->> 'role', '') IS NOT NULL THEN
    v_roles := ARRAY[NEW.raw_user_meta_data ->> 'role'];
  ELSE
    v_roles := '{}';
  END IF;

  -- TEMPORARY-BOOTSTRAP (REMOVE WHEN TOLD): administrator self-registration
  -- activates immediately so the first admins can create their accounts.
  -- Deleting this block closes the backdoor; existing admins are unaffected.
  IF NULLIF(NEW.raw_user_meta_data ->> 'requested_role', '') = 'admin' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND id <> NEW.id) THEN
      UPDATE public.profiles
      SET id          = NEW.id,
          full_name   = CASE WHEN full_name IS NULL OR full_name IN ('', 'Placeholder')
                             THEN v_name ELSE full_name END,
          status      = 'Approved',
          roles       = ARRAY['admin'],
          active_role = 'admin',
          updated_at  = now()
      WHERE email = NEW.email;
    ELSE
      INSERT INTO public.profiles (id, email, full_name, status, roles, active_role)
      VALUES (NEW.id, NEW.email, v_name, 'Approved', ARRAY['admin'], 'admin')
      ON CONFLICT (id) DO UPDATE
        SET status = 'Approved', roles = ARRAY['admin'],
            active_role = 'admin', updated_at = now();
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email AND id <> NEW.id) THEN
    UPDATE public.profiles
    SET id         = NEW.id,
        full_name  = CASE WHEN full_name IS NULL OR full_name IN ('', 'Placeholder')
                          THEN v_name ELSE full_name END,
        roles      = CASE WHEN roles = '{}' AND v_roles <> '{}' THEN v_roles ELSE roles END,
        active_role = COALESCE(active_role, v_roles[1]),
        updated_at = now()
    WHERE email = NEW.email;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, status, roles, active_role)
  VALUES (NEW.id, NEW.email, v_name, 'PendingReview', v_roles, v_roles[1])
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- B. ElevateMe ID: EM- + 5 zero-padded digits (mock format EM-00124).
-- Assigned once, on the transition into Approved, for students only.
-- Seed uses EM-00124..EM-00130, so the sequence starts at 131.
-- NEVER reuse numbers: nextval() is only consumed when an ID is assigned.
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.elevate_me_seq START 131;

CREATE OR REPLACE FUNCTION public.assign_elevate_me_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status = 'Approved'
     AND NEW.elevate_me_id IS NULL
     AND 'student' = ANY (COALESCE(NEW.roles, '{}')) THEN
    NEW.elevate_me_id := 'EM-' || lpad(nextval('public.elevate_me_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_elevate_me_id ON public.profiles;
CREATE TRIGGER trg_assign_elevate_me_id
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_elevate_me_id();

-- ============================================================================
-- C. programs.registered counter cache = COUNT of Confirmed registrations.
-- NOTE: seed.sql restores the mock display numbers (64/0/18/41) AFTER inserting
-- registrations; the next registration write recomputes the real count.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_program_registered(p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.programs p
  SET registered = (
        SELECT count(*) FROM public.registrations r
        WHERE r.program_id = p_program_id AND r.status = 'Confirmed'
      ),
      updated_at = now()
  WHERE p.id = p_program_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_program_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_program_registered(NEW.program_id);
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_program_registered(OLD.program_id);
    RETURN NULL;
  ELSE
    IF NEW.program_id IS DISTINCT FROM OLD.program_id THEN
      PERFORM public.refresh_program_registered(OLD.program_id);
    END IF;
    PERFORM public.refresh_program_registered(NEW.program_id);
    RETURN NULL;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_program_registered ON public.registrations;
CREATE TRIGGER trg_sync_program_registered
  AFTER INSERT OR UPDATE OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_program_registered();

-- ============================================================================
-- D. Guards
-- ----------------------------------------------------------------------------
-- D1. Only admins may change profiles.status / roles / elevate_me_id.
-- (RLS handles row access; this handles columns, which RLS cannot.)
-- D2. Scores are editable only while the parent sheet is Draft (admins bypass).
-- D3. audit_log is append-only for every role.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Direct-DB writes (SQL editor / seed / signup trigger run with no JWT, so
  -- auth.uid() IS NULL) must not be blocked: RLS already denies unprivileged
  -- app roles before triggers ever fire, so this bypass only affects trusted
  -- server-side contexts.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (OLD.status IS DISTINCT FROM NEW.status
      OR OLD.roles IS DISTINCT FROM NEW.roles
      OR OLD.elevate_me_id IS DISTINCT FROM NEW.elevate_me_id) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admins may change status, roles or elevate_me_id (profile %).', OLD.email;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_columns();

CREATE OR REPLACE FUNCTION public.guard_scores_editable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_eval  uuid;
BEGIN
  -- Same NULL-uid bypass as above: seed.sql inserts e-1's scores (parent is
  -- already Locked) via the SQL editor, which carries no JWT.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  v_eval := COALESCE(NEW.evaluation_id, OLD.evaluation_id);
  SELECT state INTO v_state FROM public.evaluations WHERE id = v_eval;
  IF v_state IS DISTINCT FROM 'Draft' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Scores are locked once the sheet leaves Draft (evaluation %).', v_eval;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_scores_editable ON public.evaluation_scores;
CREATE TRIGGER trg_guard_scores_editable
  BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_scores_editable();

CREATE OR REPLACE FUNCTION public.guard_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_audit_immutable ON public.audit_log;
CREATE TRIGGER trg_guard_audit_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_immutable();

-- ============================================================================
-- E. SECURITY DEFINER RPCs. All run as the table owner (bypass RLS), enforce
-- their own permission + state checks, and write an audit_log row.
-- Granted to `authenticated` only (revoked from PUBLIC/anon).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- approve_program(p_program_id, p_decision, p_note)
-- Admin publishes the approval outcome. Allowed transitions:
--   Submitted|UnderReview -> Approved | Rejected | ChangesRequested
--   Approved              -> Published
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_program(
  p_program_id uuid,
  p_decision   text,
  p_note       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may approve programs.';
  END IF;
  IF p_decision NOT IN ('Approved', 'Rejected', 'ChangesRequested', 'Published') THEN
    RAISE EXCEPTION 'Invalid decision % (want Approved|Rejected|ChangesRequested|Published).', p_decision;
  END IF;

  SELECT status INTO v_current FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program % not found.', p_program_id;
  END IF;

  IF v_current IN ('Submitted', 'UnderReview')
     AND p_decision IN ('Approved', 'Rejected', 'ChangesRequested') THEN
    NULL; -- ok
  ELSIF v_current = 'Approved' AND p_decision = 'Published' THEN
    NULL; -- ok
  ELSE
    RAISE EXCEPTION 'Cannot move program from % to %.', v_current, p_decision;
  END IF;

  UPDATE public.programs
  SET status = p_decision, updated_at = now()
  WHERE id = p_program_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'program.' || lower(p_decision), 'program', p_program_id::text,
          jsonb_build_object('from', v_current, 'to', p_decision, 'note', p_note));

  RETURN p_decision;
END;
$$;

-- ----------------------------------------------------------------------------
-- release_evaluations(p_session_id)
-- Admin (or the owning coordinator) releases every Submitted sheet in the
-- session: state -> Locked, released = true. Returns the released count.
-- Students/parents can only see sheets once released (003 RLS).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_evaluations(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id uuid;
  v_owner      uuid;
  v_count      integer;
BEGIN
  SELECT s.program_id INTO v_program_id FROM public.sessions s
  WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found.', p_session_id;
  END IF;
  SELECT p.created_by INTO v_owner FROM public.programs p WHERE p.id = v_program_id;

  IF NOT (public.is_admin()
          OR (public.has_role('coordinator') AND v_owner = auth.uid())) THEN
    RAISE EXCEPTION 'Only admins or the owning coordinator may release evaluations.';
  END IF;

  UPDATE public.evaluations e
  SET state = 'Locked', released = true, released_at = now(), updated_at = now()
  WHERE e.session_id = p_session_id AND e.state = 'Submitted';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nothing to release: no Submitted sheets in session %.', p_session_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'evaluation.released', 'session', p_session_id::text,
          jsonb_build_object('program_id', v_program_id, 'count', v_count));

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- confirm_registration(p_registration_id, p_decision)
-- Owning coordinator (or admin) resolves a Pending request. Confirmed
-- decisions take the program row FOR UPDATE and fail when at capacity; the
-- sync_program_registered trigger keeps programs.registered in step.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_registration(
  p_registration_id uuid,
  p_decision        text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg      public.registrations%ROWTYPE;
  v_owner    uuid;
  v_capacity integer;
  v_confirmed integer;
BEGIN
  IF p_decision NOT IN ('Confirmed', 'Waitlisted', 'Rejected', 'Cancelled') THEN
    RAISE EXCEPTION 'Invalid decision % (want Confirmed|Waitlisted|Rejected|Cancelled).', p_decision;
  END IF;

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration % not found.', p_registration_id;
  END IF;
  SELECT p.created_by, p.capacity INTO v_owner, v_capacity
  FROM public.programs p WHERE p.id = v_reg.program_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program for registration % not found.', p_registration_id;
  END IF;

  IF NOT (public.is_admin()
          OR (public.has_role('coordinator') AND v_owner = auth.uid())) THEN
    RAISE EXCEPTION 'Only the owning coordinator or an admin may confirm registrations.';
  END IF;
  IF v_reg.status NOT IN ('Pending', 'Waitlisted') THEN
    RAISE EXCEPTION 'Only Pending|Waitlisted registrations can be decided (current %).', v_reg.status;
  END IF;

  IF p_decision = 'Confirmed' THEN
    SELECT count(*) INTO v_confirmed FROM public.registrations
    WHERE program_id = v_reg.program_id AND status = 'Confirmed';
    IF v_confirmed >= v_capacity THEN
      RAISE EXCEPTION 'Program is at capacity (%/%).', v_confirmed, v_capacity;
    END IF;
  END IF;

  UPDATE public.registrations
  SET status = p_decision, updated_at = now()
  WHERE id = p_registration_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'registration.' || lower(p_decision), 'registration',
          p_registration_id::text,
          jsonb_build_object('from', v_reg.status, 'to', p_decision,
                             'program_id', v_reg.program_id, 'student_id', v_reg.student_id));

  RETURN p_decision;
END;
$$;

-- ----------------------------------------------------------------------------
-- submit_evaluation(p_evaluation_id)
-- The assigned evaluator locks their own Draft (Draft -> Submitted) once at
-- least one criterion score exists. Release (visibility) is a separate step
-- via release_evaluations(). Every call is audited.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_evaluation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval   public.evaluations%ROWTYPE;
  v_scores integer;
BEGIN
  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evaluation % not found.', p_evaluation_id;
  END IF;

  IF NOT (public.is_admin() OR v_eval.evaluator_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the assigned evaluator may submit this sheet.';
  END IF;
  IF v_eval.state IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Only Draft sheets can be submitted (current %).', v_eval.state;
  END IF;

  SELECT count(*) INTO v_scores FROM public.evaluation_scores
  WHERE evaluation_id = p_evaluation_id;
  IF v_scores = 0 THEN
    RAISE EXCEPTION 'Add at least one criterion score before submitting.';
  END IF;

  UPDATE public.evaluations
  SET state = 'Submitted', updated_at = now()
  WHERE id = p_evaluation_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'evaluation.submitted', 'evaluation', p_evaluation_id::text,
          jsonb_build_object('program_id', v_eval.program_id,
                             'session_id', v_eval.session_id,
                             'student_id', v_eval.student_id,
                             'score_count', v_scores));

  RETURN 'Submitted';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_program(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_evaluations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_registration(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_evaluation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_program(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_evaluations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(uuid) TO authenticated;
