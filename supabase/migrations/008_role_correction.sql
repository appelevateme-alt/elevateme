-- ============================================================================
-- ElevateMe migration 008 — admin role correction
-- Idempotent, safe to re-run. Postgres 14 compatible.
--
-- set_profile_roles() lets an admin fix a wrongly-assigned role (e.g. an
-- admin who signed up under the default student role). decide_profile()
-- intentionally only moves status; roles/active_role are protected columns
-- that otherwise have no audited write path. Every call is audited.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_profile_roles(
  p_profile_id  uuid,
  p_roles       text[],
  p_active_role text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active text;
  v_r      text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins may change roles.';
  END IF;
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    RAISE EXCEPTION 'Roles must be a non-empty array.';
  END IF;
  FOREACH v_r IN ARRAY p_roles LOOP
    IF v_r NOT IN ('student', 'parent', 'coordinator', 'evaluator', 'admin') THEN
      RAISE EXCEPTION 'Invalid role % (want student|parent|coordinator|evaluator|admin).', v_r;
    END IF;
  END LOOP;
  v_active := COALESCE(NULLIF(p_active_role, ''), p_roles[1]);
  IF NOT (v_active = ANY (p_roles)) THEN
    RAISE EXCEPTION 'Active role % must be one of the assigned roles.', v_active;
  END IF;

  UPDATE public.profiles
  SET roles = p_roles, active_role = v_active, updated_at = now()
  WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found.', p_profile_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'user.roles_changed', 'profile', p_profile_id::text,
          jsonb_build_object('roles', p_roles, 'active_role', v_active));

  RETURN v_active;
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_roles(uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_roles(uuid, text[], text) TO authenticated;
