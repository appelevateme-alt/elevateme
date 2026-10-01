-- ============================================================================
-- ElevateMe Flyway V1 — core_clean
-- Private canonical schema. Postgres 14 compatible.
--
-- Legacy reference (read-only, do not modify):
--   supabase/migrations/001_core.sql  (institutes, profiles, parent_links)
--   supabase/migrations/004_logic.sql (elevate_me_seq START 131, adopt-by-email)
-- Preserves: institute verified flag, profile no-FK-to-auth.users rule,
-- EM-##### sequence starting at 131 (seed used EM-00124..EM-00130), status vocab.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS app;

-- Least-privilege roles exist as placeholders only. No passwords here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateme_owner') THEN
    CREATE ROLE elevateme_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateme_app') THEN
    CREATE ROLE elevateme_app NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO elevateme_app;

-- ----------------------------------------------------------------------------
-- Shared maintenance: updated_at + optimistic row_version bump.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at  := now();
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Institutes (mirrors public.institutes: slug + name unique, verified flag).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.institutes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        UNIQUE NOT NULL,
  name        text        UNIQUE NOT NULL,
  verified    boolean     NOT NULL DEFAULT false,
  row_version integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);
ALTER TABLE app.institutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.institutes FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_touch_institutes ON app.institutes;
CREATE TRIGGER trg_touch_institutes
  BEFORE UPDATE ON app.institutes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Profiles: one row per person. id is the canonical PK (UUID).
--   supabase_subject: opaque link to legacy auth.users.id. UNIQUE, NULLABLE,
--     deliberately NO FOREIGN KEY to auth.users (legacy 001 comment: seed
--     placeholder rows must exist before signup; adopt-by-email in Java).
--   elevate_me_id: 'EM-' + 5 zero-padded digits, UNIQUE, students only,
--     transactional sequence, never reused (gaps allowed, reuse forbidden).
--   role/status preserve legacy vocabularies so legacy rows map 1:1:
--     role:   student | parent | coordinator | evaluator | admin
--     status: Approved | PendingReview | Rejected | Suspended | ChangesRequested
--   parent-view preference: which child a parent sees by default.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.profiles (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_subject         uuid        UNIQUE,
  email                    text        UNIQUE NOT NULL,
  full_name                text        NOT NULL DEFAULT '',
  elevate_me_id            text        UNIQUE,
  institute_id             uuid        NULL REFERENCES app.institutes (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  role                     text        NOT NULL
    CHECK (role IN ('student', 'parent', 'coordinator', 'evaluator', 'admin')),
  status                   text        NOT NULL DEFAULT 'PendingReview'
    CHECK (status IN ('Approved', 'PendingReview', 'Rejected', 'Suspended', 'ChangesRequested')),
  phone                    text        NULL,
  avatar_url               text        NULL,
  -- Parent-view preference: 'ALL' (default roster) or 'SINGLE' pinned child.
  parent_view_mode         text        NOT NULL DEFAULT 'ALL'
    CHECK (parent_view_mode IN ('ALL', 'SINGLE')),
  parent_default_student_id uuid       NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version              integer     NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  archived_at              timestamptz NULL,
  CHECK (elevate_me_id IS NULL OR elevate_me_id ~ '^EM-[0-9]{5}$'),
  CHECK (role <> 'student' OR parent_default_student_id IS NULL),
  CHECK (parent_default_student_id IS NULL OR parent_default_student_id <> id)
);
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.profiles FROM PUBLIC;

CREATE INDEX IF NOT EXISTS profiles_institute_id_idx ON app.profiles (institute_id);
CREATE INDEX IF NOT EXISTS profiles_status_idx       ON app.profiles (status);
CREATE INDEX IF NOT EXISTS profiles_role_status_idx  ON app.profiles (role, status);
CREATE INDEX IF NOT EXISTS profiles_elevate_me_id_idx ON app.profiles (elevate_me_id);

DROP TRIGGER IF EXISTS trg_touch_profiles ON app.profiles;
CREATE TRIGGER trg_touch_profiles
  BEFORE UPDATE ON app.profiles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- ElevateMe ID sequence: transactional, never reused.
-- Continues legacy numbering (seed used EM-00124..EM-00130 -> START 131).
-- nextval() is consumed ONLY when an ID is actually assigned; a rolled-back
-- transaction may leave a gap (acceptable) but an ID is never re-issued
-- (UNIQUE + monotonic sequence guarantees it).
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS app.elevate_me_seq START 131;

CREATE OR REPLACE FUNCTION app.assign_elevate_me_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT path: brand-new approved student without an ID.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'student' AND NEW.elevate_me_id IS NULL
       AND NEW.status = 'Approved' THEN
      NEW.elevate_me_id := 'EM-' || lpad(nextval('app.elevate_me_seq')::text, 5, '0');
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE path: transition into Approved (mirrors legacy 004 trigger).
  IF (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status = 'Approved'
     AND NEW.elevate_me_id IS NULL
     AND NEW.role = 'student' THEN
    NEW.elevate_me_id := 'EM-' || lpad(nextval('app.elevate_me_seq')::text, 5, '0');
  END IF;
  -- Once assigned, it is immutable.
  IF OLD.elevate_me_id IS NOT NULL
     AND NEW.elevate_me_id IS DISTINCT FROM OLD.elevate_me_id THEN
    RAISE EXCEPTION 'elevate_me_id is immutable once assigned (profile %).', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_elevate_me_id ON app.profiles;
CREATE TRIGGER trg_assign_elevate_me_id
  BEFORE INSERT OR UPDATE ON app.profiles
  FOR EACH ROW EXECUTE FUNCTION app.assign_elevate_me_id();

-- ----------------------------------------------------------------------------
-- Institute memberships: audited join of profiles <-> institutes.
-- Replaces the legacy denormalised profiles.institute text + institute_id.
-- One active row per (institute, profile); history via archived_at, never DELETE.
-- Every INSERT/UPDATE is mirrored to app.audit_events by Java (V4 table);
-- created_by records the actor at write time so the audit trail is complete
-- even before V4 is applied.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.institute_memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid        NOT NULL REFERENCES app.institutes (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  profile_id   uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  role_in_institute text   NOT NULL DEFAULT 'member'
    CHECK (role_in_institute IN ('member', 'manager', 'owner')),
  created_by   uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version  integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz NULL,
  CHECK (created_by IS NULL OR created_by <> profile_id OR role_in_institute = 'member')
);
ALTER TABLE app.institute_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.institute_memberships FROM PUBLIC;

-- Active membership is unique; archived rows free the slot for re-join.
CREATE UNIQUE INDEX IF NOT EXISTS institute_memberships_active_unique
  ON app.institute_memberships (institute_id, profile_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS institute_memberships_profile_idx
  ON app.institute_memberships (profile_id);

DROP TRIGGER IF EXISTS trg_touch_institute_memberships ON app.institute_memberships;
CREATE TRIGGER trg_touch_institute_memberships
  BEFORE UPDATE ON app.institute_memberships
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Runtime grants (least privilege: DML only, no DDL).
GRANT USAGE, SELECT ON SEQUENCE app.elevate_me_seq TO elevateme_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.institutes, app.profiles, app.institute_memberships TO elevateme_app;

-- ----------------------------------------------------------------------------
-- Phase 1b patch (2026-09-30, idempotent, does not break existing rows):
-- private photo flow stores the Supabase Storage object path in
-- app.profiles.photo_key (e.g. profiles/{profileId}/{uuid}.jpg). The legacy
-- app.profiles.avatar_url column is retained for backward compat but MUST NOT
-- hold permanent public URLs for new uploads — GET /me returns a short-lived
-- signed read URL (300s) derived from photo_key.
-- Parent-view preference is already modelled by parent_view_mode ('ALL' default
-- roster vs 'SINGLE' pinned child) + parent_default_student_id; no new column
-- needed (see CHECKs on app.profiles above).
-- ----------------------------------------------------------------------------
ALTER TABLE app.profiles ADD COLUMN IF NOT EXISTS photo_key text NULL;
