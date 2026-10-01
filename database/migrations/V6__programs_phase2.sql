-- ============================================================================
-- ElevateMe Flyway V6 — programs Phase2 fixes
-- Postgres 14 compatible. Idempotent. Depends on V1–V5.
--
-- Goals:
--   * Programs: harden type/subtype/themes/visibility/lifecycle + owner,
--     capacity, registration_deadline, business version, approval metadata.
--   * Sessions: timestamptz range, legacy DATE migration, committee/topic/
--     venue, program FK ON DELETE RESTRICT (never delete history), immutable
--     program_id once evaluations exist (409-style).
--   * Registrations: fix NULL!=NULL dedupe with two partial unique indexes,
--     allocation/status/confirmed_at, capacity counter + refresh trigger.
--   * session_attendance: ensure table (V2 already creates it; re-asserted).
--   * One-off auto-session helper for SingleEvent (explicit, Java-called).
--   * Indexes for roster/registration/session/program lookups.
--   * RLS: re-assert V5 deny-all on touched tables.
--
-- Naming mappings (logical -> physical, for reviewers):
--   * logical `type`   -> physical `program_type`
--       Phase2 canonical: SingleEvent|Continuous|Special (+ legacy
--       SINGLE_EVENT|CONTINUOUS|SPECIAL for backward compat with seed_dev).
--   * logical `status` -> physical `lifecycle`
--       DRAFT|PENDING_REVIEW|CHANGES_REQUESTED|APPROVED|PUBLISHED|
--       COMPLETED|ARCHIVED (already matches V2).
--   * logical `programs.registered` -> physical `registered_count`
--       COUNT(*) Confirmed (both TitleCase + UPPER, see registrations).
--   * `version` (business content version, default 1) is DISTINCT from
--     `row_version` (optimistic-locking counter bumped by touch_updated_at).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

-- ----------------------------------------------------------------------------
-- 1. Programs — ensure columns.
-- V2 already has: slug, title, program_type, subtype, themes, institute_id,
-- owner_id, venue, capacity, registered_count, visibility, lifecycle,
-- approval_decided_by/at/note, description, row_version, timestamps.
-- V6 adds (IF NOT EXISTS): registration_deadline, version, starts_at,
-- submitted_at, decided_at, decided_by, decision_note.
-- Existing columns are re-asserted with ADD COLUMN IF NOT EXISTS (no-op).
-- ----------------------------------------------------------------------------
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS program_type TEXT;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS subtype TEXT;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS themes TEXT[];
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS institute_id UUID;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS registered_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS visibility TEXT;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS lifecycle TEXT;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS decided_by UUID NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS decision_note TEXT NULL;

-- Backfill new approval columns from legacy approval_* where possible (idempotent).
UPDATE app.programs SET decided_by = approval_decided_by
 WHERE decided_by IS NULL AND approval_decided_by IS NOT NULL;
UPDATE app.programs SET decided_at = approval_decided_at
 WHERE decided_at IS NULL AND approval_decided_at IS NOT NULL;
UPDATE app.programs SET decision_note = approval_note
 WHERE decision_note IS NULL AND approval_note IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1b. Programs — CHECK constraints (superset: Phase2 canonical + legacy).
-- We DROP the legacy UPPER-only / Title-only CHECKs (IF EXISTS) then ADD
-- superset CHECKs with explicit Phase2 names. Existing rows pass because the
-- superset includes every legacy value used by seed_dev.sql.
-- ----------------------------------------------------------------------------
-- type (program_type): SingleEvent|Continuous|Special + legacy SINGLE_EVENT|CONTINUOUS|SPECIAL
ALTER TABLE app.programs DROP CONSTRAINT IF EXISTS programs_program_type_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_type_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_type_phase2_check
      CHECK (program_type IN ('SINGLE_EVENT', 'CONTINUOUS', 'SPECIAL', 'SingleEvent', 'Continuous', 'Special'));
  END IF;
END
$$;

-- subtype: MUN|Debate|Competition|Special|null + legacy MODEL_UN|FRIENDLY_DEBATE|COMPETITION|SPECIAL|WORKSHOP|LEAGUE
ALTER TABLE app.programs DROP CONSTRAINT IF EXISTS programs_subtype_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_subtype_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_subtype_phase2_check
      CHECK (subtype IS NULL OR subtype IN (
        'MODEL_UN', 'FRIENDLY_DEBATE', 'COMPETITION', 'SPECIAL', 'WORKSHOP', 'LEAGUE',
        'MUN', 'Debate', 'Competition', 'Special'));
  END IF;
END
$$;

-- themes text[]: subset of PublicSpeaking|Communication|Negotiation|Leadership
-- (+ legacy diplomacy|debate|model-un for seed_dev backward compat).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_themes_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_themes_phase2_check
      CHECK (themes <@ ARRAY['diplomacy', 'debate', 'model-un',
                             'PublicSpeaking', 'Communication', 'Negotiation', 'Leadership']::text[]);
  END IF;
END
$$;

-- visibility: PUBLIC|ASSIGNED|PRIVATE + legacy INTERNAL|PUBLIC|INVITE_ONLY (PUBLIC overlaps).
ALTER TABLE app.programs DROP CONSTRAINT IF EXISTS programs_visibility_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_visibility_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_visibility_phase2_check
      CHECK (visibility IN ('INTERNAL', 'PUBLIC', 'INVITE_ONLY', 'ASSIGNED', 'PRIVATE'));
  END IF;
END
$$;

-- lifecycle: already DRAFT|PENDING_REVIEW|CHANGES_REQUESTED|APPROVED|PUBLISHED|COMPLETED|ARCHIVED (V2 matches Phase2). No change.
-- capacity INT >= 1 (V2 has CHECK (capacity > 0); for INTEGER, >0 <=> >=1; keep both).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_capacity_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_capacity_phase2_check CHECK (capacity >= 1);
  END IF;
END
$$;

-- version INT default 1, >= 1.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_version_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_version_phase2_check CHECK (version >= 1);
  END IF;
END
$$;

-- approval metadata: submitted_at, decided_at, decided_by, decision_note.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_decided_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_decided_phase2_check
      CHECK (decided_at IS NULL OR decided_by IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_decision_order_phase2_check' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_decision_order_phase2_check
      CHECK (submitted_at IS NULL OR decided_at IS NULL OR decided_at >= submitted_at);
  END IF;
END
$$;

-- owner_id UUID -> profiles FK (V2 already has it; re-assert if missing).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_owner_id_fkey' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES app.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'programs_decided_by_fkey' AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_decided_by_fkey
      FOREIGN KEY (decided_by) REFERENCES app.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_programs ON app.programs;
CREATE TRIGGER trg_touch_programs
  BEFORE UPDATE ON app.programs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Sessions — ensure starts_at/ends_at, committee/topic, venue, program FK.
-- ----------------------------------------------------------------------------
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS program_id UUID;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS committee TEXT NULL;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS topic TEXT NULL;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS venue TEXT NULL;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;
ALTER TABLE app.sessions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL;

-- Legacy DATE migration: if a legacy `date` DATE column exists (e.g. ported
-- from public.sessions.date), fold it into starts_at (midnight UTC) where
-- starts_at is still NULL. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'app' AND table_name = 'sessions' AND column_name = 'date') THEN
    EXECUTE $mig$UPDATE app.sessions SET starts_at = ("date")::date::timestamptz WHERE starts_at IS NULL AND "date" IS NOT NULL$mig$;
  END IF;
END
$$;

-- Program FK must be ON DELETE RESTRICT (never delete history), not CASCADE.
-- V2 used ON DELETE CASCADE; Phase2 tightens to RESTRICT. Existing rows are
-- unaffected (they all reference live programs); only future deletes change.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'app.sessions'::regclass AND contype = 'f'
               AND conname = 'sessions_program_id_fkey' AND confdeltype <> 'r') THEN
    ALTER TABLE app.sessions DROP CONSTRAINT sessions_program_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'app.sessions'::regclass AND conname = 'sessions_program_id_fkey') THEN
    ALTER TABLE app.sessions ADD CONSTRAINT sessions_program_id_fkey
      FOREIGN KEY (program_id) REFERENCES app.programs (id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- Immutable program linkage: reject program_id change when evaluations exist.
-- 409-style: message carries "[409 Conflict]" for direct Java -> HTTP mapping.
CREATE OR REPLACE FUNCTION app.prevent_session_reparenting()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
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
    RAISE EXCEPTION 'SESSION_PROGRAM_IMMUTABLE [409 Conflict]: session % has % evaluation link(s); program_id change rejected.',
      OLD.id, v_refs USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_lock_session_program ON app.sessions;
CREATE TRIGGER trg_lock_session_program
  BEFORE UPDATE OF program_id ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_session_reparenting();

DROP TRIGGER IF EXISTS trg_touch_sessions ON app.sessions;
CREATE TRIGGER trg_touch_sessions
  BEFORE UPDATE ON app.sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Registrations — dedupe fix, allocation/status/confirmed_at, counter.
-- ----------------------------------------------------------------------------
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS student_id UUID;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS program_id UUID;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS allocation TEXT NULL;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL;
ALTER TABLE app.registrations ADD COLUMN IF NOT EXISTS confirmed_by UUID;

-- status: PENDING|CONFIRMED|WAITLISTED|REJECTED|CANCELLED|WITHDRAWN
-- (+ legacy TitleCase Pending|Confirmed|Waitlisted|Rejected|Cancelled).
ALTER TABLE app.registrations DROP CONSTRAINT IF EXISTS registrations_status_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_status_phase2_check' AND conrelid = 'app.registrations'::regclass) THEN
    ALTER TABLE app.registrations ADD CONSTRAINT registrations_status_phase2_check
      CHECK (status IN ('Pending', 'Confirmed', 'Waitlisted', 'Rejected', 'Cancelled',
                        'PENDING', 'CONFIRMED', 'WAITLISTED', 'REJECTED', 'CANCELLED', 'WITHDRAWN'));
  END IF;
END
$$;

-- confirmed_at only when Confirmed/CONFIRMED (broadens V2 TitleCase-only check).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.registrations'::regclass AND contype = 'c'
             AND conname <> 'registrations_confirmed_phase2_check'
             AND pg_get_constraintdef(oid) ILIKE '%confirmed_at%Confirmed%' LOOP
    EXECUTE format('ALTER TABLE app.registrations DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_confirmed_phase2_check' AND conrelid = 'app.registrations'::regclass) THEN
    ALTER TABLE app.registrations ADD CONSTRAINT registrations_confirmed_phase2_check
      CHECK (confirmed_at IS NULL OR status IN ('Confirmed', 'CONFIRMED'));
  END IF;
END
$$;

-- NULL != NULL dedupe fix: two partial unique indexes (V2 already has them;
-- re-asserted idempotently so a DB that skipped V2 still gets the guarantee).
CREATE UNIQUE INDEX IF NOT EXISTS registrations_program_level_unique
  ON app.registrations (student_id, program_id)
  WHERE session_id IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_session_level_unique
  ON app.registrations (student_id, program_id, session_id)
  WHERE session_id IS NOT NULL AND archived_at IS NULL;

-- ----------------------------------------------------------------------------
-- Capacity counter: programs.registered_count (aka logical programs.registered)
-- counts Confirmed rows. Java MUST do capacity transactionally:
--   BEGIN;
--   SELECT * FROM app.programs WHERE id = ? FOR UPDATE;
--   SELECT count(*) FROM app.registrations
--    WHERE program_id = ? AND status IN ('Confirmed','CONFIRMED') AND archived_at IS NULL;
--   -- fail with 409 when count >= capacity, else INSERT/UPDATE registration;
--   COMMIT;
-- The trigger below only keeps the counter cache honest (mirrors legacy 004).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.refresh_program_registered_count(p_program_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $func$
BEGIN
  UPDATE app.programs p
  SET registered_count = (
        SELECT count(*) FROM app.registrations r
        WHERE r.program_id = p_program_id
          AND r.status IN ('Confirmed', 'CONFIRMED')
          AND r.archived_at IS NULL
      ),
      updated_at = now()
  WHERE p.id = p_program_id;
END;
$func$;

CREATE OR REPLACE FUNCTION app.sync_program_registered_count()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
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
$func$;

DROP TRIGGER IF EXISTS trg_sync_program_registered ON app.registrations;
CREATE TRIGGER trg_sync_program_registered
  AFTER INSERT OR UPDATE OR DELETE ON app.registrations
  FOR EACH ROW EXECUTE FUNCTION app.sync_program_registered_count();

DROP TRIGGER IF EXISTS trg_touch_registrations ON app.registrations;
CREATE TRIGGER trg_touch_registrations
  BEFORE UPDATE ON app.registrations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. session_attendance — ensure table (V2 already creates it; no-op if so).
-- One row per (student, session). status ATTENDED|ABSENT|EXCLUDED.
-- EXCLUDED requires actor + reason. Timestamps included.
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

DROP TRIGGER IF EXISTS trg_touch_session_attendance ON app.session_attendance;
CREATE TRIGGER trg_touch_session_attendance
  BEFORE UPDATE ON app.session_attendance
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. One-off auto-session helper for SingleEvent programs with no sessions.
-- Explicit helper CALLED BY JAVA (e.g. after publish); deliberately NOT wired
-- to an auto-trigger so creation stays explicit and auditable.
-- Returns the new (or already-existing, for idempotent retries) session id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_single_session_for_event(p_program_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $func$
DECLARE
  v_program_type text;
  v_slug         text;
  v_title        text;
  v_venue        text;
  v_starts       timestamptz;
  v_existing     uuid;
  v_new_id       uuid;
BEGIN
  SELECT program_type, slug, title, venue,
         COALESCE(starts_at, registration_deadline, now() + interval '7 days')
    INTO v_program_type, v_slug, v_title, v_venue, v_starts
  FROM app.programs WHERE id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRAM_NOT_FOUND [404]: program % does not exist.', p_program_id USING ERRCODE = 'P0001';
  END IF;

  IF v_program_type NOT IN ('SingleEvent', 'SINGLE_EVENT') THEN
    RAISE EXCEPTION 'AUTO_SESSION_TYPE_MISMATCH [409 Conflict]: program % is type %, only SingleEvent supports auto-session.', p_program_id, v_program_type USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing FROM app.sessions
   WHERE program_id = p_program_id AND archived_at IS NULL
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO app.sessions (program_id, slug, title, committee, topic, venue, starts_at, ends_at)
  VALUES (p_program_id,
          v_slug || '-single-' || substring(gen_random_uuid()::text, 1, 8),
          v_title || ' — Single Session',
          'General', 'Single session', v_venue, v_starts, v_starts + interval '2 hours')
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$func$;

-- ----------------------------------------------------------------------------
-- 6. Indexes — roster + lookup coverage.
--   roster:        (session_id, status) on registrations + session_attendance
--   registrations: (program_id, status)
--   sessions:      (program_id, starts_at)
--   programs:      (visibility, status->lifecycle, starts_at)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS registrations_session_status_idx
  ON app.registrations (session_id, status);
CREATE INDEX IF NOT EXISTS registrations_program_status_idx
  ON app.registrations (program_id, status);
CREATE INDEX IF NOT EXISTS registrations_student_idx
  ON app.registrations (student_id);

CREATE INDEX IF NOT EXISTS session_attendance_session_status_idx
  ON app.session_attendance (session_id, status);
CREATE INDEX IF NOT EXISTS session_attendance_student_idx
  ON app.session_attendance (student_id);

CREATE INDEX IF NOT EXISTS sessions_program_id_idx ON app.sessions (program_id);
CREATE INDEX IF NOT EXISTS sessions_starts_at_idx ON app.sessions (starts_at);
CREATE INDEX IF NOT EXISTS sessions_program_starts_idx
  ON app.sessions (program_id, starts_at);

CREATE INDEX IF NOT EXISTS programs_lifecycle_idx ON app.programs (lifecycle);
CREATE INDEX IF NOT EXISTS programs_owner_id_idx ON app.programs (owner_id);
CREATE INDEX IF NOT EXISTS programs_institute_idx ON app.programs (institute_id);
CREATE INDEX IF NOT EXISTS programs_visibility_idx ON app.programs (visibility);
-- status (lifecycle) + visibility + starts_at composite for public listing.
CREATE INDEX IF NOT EXISTS programs_visibility_lifecycle_starts_idx
  ON app.programs (visibility, lifecycle, starts_at);

-- ----------------------------------------------------------------------------
-- 7. RLS — extend V5 deny-all to touched tables (new columns inherit table RLS).
-- ENABLE RLS is idempotent; deny policy created IF NOT EXISTS via pg_policies.
-- Roles ensured IF NOT EXISTS (V1/V5 pattern; anon/authenticated are Supabase
-- Data API roles that must exist for REVOKE/POLICY to parse on vanilla PG).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateme_app') THEN
    CREATE ROLE elevateme_app NOLOGIN;
  END IF;
END
$$;

ALTER TABLE app.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_attendance ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  app.programs, app.sessions, app.registrations, app.session_attendance
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app TO elevateme_app, app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.programs, app.sessions, app.registrations, app.session_attendance
  TO elevateme_app, app_runtime;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['programs', 'sessions', 'registrations', 'session_attendance'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'app' AND tablename = t AND policyname = 'deny_all') THEN
      EXECUTE format('CREATE POLICY deny_all ON app.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
    END IF;
  END LOOP;
END
$$;

COMMENT ON FUNCTION app.create_single_session_for_event(uuid) IS 'Phase2: explicit one-off auto-session for SingleEvent programs with no sessions. Called by Java, never auto-triggered.';
