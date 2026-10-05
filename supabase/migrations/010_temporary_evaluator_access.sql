-- Apply AFTER 009. Forward-only cutover; never rerun 005 on production.
BEGIN;
CREATE SCHEMA IF NOT EXISTS evaluator_private;
REVOKE ALL ON SCHEMA evaluator_private FROM PUBLIC, anon, authenticated;

CREATE TABLE evaluator_private.invitations (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  evaluator_name text NOT NULL,
  evaluator_email text NOT NULL,
  organisation text NOT NULL DEFAULT '',
  evaluator_title text NOT NULL DEFAULT '',
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaces_id uuid REFERENCES evaluator_private.invitations(id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours 1 second')
);
CREATE TABLE evaluator_private.sessions (
  id uuid PRIMARY KEY,
  invitation_id uuid NOT NULL UNIQUE REFERENCES evaluator_private.invitations(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE evaluator_private.sheets (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  invitation_id uuid NOT NULL REFERENCES evaluator_private.invitations(id),
  scores jsonb NOT NULL DEFAULT '{}',
  feedback text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','SUBMITTED','CHANGES_REQUESTED','APPROVED','RELEASED')),
  version integer NOT NULL DEFAULT 1,
  current_revision_id uuid,
  released_revision_id uuid,
  change_request text NOT NULL DEFAULT '',
  excluded_reason text,
  UNIQUE (session_id, student_id)
);
CREATE TABLE evaluator_private.revisions (
  id uuid PRIMARY KEY,
  sheet_id uuid NOT NULL REFERENCES evaluator_private.sheets(id),
  invitation_id uuid NOT NULL REFERENCES evaluator_private.invitations(id),
  evaluator_snapshot jsonb NOT NULL,
  scores jsonb NOT NULL,
  feedback text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE evaluator_private.sheets
  ADD FOREIGN KEY (current_revision_id) REFERENCES evaluator_private.revisions(id),
  ADD FOREIGN KEY (released_revision_id) REFERENCES evaluator_private.revisions(id);
CREATE TABLE evaluator_private.reviews (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES evaluator_private.revisions(id),
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  decision text NOT NULL CHECK (decision IN ('APPROVED','CHANGES_REQUESTED')),
  internal_note text NOT NULL DEFAULT '',
  evaluator_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id)
);
CREATE TABLE evaluator_private.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE evaluator_private.notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id),
  event_key text NOT NULL,
  message text NOT NULL,
  destination text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (recipient_id,event_key)
);
CREATE TABLE evaluator_private.mail_outbox (
  id uuid PRIMARY KEY REFERENCES evaluator_private.notifications(id),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz,
  last_error text
);
CREATE INDEX sheets_session_idx ON evaluator_private.sheets(session_id);
CREATE INDEX invitations_expiry_idx ON evaluator_private.invitations(expires_at);

-- Public signup cannot choose administrative or retired staff privileges.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  requested text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'requested_role',''), 'student');
  display_name text;
  institute_name text;
  birth_date date;
  phone_number text;
  referee_name text;
BEGIN
  IF requested NOT IN ('student','parent') THEN
    RAISE EXCEPTION 'This account type requires a DI invitation.';
  END IF;

  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1));
  institute_name := NULLIF(NEW.raw_user_meta_data->>'institute','');
  phone_number := NULLIF(NEW.raw_user_meta_data->>'phone','');
  referee_name := NULLIF(NEW.raw_user_meta_data->>'referee','');
  BEGIN
    birth_date := NULLIF(NEW.raw_user_meta_data->>'dob','')::date;
  EXCEPTION WHEN OTHERS THEN
    birth_date := NULL;
  END;

  -- Preserve the seed-placeholder adoption behavior from migrations 007–009
  -- while refusing to grant a new role through untrusted auth metadata.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email=NEW.email AND id<>NEW.id) THEN
    UPDATE public.profiles
    SET id=NEW.id,
        full_name=CASE WHEN full_name IS NULL OR full_name IN ('','Placeholder') THEN display_name ELSE full_name END,
        -- Preserve explicitly provisioned end-user/admin roles, but never
        -- carry a historical coordinator/evaluator role into a new Auth user.
        -- A retired-only placeholder is converted to the requested student or
        -- parent account; it cannot self-provision staff privileges.
        roles=CASE
          WHEN roles && ARRAY['admin']::text[] THEN ARRAY['admin']::text[]
          WHEN roles && ARRAY['student']::text[] AND roles && ARRAY['parent']::text[] THEN ARRAY['student','parent']::text[]
          WHEN roles && ARRAY['student']::text[] THEN ARRAY['student']::text[]
          WHEN roles && ARRAY['parent']::text[] THEN ARRAY['parent']::text[]
          ELSE ARRAY[requested]::text[]
        END,
        active_role=CASE
          WHEN active_role IN ('admin','student','parent') THEN active_role
          ELSE requested
        END,
        institute=COALESCE(institute,institute_name),
        dob=COALESCE(dob,birth_date),
        phone=COALESCE(phone,phone_number),
        referee=COALESCE(referee,referee_name),
        updated_at=clock_timestamp()
    WHERE email=NEW.email;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles(id,email,full_name,status,roles,active_role,institute,dob,phone,referee)
  VALUES (NEW.id,NEW.email,display_name,'PendingReview',ARRAY[requested],requested,
    institute_name,birth_date,phone_number,referee_name)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

-- Keep historical profile rows; retire account-role grants rather than identities.
CREATE OR REPLACE FUNCTION public.has_role(r text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r NOT IN ('coordinator','evaluator') AND EXISTS
 (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='Approved' AND r=ANY(p.roles));
$$;

-- Keep the existing audited role-correction RPC, but close its retired-role
-- backdoor as well. Historical rows may retain coordinator/evaluator labels;
-- no new account can receive either role after this migration.
CREATE OR REPLACE FUNCTION public.set_profile_roles(
  p_profile_id uuid,
  p_roles text[],
  p_active_role text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  active text := COALESCE(NULLIF(p_active_role,''), p_roles[1]);
  role_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins may change roles.'; END IF;
  IF p_roles IS NULL OR array_length(p_roles,1) IS NULL THEN RAISE EXCEPTION 'Roles must be a non-empty array.'; END IF;
  FOREACH role_name IN ARRAY p_roles LOOP
    IF role_name NOT IN ('student','parent','admin') THEN
      RAISE EXCEPTION 'This role is retired; use a temporary evaluator link.';
    END IF;
  END LOOP;
  IF active IS NULL OR NOT (active=ANY(p_roles)) THEN
    RAISE EXCEPTION 'Active role must be one of the assigned roles.';
  END IF;
  UPDATE public.profiles SET roles=p_roles,active_role=active,updated_at=clock_timestamp() WHERE id=p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile % not found.',p_profile_id; END IF;
  INSERT INTO public.audit_log(actor_id,action,entity,entity_id,meta)
  VALUES (auth.uid(),'user.roles_changed','profile',p_profile_id::text,jsonb_build_object('roles',p_roles,'active_role',active));
  RETURN active;
END $$;
REVOKE ALL ON FUNCTION public.set_profile_roles(uuid,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_roles(uuid,text[],text) TO authenticated;

-- Old ownership helpers must not leave retired accounts with access.
CREATE OR REPLACE FUNCTION public.is_program_owner(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_admin(); $$;
CREATE OR REPLACE FUNCTION public.is_program_evaluator(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;
CREATE OR REPLACE FUNCTION public.is_session_evaluator(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;
CREATE OR REPLACE FUNCTION public.is_coordinator_student(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;
CREATE OR REPLACE FUNCTION public.is_my_evaluee(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;

-- Remove the last coordinator/evaluator ownership paths from the legacy RLS
-- model.  Historical profile rows may retain those labels for auditability,
-- but they must not retain staff access through a row owner or assignment.
-- The replacement policies below are intentionally admin-only for staff
-- operations; students and parents keep only their own/linked read paths.
CREATE OR REPLACE FUNCTION public.is_program_browseable(pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = pid
      AND (p.status IN ('Published', 'InProgress', 'Approved')
           OR public.is_admin()
           OR EXISTS (
             SELECT 1 FROM public.registrations r
             WHERE r.program_id = p.id AND r.student_id = auth.uid()
           ))
  );
$$;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'programs', 'sessions', 'registrations', 'recommendations',
        'announcements', 'program_evaluators'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- PROFILES: legacy roster/evaluee policies are deliberately not recreated.
DROP POLICY IF EXISTS profiles_select_coordinator_roster ON public.profiles;
DROP POLICY IF EXISTS profiles_select_evaluator_students ON public.profiles;

-- PROGRAMS: catalogue/registration visibility remains; only admins can
-- create, edit, delete, or otherwise manage program records.
CREATE POLICY programs_select_anon ON public.programs
  FOR SELECT TO anon USING (status IN ('Published', 'InProgress'));
CREATE POLICY programs_select_auth ON public.programs
  FOR SELECT TO authenticated
  USING (
    status IN ('Published', 'InProgress', 'Approved')
    OR public.is_admin()
    OR public.is_program_registered(programs.id)
  );
CREATE POLICY programs_admin_insert ON public.programs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY programs_admin_update ON public.programs
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY programs_admin_delete ON public.programs
  FOR DELETE TO authenticated USING (public.is_admin());

-- SESSIONS: visible with the parent catalogue/registration; admin-only writes.
CREATE POLICY sessions_select_anon ON public.sessions
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.programs p
    WHERE p.id = sessions.program_id AND p.status IN ('Published', 'InProgress')
  ));
CREATE POLICY sessions_select_auth ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.is_program_browseable(sessions.program_id)
    OR public.is_session_registered(sessions.id)
    OR public.is_admin()
  );
CREATE POLICY sessions_admin_all ON public.sessions
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- REGISTRATIONS: only the student, linked parent, or admin can inspect them;
-- students can still cancel a pending registration.
CREATE POLICY registrations_select ON public.registrations
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.is_linked_student(student_id)
    OR public.is_admin()
  );
CREATE POLICY registrations_insert ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (student_id = auth.uid()
        AND status = 'Pending'
        AND evaluation_state = 'NotStarted')
  );
CREATE POLICY registrations_update ON public.registrations
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR student_id = auth.uid())
  WITH CHECK (
    public.is_admin()
    OR (student_id = auth.uid() AND status = 'Cancelled')
  );
CREATE POLICY registrations_delete ON public.registrations
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (student_id = auth.uid() AND status = 'Pending'));

-- RECOMMENDATIONS: human recommendations remain private to the student,
-- linked parent, and DI admins.  There is no coordinator read path.
CREATE POLICY recommendations_select ON public.recommendations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR student_id = auth.uid()
    OR public.is_linked_student(student_id)
  );
CREATE POLICY recommendations_admin_write ON public.recommendations
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY recommendations_student_progress ON public.recommendations
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND status IN ('New', 'Viewed', 'Completed'));

-- ANNOUNCEMENTS: only admins can stage or edit content; authenticated users
-- see published content only.
CREATE POLICY announcements_select_anon ON public.announcements
  FOR SELECT TO anon USING (status = 'Published');
CREATE POLICY announcements_select_auth ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'Published' OR public.is_admin());
CREATE POLICY announcements_admin_insert ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY announcements_admin_update ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY announcements_admin_delete ON public.announcements
  FOR DELETE TO authenticated USING (public.is_admin());

-- Legacy assignment rows are retained for historical records but are never
-- a source of authenticated staff access.  The Java service uses its private
-- schema and the explicit elevateme_access policies added below.
CREATE POLICY program_evaluators_admin_select ON public.program_evaluators
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY program_evaluators_admin_write ON public.program_evaluators
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- No alternate direct submission/release path may bypass revision review.
REVOKE EXECUTE ON FUNCTION public.release_evaluations(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_evaluation(uuid) FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.evaluations,public.evaluation_scores,public.program_evaluators FROM anon,authenticated;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('evaluations','evaluation_scores') LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY evaluations_admin_read ON public.evaluations FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY scores_admin_read ON public.evaluation_scores FOR SELECT TO authenticated USING(public.is_admin());

-- Owner-run, security-barrier projections deliberately filter using the caller's JWT.
-- No identity/internal columns are present, even when a client requests '*'.
CREATE VIEW public.published_evaluations WITH (security_barrier=true) AS
 SELECT e.id,e.slug,e.student_id,e.program_id,e.session_id,e.state,e.released,e.released_at,e.remarks,e.special_recognition,e.created_at,e.updated_at,
 p.title AS program_title
 FROM public.evaluations e JOIN public.programs p ON p.id=e.program_id
 WHERE e.released AND EXISTS (SELECT 1 FROM public.profiles me WHERE me.id=auth.uid() AND me.status='Approved')
 AND EXISTS (SELECT 1 FROM public.profiles me WHERE me.id=auth.uid() AND me.roles && ARRAY['student','parent','admin']::text[])
 AND (e.student_id=auth.uid() OR public.is_linked_student(e.student_id) OR public.is_admin());
CREATE VIEW public.published_evaluation_scores WITH (security_barrier=true) AS
 SELECT s.evaluation_id,s.criterion_key,s.score FROM public.evaluation_scores s
 JOIN public.published_evaluations e ON e.id=s.evaluation_id;
REVOKE ALL ON public.published_evaluations,public.published_evaluation_scores FROM PUBLIC,anon;
GRANT SELECT ON public.published_evaluations,public.published_evaluation_scores TO authenticated;

-- Dedicated Java runtime. This is a NOLOGIN group role; create a separate
-- LOGIN role with a secret password outside source control, then grant it
-- membership in elevateme_access before starting the Java service.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='elevateme_access') THEN CREATE ROLE elevateme_access NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public,evaluator_private TO elevateme_access;
GRANT SELECT ON public.profiles,public.programs,public.sessions,public.registrations TO elevateme_access;
GRANT SELECT,INSERT,UPDATE ON public.evaluations,public.evaluation_scores TO elevateme_access;
CREATE POLICY access_profiles ON public.profiles FOR SELECT TO elevateme_access USING(true);
CREATE POLICY access_programs ON public.programs FOR SELECT TO elevateme_access USING(true);
CREATE POLICY access_sessions ON public.sessions FOR SELECT TO elevateme_access USING(true);
CREATE POLICY access_registrations ON public.registrations FOR SELECT TO elevateme_access USING(true);
CREATE POLICY access_evaluations ON public.evaluations FOR ALL TO elevateme_access USING(true) WITH CHECK(true);
CREATE POLICY access_scores ON public.evaluation_scores FOR ALL TO elevateme_access USING(true) WITH CHECK(true);
GRANT SELECT ON evaluator_private.invitations,evaluator_private.sessions,evaluator_private.sheets,
  evaluator_private.revisions,evaluator_private.reviews,evaluator_private.notifications,
  evaluator_private.mail_outbox,evaluator_private.audit TO elevateme_access;
GRANT INSERT,UPDATE ON evaluator_private.invitations,evaluator_private.sessions,
  evaluator_private.sheets,evaluator_private.notifications,evaluator_private.mail_outbox TO elevateme_access;
GRANT INSERT ON evaluator_private.revisions,evaluator_private.reviews,evaluator_private.audit TO elevateme_access;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA evaluator_private TO elevateme_access;
COMMIT;
