-- Forward-only audit fix. Apply after 010; never replay historical migrations.
BEGIN;

-- Existing score-guard triggers call auth.uid(), even for trusted JDBC writes.
-- This grants only namespace/function access, not access to auth tables.
GRANT USAGE ON SCHEMA auth TO elevateme_access;
GRANT EXECUTE ON FUNCTION auth.uid() TO elevateme_access;

-- Report release reads linked recipients under the restricted Java role.
GRANT SELECT ON public.parent_links TO elevateme_access;
CREATE POLICY access_parent_links ON public.parent_links
  FOR SELECT TO elevateme_access USING (true);

-- A parent may request/revoke access, but cannot approve their own request.
-- Consent must come from the student whose records are exposed, or DI.
DROP POLICY IF EXISTS parent_links_insert_parties ON public.parent_links;
CREATE POLICY parent_links_insert_parties ON public.parent_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR student_id = auth.uid()
    OR (parent_id = auth.uid() AND status = 'Pending')
  );
DROP POLICY IF EXISTS parent_links_update_parties ON public.parent_links;
CREATE POLICY parent_links_update_parties ON public.parent_links
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR student_id = auth.uid() OR parent_id = auth.uid())
  WITH CHECK (
    public.is_admin() OR student_id = auth.uid()
    OR (parent_id = auth.uid() AND status IN ('Pending','Revoked'))
  );

-- Consent cannot be transferred to a different student or parent via UPDATE.
CREATE OR REPLACE FUNCTION public.guard_parent_link_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND (NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    RAISE EXCEPTION 'Link participants cannot be changed.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_parent_link_identity BEFORE UPDATE ON public.parent_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_parent_link_identity();
COMMIT;
