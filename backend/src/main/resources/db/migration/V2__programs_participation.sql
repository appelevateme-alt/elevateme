-- ============================================================================
-- ElevateMe Flyway V2 — programs & participation
-- Postgres 14 compatible. Depends on V1 (app schema, profiles, institutes).
--
-- Legacy reference (read-only):
--   supabase/migrations/001_core.sql (programs, sessions)
--   supabase/migrations/002_participation.sql (registrations UNIQUE NULL bug)
--   supabase/migrations/004_logic.sql (registered counter, confirm_registration)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Programs: type/subtype/themes, owner, visibility, approval lifecycle.
-- Legacy category/status mapping (for migration tooling, not enforced here):
--   SingleEvent|ContinuousProgramme|SpecialProgramme -> program_type
--   Draft|Submitted|UnderReview|ChangesRequested|Approved|Rejected|Published|
--     InProgress|RegistrationClosed|Completed -> lifecycle (collapsed below)
-- New lifecycle is uppercase and linear with explicit approval metadata.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.programs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        UNIQUE NOT NULL,
  title             text        NOT NULL,
  program_type      text        NOT NULL
    CHECK (program_type IN ('SINGLE_EVENT', 'CONTINUOUS', 'SPECIAL')),
  subtype           text        NULL
    CHECK (subtype IS NULL
      OR subtype IN ('MODEL_UN', 'FRIENDLY_DEBATE', 'COMPETITION', 'SPECIAL', 'WORKSHOP', 'LEAGUE')),
  themes            text[]      NOT NULL DEFAULT '{}',
  institute_id      uuid        NULL REFERENCES app.institutes (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  owner_id          uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  venue             text        NULL,
  capacity          integer     NOT NULL CHECK (capacity > 0),
  registered_count  integer     NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
  visibility        text        NOT NULL DEFAULT 'INTERNAL'
    CHECK (visibility IN ('INTERNAL', 'PUBLIC', 'INVITE_ONLY')),
  lifecycle         text        NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle IN ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED',
                         'APPROVED', 'PUBLISHED', 'COMPLETED', 'ARCHIVED')),
  -- Approval metadata (who decided, when, free-text note).
  approval_decided_by uuid      NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  approval_decided_at timestamptz NULL,
  approval_note     text        NULL,
  description       text        NOT NULL DEFAULT '',
  row_version       integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz NULL,
  CHECK (approval_decided_at IS NULL OR approval_decided_by IS NOT NULL),
  CHECK (lifecycle <> 'ARCHIVED' OR archived_at IS NOT NULL)
);
ALTER TABLE app.programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.programs FROM PUBLIC;

CREATE INDEX IF NOT EXISTS programs_lifecycle_idx   ON app.programs (lifecycle);
CREATE INDEX IF NOT EXISTS programs_owner_id_idx    ON app.programs (owner_id);
CREATE INDEX IF NOT EXISTS programs_institute_idx   ON app.programs (institute_id);
CREATE INDEX IF NOT EXISTS programs_visibility_idx  ON app.programs (visibility);

DROP TRIGGER IF EXISTS trg_touch_programs ON app.programs;
CREATE TRIGGER trg_touch_programs
  BEFORE UPDATE ON app.programs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Sessions: belong to exactly one program. Timestamptz range, committee/topic.
-- IMMUTABLE EVALUATION LINKAGE: once any evaluation/assignment references a
-- session, the session may not be re-parented to another program. Enforced by
-- trigger below (evaluations live in V3, so the check is defensive and uses
-- to_regclass to stay appliable even if V3 has not run yet).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid        NOT NULL REFERENCES app.programs (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  slug        text        UNIQUE NOT NULL,
  title       text        NOT NULL,
  committee   text        NULL,
  topic       text        NULL,
  venue       text        NULL,
  starts_at   timestamptz NULL,
  ends_at     timestamptz NULL,
  row_version integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.sessions FROM PUBLIC;

CREATE INDEX IF NOT EXISTS sessions_program_id_idx ON app.sessions (program_id);
CREATE INDEX IF NOT EXISTS sessions_starts_at_idx  ON app.sessions (starts_at);

DROP TRIGGER IF EXISTS trg_touch_sessions ON app.sessions;
CREATE TRIGGER trg_touch_sessions
  BEFORE UPDATE ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.prevent_session_reparenting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_refs integer := 0;
BEGIN
  IF NEW.program_id = OLD.program_id THEN
    RETURN NEW;
  END IF;
  IF to_regclass('app.evaluation_assignments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM app.evaluation_assignments WHERE session_id = $1'
      INTO v_refs USING OLD.id;
  END IF;
  IF v_refs = 0 AND to_regclass('app.evaluations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM app.evaluations WHERE session_id = $1'
      INTO v_refs USING OLD.id;
  END IF;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'Session % already has evaluation linkage and cannot move programs.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_session_program ON app.sessions;
CREATE TRIGGER trg_lock_session_program
  BEFORE UPDATE OF program_id ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_session_reparenting();

-- ----------------------------------------------------------------------------
-- Registrations: student -> program (+ optional session).
-- Preserves legacy status vocab + allocation + when display columns.
--
-- NULL != NULL BUG FIX (legacy 002 documented that two program-level rows
-- with session_id IS NULL do not conflict under a plain
-- UNIQUE(student,program,session)): replaced by TWO partial unique indexes:
--   (student, program)            WHERE session_id IS NULL
--   (student, program, session)   WHERE session_id IS NOT NULL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.registrations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  program_id   uuid        NOT NULL REFERENCES app.programs (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  session_id   uuid        NULL REFERENCES app.sessions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  allocation   text        NULL,
  status       text        NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Confirmed', 'Waitlisted', 'Rejected', 'Cancelled')),
  confirmed_at timestamptz NULL,
  confirmed_by uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version  integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz NULL,
  CHECK (confirmed_at IS NULL OR status = 'Confirmed'),
  CHECK (session_id IS NULL OR program_id IS NOT NULL)
);
ALTER TABLE app.registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.registrations FROM PUBLIC;

-- Partial unique indexes: the actual dedupe guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_program_level_unique
  ON app.registrations (student_id, program_id)
  WHERE session_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_session_level_unique
  ON app.registrations (student_id, program_id, session_id)
  WHERE session_id IS NOT NULL AND archived_at IS NULL;

-- Spec section 10 — roster lookups.
CREATE INDEX IF NOT EXISTS registrations_session_status_idx
  ON app.registrations (session_id, status);
CREATE INDEX IF NOT EXISTS registrations_program_status_idx
  ON app.registrations (program_id, status);
CREATE INDEX IF NOT EXISTS registrations_student_idx
  ON app.registrations (student_id);

DROP TRIGGER IF EXISTS trg_touch_registrations ON app.registrations;
CREATE TRIGGER trg_touch_registrations
  BEFORE UPDATE ON app.registrations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Capacity: transactional note. Java MUST:
--   BEGIN; SELECT * FROM app.programs WHERE id = ? FOR UPDATE;
--   SELECT count(*) FROM app.registrations WHERE program_id=? AND status='Confirmed';
--   -- fail when count >= capacity, else UPDATE registrations SET status='Confirmed'
--   COMMIT;
-- The trigger below only keeps the counter cache honest (mirrors legacy 004).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.refresh_program_registered_count(p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  UPDATE app.programs p
  SET registered_count = (
        SELECT count(*) FROM app.registrations r
        WHERE r.program_id = p_program_id
          AND r.status = 'Confirmed'
          AND r.archived_at IS NULL
      ),
      updated_at = now()
  WHERE p.id = p_program_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_program_registered_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.refresh_program_registered_count(NEW.program_id);
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM app.refresh_program_registered_count(OLD.program_id);
    RETURN NULL;
  ELSE
    IF NEW.program_id IS DISTINCT FROM OLD.program_id THEN
      PERFORM app.refresh_program_registered_count(OLD.program_id);
    END IF;
    PERFORM app.refresh_program_registered_count(NEW.program_id);
    RETURN NULL;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_program_registered ON app.registrations;
CREATE TRIGGER trg_sync_program_registered
  AFTER INSERT OR UPDATE OR DELETE ON app.registrations
  FOR EACH ROW EXECUTE FUNCTION app.sync_program_registered_count();

-- ----------------------------------------------------------------------------
-- Session attendance — NEW. One row per (student, session).
-- status: ATTENDED | ABSENT | EXCLUDED. Actor + reason required for EXCLUDED.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.session_attendance (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES app.sessions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  student_id  uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  status      text        NOT NULL
    CHECK (status IN ('ATTENDED', 'ABSENT', 'EXCLUDED')),
  actor_id    uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  reason      text        NULL,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  row_version integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id),
  CHECK (status <> 'EXCLUDED' OR (actor_id IS NOT NULL AND reason IS NOT NULL))
);
ALTER TABLE app.session_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.session_attendance FROM PUBLIC;

CREATE INDEX IF NOT EXISTS session_attendance_session_status_idx
  ON app.session_attendance (session_id, status);
CREATE INDEX IF NOT EXISTS session_attendance_student_idx
  ON app.session_attendance (student_id);

DROP TRIGGER IF EXISTS trg_touch_session_attendance ON app.session_attendance;
CREATE TRIGGER trg_touch_session_attendance
  BEFORE UPDATE ON app.session_attendance
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.programs, app.sessions, app.registrations, app.session_attendance
  TO elevateme_app;
