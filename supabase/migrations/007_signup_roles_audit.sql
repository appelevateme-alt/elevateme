-- ============================================================================
-- ElevateMe migration 007 — signup roles + profile decisions audit
-- Idempotent, safe to re-run. Postgres 14 compatible.
--
-- 007-A: handle_new_user() now
--   * accepts `requested_role` as a role source for NON-admin signups
--     (the app sends requested_role; previously only `roles[]`/`role` were
--     read, so every non-admin signup got roles '{}' + NULL active_role),
--   * persists signup enrichment (institute, dob, phone, referee) from
--     user_metadata on insert and on seed-placeholder adoption.
-- 007-B: new decide_profile(p_profile_id, p_decision, p_note) RPC so user
--   approvals/rejections go through an audited, transition-checked path
--   like programs/registrations/releases (the UI previously did direct
--   updates with no audit row).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 007-A: role + enrichment aware signup trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name      text;
  v_roles     text[];
  v_institute text;
  v_dob       date;
  v_phone     text;
  v_referee   text;
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
  ELSIF NULLIF(NEW.raw_user_meta_data ->> 'requested_role', '') IS NOT NULL
        AND (NEW.raw_user_meta_data ->> 'requested_role') <> 'admin' THEN
    -- The app's signup form sends requested_role; honour it for non-admins
    -- (the 'admin' value is handled by the bootstrap branch below).
    v_roles := ARRAY[NEW.raw_user_meta_data ->> 'requested_role'];
  ELSE
    v_roles := '{}';
  END IF;

  v_institute := NULLIF(NEW.raw_user_meta_data ->> 'institute', '');
  BEGIN
    v_dob := NULLIF(NEW.raw_user_meta_data ->> 'dob', '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;
  v_phone   := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');
  v_referee := NULLIF(NEW.raw_user_meta_data ->> 'referee', '');

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
        institute  = COALESCE(institute, v_institute),
        dob        = COALESCE(dob, v_dob),
        phone      = COALESCE(phone, v_phone),
        referee    = COALESCE(referee, v_referee),
        updated_at = now()
    WHERE email = NEW.email;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles
    (id, email, full_name, status, roles, active_role, institute, dob, phone, referee)
  VALUES
    (NEW.id, NEW.email, v_name, 'PendingReview', v_roles, v_roles[1],
     v_institute, v_dob, v_phone, v_referee)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 007-B: decide_profile(p_profile_id, p_decision, p_note)
-- Admin resolves a PendingReview account. Approved students receive their
-- ElevateMe ID via the existing assign_elevate_me_id trigger. Every call is
-- audited (the UI must use this, not direct updates, for user decisions).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_profile(
  p_profile_id uuid,
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
    RAISE EXCEPTION 'Only admins may decide user accounts.';
  END IF;
  IF p_decision NOT IN ('Approved', 'Rejected', 'ChangesRequested') THEN
    RAISE EXCEPTION 'Invalid decision % (want Approved|Rejected|ChangesRequested).', p_decision;
  END IF;

  SELECT status INTO v_current FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found.', p_profile_id;
  END IF;
  IF v_current NOT IN ('PendingReview', 'ChangesRequested') THEN
    RAISE EXCEPTION 'Only PendingReview|ChangesRequested accounts can be decided (current %).', v_current;
  END IF;

  UPDATE public.profiles
  SET status = p_decision, updated_at = now()
  WHERE id = p_profile_id;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'user.' || lower(p_decision), 'profile', p_profile_id::text,
          jsonb_build_object('from', v_current, 'to', p_decision, 'note', p_note));

  RETURN p_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_profile(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_profile(uuid, text, text) TO authenticated;
