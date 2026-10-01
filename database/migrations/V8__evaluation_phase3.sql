-- ============================================================================
-- ElevateMe Flyway V8 — evaluation Phase 3 hardening
-- Postgres 14 compatible. Idempotent. Depends on V1–V3 (V4–V7 safe to pre-run).
--
-- Re-asserts V3 evaluation model + Phase 3 hardening:
--   * rubric_versions / rubric_criteria: 10 stable keys in fixed order with
--     labels EXACT per docs/SCORING.md (Sound NOT Vocal Delivery), bounds
--     0-100, definitions "Pending DI review", seed v2 active if missing,
--     FK from evaluations (history immutable).
--   * evaluation_assignments: UNIQUE(student,session) + row_version + bump.
--   * evaluations / revisions: UNIQUE(student,session) on live row,
--     UNIQUE(evaluation,revision_no) on history, states
--     DRAFT|SUBMITTED|LOCKED (live) / DRAFT|SUBMITTED (revision),
--     released_revision_id + correction_reason + row_version.
--   * evaluation_scores: UNIQUE(revision,criterion) INT 0-100 CHECK
--     (migrates legacy numeric => int if needed).
--   * guest_invitations: token_hash UNIQUE (never raw), scope TEXT
--     EVENT|SESSION (Java contract) + scope_details JSONB extension,
--     expiry default session_end+7d, revoked_at.
--   * guest_sessions: session_hash UNIQUE, 24h expiry.
--   * report_releases: idempotency_key UNIQUE(actor+key).
--   * comment_bank_entries: ADMIN_SHARED|TEACHER_PRIVATE.
--   * Triggers: prevent duplicates (409-style), version bump
--     (touch_updated_at), release timestamp (released_at auto-set).
--   * Indexes + RLS deny-all (Java JDBC scoping authoritative).
--   * Seed (test domains only, idempotent): 1 session + 3 evals
--     (draft partial, submitted complete, released locked) + 1 expired
--     invite + 2 comment entries. All emails @test.example.com, all
--     hashes fake placeholders (never raw tokens).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

-- ----------------------------------------------------------------------------
-- 0. Roles (V1/V5/V6 pattern; anon/authenticated must exist for REVOKE/POLICY
-- to parse on vanilla PG14).
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
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elevateme_owner') THEN
    CREATE ROLE elevateme_owner NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO elevateme_app, app_runtime;

-- ============================================================================
-- 1. Rubric versions — one active at a time. Seed v2 active if missing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.rubric_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text        UNIQUE NOT NULL,
  is_active     boolean     NOT NULL DEFAULT false,
  effective_from timestamptz NULL,
  row_version   integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz NULL
);

ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS effective_from timestamptz NULL;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE app.rubric_versions ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- Backfill row_version where NULL (legacy rows pre-Phase3).
UPDATE app.rubric_versions SET row_version = 1 WHERE row_version IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rubric_versions_single_active
  ON app.rubric_versions (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS trg_touch_rubric_versions ON app.rubric_versions;
CREATE TRIGGER trg_touch_rubric_versions
  BEFORE UPDATE ON app.rubric_versions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Seed v2 active if missing (idempotent). If no active version at all,
-- activate v2 so Java findActiveRubricVersionId() never returns empty.
INSERT INTO app.rubric_versions (version, is_active, effective_from)
VALUES ('v2', true, now())
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.rubric_versions WHERE is_active) THEN
    UPDATE app.rubric_versions SET is_active = true WHERE version = 'v2';
  END IF;
END
$$;

-- ============================================================================
-- 2. Rubric criteria — 10 stable keys in order, labels EXACT, bounds 0-100,
-- definitions "Pending DI review".
--
-- Canonical per docs/SCORING.md + frontend/src/lib/scoring.ts (frozen):
--   1 preparation / Preparation
--   2 clarity / Clarity
--   3 confidence / Confidence
--   4 focus / Focus
--   5 critical_analysis / Critical Analysis
--   6 sound / Sound (NOT Vocal Delivery — never rename)
--   7 audience_addressing / Audience Addressing
--   8 counter_arguments / Counter Arguments
--   9 wit / Wit
--   10 overall_performance / Overall Performance
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.rubric_criteria (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_version_id uuid        NOT NULL REFERENCES app.rubric_versions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  criterion_key     text        NOT NULL,
  sort_order        integer     NOT NULL CHECK (sort_order BETWEEN 1 AND 10),
  min_score         integer     NOT NULL DEFAULT 0 CHECK (min_score >= 0),
  max_score         integer     NOT NULL DEFAULT 100 CHECK (max_score <= 100),
  definition        text        NOT NULL DEFAULT 'Pending DI review',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_version_id, criterion_key),
  UNIQUE (rubric_version_id, sort_order),
  CHECK (min_score <= max_score)
);

-- Ensure columns exist on pre-V8 DBs.
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS rubric_version_id uuid;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS criterion_key text;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS min_score integer;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS max_score integer;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS definition text;
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS created_at timestamptz;
-- Phase3 label column: exact display label per SCORING.md.
ALTER TABLE app.rubric_criteria ADD COLUMN IF NOT EXISTS label text;

-- Default definition is DI-owned placeholder (structural only, never shown as final copy).
ALTER TABLE app.rubric_criteria ALTER COLUMN definition SET DEFAULT 'Pending DI review';

-- Best-effort legacy rename: any vocal-delivery variant -> sound.
-- (Legacy supabase/seed.sql used vocal-delivery/Vocal Delivery; canonical is sound/Sound.)
DO $$
BEGIN
  BEGIN
    UPDATE app.rubric_criteria
       SET criterion_key = 'sound'
     WHERE criterion_key IN ('vocal_delivery', 'vocal-delivery', 'Vocal Delivery', 'vocalDelivery');
  EXCEPTION WHEN OTHERS THEN
    -- UNIQUE conflict (both sound + legacy present): drop legacy duplicates, keep sound.
    DELETE FROM app.rubric_criteria a USING app.rubric_criteria b
     WHERE a.criterion_key IN ('vocal_delivery', 'vocal-delivery', 'Vocal Delivery', 'vocalDelivery')
       AND b.criterion_key = 'sound'
       AND a.rubric_version_id = b.rubric_version_id;
  END;
END
$$;

-- Enforce 10-key CHECK (superset that REJECTS vocal_delivery). Drop legacy
-- permissive CHECKs first, then add frozen Phase3 CHECK if missing.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.rubric_criteria'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%criterion_key%IN%'
             AND conname <> 'rubric_criteria_key_phase3_check' LOOP
    EXECUTE format('ALTER TABLE app.rubric_criteria DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'rubric_criteria_key_phase3_check'
                   AND conrelid = 'app.rubric_criteria'::regclass) THEN
    ALTER TABLE app.rubric_criteria ADD CONSTRAINT rubric_criteria_key_phase3_check
      CHECK (criterion_key IN ('preparation', 'clarity', 'confidence', 'focus',
        'critical_analysis', 'sound', 'audience_addressing',
        'counter_arguments', 'wit', 'overall_performance'));
  END IF;
END
$$;

-- Bounds hardening: min 0, max 100 (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'rubric_criteria_bounds_phase3_check'
                   AND conrelid = 'app.rubric_criteria'::regclass) THEN
    ALTER TABLE app.rubric_criteria ADD CONSTRAINT rubric_criteria_bounds_phase3_check
      CHECK (min_score = 0 AND max_score = 100 AND min_score <= max_score);
  END IF;
END
$$;

-- Seed v2 criteria (idempotent) with EXACT labels + Pending DI review.
INSERT INTO app.rubric_criteria (rubric_version_id, criterion_key, sort_order, label, min_score, max_score, definition)
SELECT v.id, k.key, k.ord, k.lbl, 0, 100, 'Pending DI review'
FROM app.rubric_versions v
CROSS JOIN (VALUES
  ('preparation', 1, 'Preparation'),
  ('clarity', 2, 'Clarity'),
  ('confidence', 3, 'Confidence'),
  ('focus', 4, 'Focus'),
  ('critical_analysis', 5, 'Critical Analysis'),
  ('sound', 6, 'Sound'),
  ('audience_addressing', 7, 'Audience Addressing'),
  ('counter_arguments', 8, 'Counter Arguments'),
  ('wit', 9, 'Wit'),
  ('overall_performance', 10, 'Overall Performance')
) AS k(key, ord, lbl)
WHERE v.version = 'v2'
ON CONFLICT (rubric_version_id, criterion_key) DO NOTHING;

-- Backfill EXACT labels + Pending DI review on pre-existing v2 rows
-- (V3 used 'DI definition placeholder for <key>'; Phase3 normalises to DI-owned placeholder).
UPDATE app.rubric_criteria AS c SET
  label = m.lbl,
  min_score = 0,
  max_score = 100,
  definition = 'Pending DI review'
FROM (VALUES
  ('preparation', 1, 'Preparation'),
  ('clarity', 2, 'Clarity'),
  ('confidence', 3, 'Confidence'),
  ('focus', 4, 'Focus'),
  ('critical_analysis', 5, 'Critical Analysis'),
  ('sound', 6, 'Sound'),
  ('audience_addressing', 7, 'Audience Addressing'),
  ('counter_arguments', 8, 'Counter Arguments'),
  ('wit', 9, 'Wit'),
  ('overall_performance', 10, 'Overall Performance')
) AS m(key, ord, lbl)
WHERE c.criterion_key = m.key
  AND (c.label IS DISTINCT FROM m.lbl
    OR c.definition IS DISTINCT FROM 'Pending DI review'
    OR c.sort_order IS DISTINCT FROM m.ord
    OR c.min_score IS DISTINCT FROM 0
    OR c.max_score IS DISTINCT FROM 100);

-- Fix sort_order drift idempotently (unique per version).
UPDATE app.rubric_criteria AS c SET sort_order = m.ord
FROM (VALUES
  ('preparation', 1), ('clarity', 2), ('confidence', 3), ('focus', 4),
  ('critical_analysis', 5), ('sound', 6), ('audience_addressing', 7),
  ('counter_arguments', 8), ('wit', 9), ('overall_performance', 10)
) AS m(key, ord)
WHERE c.criterion_key = m.key AND c.sort_order IS DISTINCT FROM m.ord;

-- Label exactness CHECK (Sound NOT Vocal Delivery). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'rubric_criteria_label_phase3_check'
                   AND conrelid = 'app.rubric_criteria'::regclass) THEN
    ALTER TABLE app.rubric_criteria ADD CONSTRAINT rubric_criteria_label_phase3_check
      CHECK (
        (criterion_key = 'preparation' AND (label IS NULL OR label = 'Preparation'))
        OR (criterion_key = 'clarity' AND (label IS NULL OR label = 'Clarity'))
        OR (criterion_key = 'confidence' AND (label IS NULL OR label = 'Confidence'))
        OR (criterion_key = 'focus' AND (label IS NULL OR label = 'Focus'))
        OR (criterion_key = 'critical_analysis' AND (label IS NULL OR label = 'Critical Analysis'))
        OR (criterion_key = 'sound' AND (label IS NULL OR label = 'Sound'))
        OR (criterion_key = 'audience_addressing' AND (label IS NULL OR label = 'Audience Addressing'))
        OR (criterion_key = 'counter_arguments' AND (label IS NULL OR label = 'Counter Arguments'))
        OR (criterion_key = 'wit' AND (label IS NULL OR label = 'Wit'))
        OR (criterion_key = 'overall_performance' AND (label IS NULL OR label = 'Overall Performance'))
      );
  END IF;
END
$$;

-- ============================================================================
-- 3. Evaluation assignments — UNIQUE(student,session) + row_version + bump.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.evaluation_assignments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  session_id        uuid        NOT NULL REFERENCES app.sessions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  rubric_version_id uuid        NOT NULL REFERENCES app.rubric_versions (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  assigned_by       uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  row_version       integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz NULL,
  UNIQUE (student_id, session_id)
);

ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS student_id uuid;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS rubric_version_id uuid;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS assigned_by uuid;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE app.evaluation_assignments ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

UPDATE app.evaluation_assignments SET row_version = 1 WHERE row_version IS NULL;

-- UNIQUE(student,session) is the dedupe guarantee (partial NULL bug N/A: both NOT NULL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'app.evaluation_assignments'::regclass
                   AND contype = 'u'
                   AND pg_get_constraintdef(oid) ILIKE '%student_id%session_id%') THEN
    -- CREATE TABLE already declares it; this path only fires on legacy tables
    -- that were created without the constraint.
    ALTER TABLE app.evaluation_assignments ADD CONSTRAINT evaluation_assignments_student_session_key
      UNIQUE (student_id, session_id);
  END IF;
END
$$;

-- FK to rubric_versions (history immutable: assignment pins the version it was made under).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluation_assignments_rubric_version_id_fkey'
                   AND conrelid = 'app.evaluation_assignments'::regclass) THEN
    ALTER TABLE app.evaluation_assignments ADD CONSTRAINT evaluation_assignments_rubric_version_id_fkey
      FOREIGN KEY (rubric_version_id) REFERENCES app.rubric_versions (id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS evaluation_assignments_session_idx
  ON app.evaluation_assignments (session_id);
CREATE INDEX IF NOT EXISTS evaluation_assignments_student_idx
  ON app.evaluation_assignments (student_id);

-- Version bump (optimistic locking): touch_updated_at on every UPDATE.
DROP TRIGGER IF EXISTS trg_touch_evaluation_assignments ON app.evaluation_assignments;
CREATE TRIGGER trg_touch_evaluation_assignments
  BEFORE UPDATE ON app.evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Prevent duplicates with a 409-style message (UNIQUE is the backstop;
-- this trigger gives Java a mappable message on the INSERT path).
-- Idempotent-seed safe: same-id re-inserts (Flyway re-run / ON CONFLICT
-- DO NOTHING with fixed seed UUIDs) are allowed through so the UNIQUE
-- handler can DO NOTHING; only a *different* id colliding on
-- (student,session) raises 409.
CREATE OR REPLACE FUNCTION app.prevent_duplicate_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.evaluation_assignments
             WHERE student_id = NEW.student_id AND session_id = NEW.session_id
               AND archived_at IS NULL AND id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'ASSIGNMENT_DUPLICATE [409 Conflict]: student % already assigned in session %.',
      NEW.student_id, NEW.session_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_assignment ON app.evaluation_assignments;
CREATE TRIGGER trg_prevent_duplicate_assignment
  BEFORE INSERT ON app.evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION app.prevent_duplicate_assignment();

-- ============================================================================
-- 4. Evaluations — live row per (student,session). History via revisions.
-- DRAFT|SUBMITTED|LOCKED + released_revision_id + correction_reason + row_version.
-- FK from evaluations pins rubric version (history immutable).
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.evaluations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid        NOT NULL REFERENCES app.profiles (id)
                                          ON DELETE RESTRICT ON UPDATE CASCADE,
  session_id           uuid        NOT NULL REFERENCES app.sessions (id)
                                          ON DELETE CASCADE ON UPDATE CASCADE,
  program_id           uuid        NOT NULL REFERENCES app.programs (id)
                                          ON DELETE CASCADE ON UPDATE CASCADE,
  evaluator_id         uuid        NULL REFERENCES app.profiles (id)
                                          ON DELETE SET NULL ON UPDATE CASCADE,
  rubric_version_id    uuid        NOT NULL REFERENCES app.rubric_versions (id)
                                          ON DELETE RESTRICT ON UPDATE CASCADE,
  state                text        NOT NULL DEFAULT 'DRAFT'
    CHECK (state IN ('DRAFT', 'SUBMITTED', 'LOCKED')),
  released_revision_id uuid        NULL,
  correction_reason    text        NULL,
  released_at          timestamptz NULL,
  row_version          integer     NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz NULL,
  UNIQUE (student_id, session_id),
  CHECK (released_at IS NULL OR state = 'LOCKED'),
  CHECK (released_revision_id IS NULL OR state = 'LOCKED')
);

ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS student_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS evaluator_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS rubric_version_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS released_revision_id uuid;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS correction_reason text NULL;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS released_at timestamptz NULL;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE app.evaluations ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

UPDATE app.evaluations SET row_version = 1 WHERE row_version IS NULL;

-- State vocab hardening (DRAFT|SUBMITTED|LOCKED). Drop legacy narrow CHECKs, add Phase3 superset.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.evaluations'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%state%IN%DRAFT%'
             AND conname NOT IN ('evaluations_state_phase3_check') LOOP
    -- Keep V3's own evaluations_state check if it already matches the superset;
    -- only drop checks that do NOT mention LOCKED.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint c2
                   WHERE c2.conname = r.conname
                     AND pg_get_constraintdef(c2.oid) ILIKE '%LOCKED%') THEN
      EXECUTE format('ALTER TABLE app.evaluations DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluations_state_phase3_check'
                   AND conrelid = 'app.evaluations'::regclass) THEN
    ALTER TABLE app.evaluations ADD CONSTRAINT evaluations_state_phase3_check
      CHECK (state IN ('DRAFT', 'SUBMITTED', 'LOCKED'));
  END IF;
END
$$;

-- Release coherence: released_* only on LOCKED.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluations_release_phase3_check'
                   AND conrelid = 'app.evaluations'::regclass) THEN
    ALTER TABLE app.evaluations ADD CONSTRAINT evaluations_release_phase3_check
      CHECK ((released_at IS NULL OR state = 'LOCKED')
         AND (released_revision_id IS NULL OR state = 'LOCKED'));
  END IF;
END
$$;

-- FK: evaluations -> rubric_versions (history immutable: RESTRICT, never cascade).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluations_rubric_version_id_fkey'
                   AND conrelid = 'app.evaluations'::regclass) THEN
    ALTER TABLE app.evaluations ADD CONSTRAINT evaluations_rubric_version_id_fkey
      FOREIGN KEY (rubric_version_id) REFERENCES app.rubric_versions (id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluations_released_revision_fk'
                   AND conrelid = 'app.evaluations'::regclass) THEN
    ALTER TABLE app.evaluations ADD CONSTRAINT evaluations_released_revision_fk
      FOREIGN KEY (released_revision_id) REFERENCES app.evaluation_revisions (id)
      ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

-- History immutable: live row linkage (student/session/program/rubric) never changes
-- once the row exists. Java creates corrections as NEW revisions, never by
-- re-parenting the live row.
CREATE OR REPLACE FUNCTION app.guard_evaluation_immutable_cols()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.program_id IS DISTINCT FROM OLD.program_id
     OR NEW.rubric_version_id IS DISTINCT FROM OLD.rubric_version_id THEN
    RAISE EXCEPTION 'EVALUATION_HISTORY_IMMUTABLE [409 Conflict]: evaluation % linkage (student/session/program/rubric) is immutable; create a new revision instead.',
      OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_evaluation_immutable ON app.evaluations;
CREATE TRIGGER trg_guard_evaluation_immutable
  BEFORE UPDATE OF student_id, session_id, program_id, rubric_version_id ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.guard_evaluation_immutable_cols();

-- Release timestamp: LOCKED flip stamps released_at when Java did not set it.
CREATE OR REPLACE FUNCTION app.set_evaluation_release_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'LOCKED' AND OLD.state IS DISTINCT FROM 'LOCKED'
     AND NEW.released_at IS NULL THEN
    NEW.released_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_evaluation_release_ts ON app.evaluations;
CREATE TRIGGER trg_set_evaluation_release_ts
  BEFORE UPDATE OF state, released_at ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.set_evaluation_release_timestamp();

-- Prevent duplicates (409-style) + version bump.
-- Idempotent-seed safe (same-id re-insert allowed; different-id collision raises).
CREATE OR REPLACE FUNCTION app.prevent_duplicate_evaluation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.evaluations
             WHERE student_id = NEW.student_id AND session_id = NEW.session_id
               AND archived_at IS NULL AND id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'EVALUATION_DUPLICATE [409 Conflict]: student % already has a live sheet in session %.',
      NEW.student_id, NEW.session_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_evaluation ON app.evaluations;
CREATE TRIGGER trg_prevent_duplicate_evaluation
  BEFORE INSERT ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.prevent_duplicate_evaluation();

DROP TRIGGER IF EXISTS trg_touch_evaluations ON app.evaluations;
CREATE TRIGGER trg_touch_evaluations
  BEFORE UPDATE ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS evaluations_student_chrono_idx
  ON app.evaluations (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluations_session_state_idx
  ON app.evaluations (session_id, state);
CREATE INDEX IF NOT EXISTS evaluations_program_idx
  ON app.evaluations (program_id);
CREATE INDEX IF NOT EXISTS evaluations_released_revision_idx
  ON app.evaluations (released_revision_id) WHERE released_revision_id IS NOT NULL;

-- ============================================================================
-- 5. Evaluation revisions — immutable history. UNIQUE(evaluation,revision_no).
-- States DRAFT|SUBMITTED (LOCKED lives on the parent evaluation row).
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.evaluation_revisions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id     uuid        NOT NULL REFERENCES app.evaluations (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  revision_no       integer     NOT NULL CHECK (revision_no >= 1),
  rubric_version_id uuid        NOT NULL REFERENCES app.rubric_versions (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  state             text        NOT NULL DEFAULT 'DRAFT'
    CHECK (state IN ('DRAFT', 'SUBMITTED')),
  correction_reason text        NULL,
  created_by        uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, revision_no)
);

ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS evaluation_id uuid;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS revision_no integer;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS rubric_version_id uuid;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS correction_reason text;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE app.evaluation_revisions ADD COLUMN IF NOT EXISTS created_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluation_revisions_state_phase3_check'
                   AND conrelid = 'app.evaluation_revisions'::regclass) THEN
    ALTER TABLE app.evaluation_revisions ADD CONSTRAINT evaluation_revisions_state_phase3_check
      CHECK (state IN ('DRAFT', 'SUBMITTED'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS evaluation_revisions_evaluation_idx
  ON app.evaluation_revisions (evaluation_id, revision_no DESC);

-- History immutable: SUBMITTED revisions are append-only. Corrections MUST
-- insert revision_no+1 (Java correctReleased path); never UPDATE/DELETE history.
CREATE OR REPLACE FUNCTION app.guard_revision_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state = 'SUBMITTED' THEN
      RAISE EXCEPTION 'REVISION_HISTORY_IMMUTABLE [409 Conflict]: SUBMITTED revision % cannot be deleted; supersede with revision_no+1.',
        OLD.id USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE path: only allow correction_reason backfill on DRAFT; never mutate SUBMITTED linkage.
  IF OLD.state = 'SUBMITTED'
     AND (NEW.evaluation_id IS DISTINCT FROM OLD.evaluation_id
       OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
       OR NEW.rubric_version_id IS DISTINCT FROM OLD.rubric_version_id
       OR NEW.state IS DISTINCT FROM OLD.state) THEN
    RAISE EXCEPTION 'REVISION_HISTORY_IMMUTABLE [409 Conflict]: SUBMITTED revision % is immutable; create a new revision instead.',
      OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_revision_immutable ON app.evaluation_revisions;
CREATE TRIGGER trg_guard_revision_immutable
  BEFORE UPDATE OR DELETE ON app.evaluation_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision_immutable();

-- ============================================================================
-- 6. Evaluation scores — UNIQUE(revision,criterion) INT 0-100.
-- Migrates legacy numeric => int if a pre-Phase3 DB used numeric.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.evaluation_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id    uuid        NOT NULL REFERENCES app.evaluation_revisions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  criterion_key  text        NOT NULL,
  score          integer     NOT NULL CHECK (score >= 0 AND score <= 100),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, criterion_key)
);

ALTER TABLE app.evaluation_scores ADD COLUMN IF NOT EXISTS revision_id uuid;
ALTER TABLE app.evaluation_scores ADD COLUMN IF NOT EXISTS criterion_key text;
ALTER TABLE app.evaluation_scores ADD COLUMN IF NOT EXISTS score integer;
ALTER TABLE app.evaluation_scores ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- Migrate legacy numeric => int (idempotent; no-op on V3 INT DBs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'app' AND table_name = 'evaluation_scores'
               AND column_name = 'score' AND data_type = 'numeric') THEN
    ALTER TABLE app.evaluation_scores ALTER COLUMN score TYPE integer USING (score::integer);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'app' AND table_name = 'evaluation_scores'
               AND column_name = 'score' AND data_type IN ('double precision', 'real')) THEN
    ALTER TABLE app.evaluation_scores ALTER COLUMN score TYPE integer USING (floor(score)::integer);
  END IF;
END
$$;

-- Legacy vocal-delivery rename on scores (best-effort, idempotent).
DO $$
BEGIN
  BEGIN
    UPDATE app.evaluation_scores SET criterion_key = 'sound'
    WHERE criterion_key IN ('vocal_delivery', 'vocal-delivery', 'Vocal Delivery', 'vocalDelivery',
                            'critical-analysis', 'audience', 'counter', 'overall');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  -- Normalise the remaining legacy short keys from supabase/seed.sql if present.
  BEGIN
    UPDATE app.evaluation_scores SET criterion_key = 'critical_analysis' WHERE criterion_key = 'critical-analysis';
    UPDATE app.evaluation_scores SET criterion_key = 'audience_addressing' WHERE criterion_key = 'audience';
    UPDATE app.evaluation_scores SET criterion_key = 'counter_arguments' WHERE criterion_key = 'counter';
    UPDATE app.evaluation_scores SET criterion_key = 'overall_performance' WHERE criterion_key = 'overall';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

-- Criterion CHECK (frozen 10, Sound NOT Vocal Delivery). Replace legacy permissive CHECKs.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.evaluation_scores'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%criterion_key%IN%'
             AND conname <> 'evaluation_scores_criterion_phase3_check' LOOP
    EXECUTE format('ALTER TABLE app.evaluation_scores DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluation_scores_criterion_phase3_check'
                   AND conrelid = 'app.evaluation_scores'::regclass) THEN
    ALTER TABLE app.evaluation_scores ADD CONSTRAINT evaluation_scores_criterion_phase3_check
      CHECK (criterion_key IN ('preparation', 'clarity', 'confidence', 'focus',
        'critical_analysis', 'sound', 'audience_addressing',
        'counter_arguments', 'wit', 'overall_performance'));
  END IF;
END
$$;

-- INT 0-100 CHECK (idempotent; V3 already has it inline — this name is the Phase3 handle).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.evaluation_scores'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%score%>=%0%AND%score%<=%100%'
             AND conname NOT IN ('evaluation_scores_criterion_phase3_check',
                                 'evaluation_scores_score_phase3_check') LOOP
    -- Keep V3 inline check; only normalise if a duplicate numeric-range check exists
    -- under a different name — do NOT drop the only guard.
    NULL;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'evaluation_scores_score_phase3_check'
                   AND conrelid = 'app.evaluation_scores'::regclass) THEN
    ALTER TABLE app.evaluation_scores ADD CONSTRAINT evaluation_scores_score_phase3_check
      CHECK (score >= 0 AND score <= 100);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS evaluation_scores_revision_idx
  ON app.evaluation_scores (revision_id);

-- History immutable after release: scores of a LOCKED evaluation cannot be
-- UPDATED/DELETED (Java correctReleased inserts a NEW revision instead).
CREATE OR REPLACE FUNCTION app.guard_score_locked_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
BEGIN
  SELECT e.state INTO v_state
  FROM app.evaluation_revisions r JOIN app.evaluations e ON e.id = r.evaluation_id
  WHERE r.id = COALESCE(NEW.revision_id, OLD.revision_id);
  IF v_state = 'LOCKED' THEN
    RAISE EXCEPTION 'SCORE_HISTORY_IMMUTABLE [409 Conflict]: scores of LOCKED evaluation are read-only; correct via a new revision.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_score_locked ON app.evaluation_scores;
CREATE TRIGGER trg_guard_score_locked
  BEFORE UPDATE OR DELETE ON app.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION app.guard_score_locked_immutable();

-- ============================================================================
-- 7. Guest invitations — token_hash UNIQUE (never raw), scope TEXT (Java) +
-- scope_details JSONB extension, expiry default session_end+7d, revoked_at.
-- Guest sessions — session_hash UNIQUE, 24h expiry.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.guest_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text        NOT NULL CHECK (scope IN ('EVENT', 'SESSION')),
  program_id   uuid        NULL REFERENCES app.programs (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  session_id   uuid        NULL REFERENCES app.sessions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  token_hash   text        UNIQUE NOT NULL,
  expires_at   timestamptz NULL,
  revoked_at   timestamptz NULL,
  created_by   uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version  integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (scope <> 'SESSION' OR session_id IS NOT NULL),
  CHECK (scope <> 'EVENT' OR program_id IS NOT NULL)
);

ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS updated_at timestamptz;
-- Phase3 JSONB scope extension: flexible per-invite scope payload
-- (e.g. {"students": ["<uuid>"], "permissions": ["submit"]}). The TEXT `scope`
-- column stays the Java contract (EVENT|SESSION); this JSONB never holds raw tokens.
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS scope_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE app.guest_invitations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app.guest_invitations.token_hash IS 'SHA-256 hex of the guest token. Raw tokens are NEVER stored.';
COMMENT ON COLUMN app.guest_invitations.scope_details IS 'Phase3 JSONB scope extension (student list, permissions). TEXT scope stays EVENT|SESSION.';
UPDATE app.guest_invitations SET row_version = 1 WHERE row_version IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'guest_invitations_token_hash_key'
                   AND conrelid = 'app.guest_invitations'::regclass) THEN
    -- UNIQUE(token_hash) from CREATE TABLE may surface under a generated name;
    -- ensure at least one UNIQUE on token_hash exists.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'app.guest_invitations'::regclass AND contype = 'u'
                     AND pg_get_constraintdef(oid) ILIKE '%token_hash%') THEN
      ALTER TABLE app.guest_invitations ADD CONSTRAINT guest_invitations_token_hash_key UNIQUE (token_hash);
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS guest_invitations_token_hash_idx
  ON app.guest_invitations (token_hash);
CREATE INDEX IF NOT EXISTS guest_invitations_session_idx
  ON app.guest_invitations (session_id);
CREATE INDEX IF NOT EXISTS guest_invitations_expiry_idx
  ON app.guest_invitations (expires_at) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_guest_invitations ON app.guest_invitations;
CREATE TRIGGER trg_touch_guest_invitations
  BEFORE UPDATE ON app.guest_invitations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Default expiry: session ends_at + 7 days; event-only invites +30 days.
-- Java passes NULL expires_at to inherit this default.
CREATE OR REPLACE FUNCTION app.default_guest_invitation_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_end timestamptz;
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.session_id IS NOT NULL THEN
    SELECT ends_at INTO v_end FROM app.sessions WHERE id = NEW.session_id;
    NEW.expires_at := COALESCE(v_end, now()) + interval '7 days';
  ELSE
    NEW.expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_guest_expiry ON app.guest_invitations;
CREATE TRIGGER trg_default_guest_expiry
  BEFORE INSERT ON app.guest_invitations
  FOR EACH ROW EXECUTE FUNCTION app.default_guest_invitation_expiry();

CREATE TABLE IF NOT EXISTS app.guest_invitation_students (
  invitation_id uuid NOT NULL REFERENCES app.guest_invitations (id)
                               ON DELETE CASCADE ON UPDATE CASCADE,
  student_id    uuid NOT NULL REFERENCES app.profiles (id)
                               ON DELETE CASCADE ON UPDATE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invitation_id, student_id)
);

CREATE TABLE IF NOT EXISTS app.guest_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid        NOT NULL REFERENCES app.guest_invitations (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  session_hash  text        UNIQUE NOT NULL,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.guest_sessions ADD COLUMN IF NOT EXISTS invitation_id uuid;
ALTER TABLE app.guest_sessions ADD COLUMN IF NOT EXISTS session_hash text;
ALTER TABLE app.guest_sessions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE app.guest_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE app.guest_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz;

COMMENT ON COLUMN app.guest_sessions.session_hash IS 'SHA-256 hex of the guest session cookie. Raw values NEVER stored. 24h TTL.';

CREATE INDEX IF NOT EXISTS guest_sessions_hash_idx
  ON app.guest_sessions (session_hash);
CREATE INDEX IF NOT EXISTS guest_sessions_invitation_idx
  ON app.guest_sessions (invitation_id);
CREATE INDEX IF NOT EXISTS guest_sessions_expiry_idx
  ON app.guest_sessions (expires_at);

-- ============================================================================
-- 8. Report releases — idempotent per (actor, key). Release timestamp default.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.report_releases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text        NOT NULL DEFAULT 'SESSION'
    CHECK (scope IN ('SESSION', 'PROGRAM', 'BATCH')),
  program_id      uuid        NULL REFERENCES app.programs (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  session_id      uuid        NULL REFERENCES app.sessions (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  actor_id        uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  idempotency_key text        NOT NULL,
  released_at     timestamptz NOT NULL DEFAULT now(),
  row_version     integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, idempotency_key),
  CHECK (scope <> 'SESSION' OR session_id IS NOT NULL)
);

ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.report_releases ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE app.report_releases SET row_version = 1 WHERE row_version IS NULL;

-- Idempotency: UNIQUE(actor+key). NULL actor rows are deduped via coalesce index
-- (UNIQUE treats NULLs as distinct, so add a partial safety net for NULL actors).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'app.report_releases'::regclass AND contype = 'u'
                   AND pg_get_constraintdef(oid) ILIKE '%actor_id%idempotency_key%') THEN
    ALTER TABLE app.report_releases ADD CONSTRAINT report_releases_actor_key_unique
      UNIQUE (actor_id, idempotency_key);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS report_releases_null_actor_key_unique
  ON app.report_releases (idempotency_key) WHERE actor_id IS NULL;

CREATE INDEX IF NOT EXISTS report_releases_session_idx
  ON app.report_releases (session_id, released_at DESC);

-- ============================================================================
-- 9. Comment bank — ADMIN_SHARED (all staff) vs TEACHER_PRIVATE (owner only).
-- ============================================================================
CREATE TABLE IF NOT EXISTS app.comment_bank_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text        NOT NULL CHECK (scope IN ('ADMIN_SHARED', 'TEACHER_PRIVATE')),
  owner_id      uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  criterion_key text        NULL,
  text          text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  row_version   integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz NULL,
  CHECK (scope <> 'TEACHER_PRIVATE' OR owner_id IS NOT NULL)
);

ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS criterion_key text;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS row_version integer;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE app.comment_bank_entries ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

UPDATE app.comment_bank_entries SET row_version = 1 WHERE row_version IS NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.comment_bank_entries'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%scope%IN%ADMIN_SHARED%'
             AND conname NOT IN ('comment_bank_entries_scope_phase3_check') LOOP
    -- Drop only narrow/legacy variants, keep Phase3 if already present.
    IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = r.conname LIMIT 1)) NOT ILIKE '%TEACHER_PRIVATE%' THEN
      EXECUTE format('ALTER TABLE app.comment_bank_entries DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'comment_bank_entries_scope_phase3_check'
                   AND conrelid = 'app.comment_bank_entries'::regclass) THEN
    ALTER TABLE app.comment_bank_entries ADD CONSTRAINT comment_bank_entries_scope_phase3_check
      CHECK (scope IN ('ADMIN_SHARED', 'TEACHER_PRIVATE'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS comment_bank_scope_criterion_idx
  ON app.comment_bank_entries (scope, criterion_key)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_comment_bank ON app.comment_bank_entries;
CREATE TRIGGER trg_touch_comment_bank
  BEFORE UPDATE ON app.comment_bank_entries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ============================================================================
-- 10. Grants + RLS deny-all (Java JDBC scoping authoritative; direct Data API denied).
-- ============================================================================
ALTER TABLE app.rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evaluation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evaluation_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.evaluation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.report_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.guest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.guest_invitation_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comment_bank_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  app.rubric_versions, app.rubric_criteria,
  app.evaluation_assignments, app.evaluations, app.evaluation_revisions,
  app.evaluation_scores, app.report_releases,
  app.guest_invitations, app.guest_invitation_students, app.guest_sessions,
  app.comment_bank_entries
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.rubric_versions, app.rubric_criteria,
  app.evaluation_assignments, app.evaluations, app.evaluation_revisions,
  app.evaluation_scores, app.report_releases,
  app.guest_invitations, app.guest_invitation_students, app.guest_sessions,
  app.comment_bank_entries
  TO elevateme_app, app_runtime;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'rubric_versions', 'rubric_criteria',
    'evaluation_assignments', 'evaluations', 'evaluation_revisions',
    'evaluation_scores', 'report_releases',
    'guest_invitations', 'guest_invitation_students', 'guest_sessions',
    'comment_bank_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname = 'app' AND tablename = t AND policyname = 'deny_all') THEN
      EXECUTE format('CREATE POLICY deny_all ON app.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
    END IF;
  END LOOP;
END
$$;

-- ============================================================================
-- 11. Phase3 seed — TEST DOMAINS ONLY (@test.example.com, fake hashes).
-- Idempotent via ON CONFLICT DO NOTHING / WHERE NOT EXISTS.
--   * 1 program + 1 session (phase3-eval-01 / phase3-eval-s1)
--   * 3 students + 1 evaluator (all @test.example.com)
--   * 3 assignments (UNIQUE student+session)
--   * 3 evals: draft partial (3 scores), submitted complete (10 scores),
--     released locked (10 scores + released_revision_id + released_at)
--   * 1 report_releases row (idempotent actor+key)
--   * 1 expired guest invitation (+ student link)
--   * 2 comment bank entries (ADMIN_SHARED + TEACHER_PRIVATE)
-- ============================================================================

-- Institute (reuse di-dev; insert if a bare Phase3 DB has no institute yet).
INSERT INTO app.institutes (id, slug, name, verified)
VALUES ('00000000-0000-0000-0000-000000000001', 'di-dev', 'Diplomatic Impact (dev)', true)
ON CONFLICT (id) DO NOTHING;

-- People (Approved students trigger EM-##### allocation; evaluator for ownership).
INSERT INTO app.profiles (id, email, full_name, role, status, supabase_subject) VALUES
  ('40000000-0000-0000-0000-000000000003', 'phase3-evaluator@test.example.com', 'Phase3 Evaluator', 'evaluator', 'Approved', NULL),
  ('40000000-0000-0000-0000-000000000011', 'phase3-draft@test.example.com',     'Phase3 Draft',     'student',   'Approved', NULL),
  ('40000000-0000-0000-0000-000000000012', 'phase3-submitted@test.example.com', 'Phase3 Submitted', 'student',   'Approved', NULL),
  ('40000000-0000-0000-0000-000000000013', 'phase3-released@test.example.com',  'Phase3 Released',  'student',   'Approved', NULL)
ON CONFLICT (id) DO NOTHING;

-- Program + session (past session so release + expiry cases read naturally).
INSERT INTO app.programs (id, slug, title, program_type, subtype, themes,
  institute_id, owner_id, venue, capacity, visibility, lifecycle, description)
VALUES ('40000000-0000-0000-0000-000000000001', 'phase3-eval-01',
  'Phase3 Evaluation Track', 'CONTINUOUS', NULL,
  ARRAY['diplomacy', 'debate'],
  '00000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  'Phase3 Hall', 50, 'INTERNAL', 'PUBLISHED', 'Phase3 seed: 1 session, 3 sheets.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.sessions (id, program_id, slug, title, committee, topic, venue, starts_at, ends_at)
VALUES ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  'phase3-eval-s1', 'Phase3 — Evaluation Session', 'WHO', 'Phase3 seed', 'Phase3 Hall A',
  now() - interval '2 days', now() - interval '2 days' + interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- Assignments (one per student+session, pinned to active v2).
INSERT INTO app.evaluation_assignments (id, student_id, session_id, rubric_version_id, assigned_by)
SELECT x.id, x.student, x.session,
       (SELECT id FROM app.rubric_versions WHERE version = 'v2'),
       '40000000-0000-0000-0000-000000000003'
FROM (VALUES
  ('42000000-0000-0000-0000-000000000011'::uuid, '40000000-0000-0000-0000-000000000011'::uuid, '41000000-0000-0000-0000-000000000001'::uuid),
  ('42000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000012', '41000000-0000-0000-0000-000000000001'),
  ('42000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000013', '41000000-0000-0000-0000-000000000001')
) AS x(id, student, session)
ON CONFLICT (student_id, session_id) DO NOTHING;

-- Evaluations: draft partial / submitted complete / released locked.
INSERT INTO app.evaluations (id, student_id, session_id, program_id, evaluator_id, rubric_version_id, state)
SELECT x.id, x.student_id, x.session_id, x.program_id, x.evaluator_id, v.id, x.state
FROM (VALUES
  ('43000000-0000-0000-0000-000000000011'::uuid, '40000000-0000-0000-0000-000000000011'::uuid,
   '41000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid,
   '40000000-0000-0000-0000-000000000003'::uuid, 'DRAFT'::text),
  ('43000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000012',
   '41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000003', 'SUBMITTED'),
  ('43000000-0000-0000-0000-000000000013', '40000000-0000-0000-0000-000000000013',
   '41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000003', 'LOCKED')
) AS x(id, student_id, session_id, program_id, evaluator_id, state)
CROSS JOIN (SELECT id FROM app.rubric_versions WHERE version = 'v2') AS v
ON CONFLICT (student_id, session_id) DO NOTHING;

-- Revisions: draft (DRAFT, partial) / submitted (SUBMITTED, complete) / released (SUBMITTED, complete).
INSERT INTO app.evaluation_revisions (id, evaluation_id, revision_no, rubric_version_id, state, created_by)
SELECT x.id, x.evaluation_id, x.revision_no, v.id, x.state, x.created_by
FROM (VALUES
  ('43100000-0000-0000-0000-000000000011'::uuid, '43000000-0000-0000-0000-000000000011'::uuid, 1,
   'DRAFT'::text, '40000000-0000-0000-0000-000000000003'::uuid),
  ('43100000-0000-0000-0000-000000000012', '43000000-0000-0000-0000-000000000012', 1,
   'SUBMITTED', '40000000-0000-0000-0000-000000000003'),
  ('43100000-0000-0000-0000-000000000013', '43000000-0000-0000-0000-000000000013', 1,
   'SUBMITTED', '40000000-0000-0000-0000-000000000003')
) AS x(id, evaluation_id, revision_no, state, created_by)
CROSS JOIN (SELECT id FROM app.rubric_versions WHERE version = 'v2') AS v
ON CONFLICT (id) DO NOTHING;

-- Scores: draft partial (3/10 — blank != zero, never coerced); submitted + released complete (10/10 INT 0-100).
INSERT INTO app.evaluation_scores (revision_id, criterion_key, score)
SELECT r.id, s.key, s.score FROM (VALUES
  -- Draft partial: only 3 criteria scored (allowed in DRAFT; SUBMIT would 422).
  ('43100000-0000-0000-0000-000000000011'::uuid, 'preparation'::text, 70),
  ('43100000-0000-0000-0000-000000000011', 'clarity', 75),
  ('43100000-0000-0000-0000-000000000011', 'confidence', 80),
  -- Submitted complete: 10x70 = 700 total, avg 70.
  ('43100000-0000-0000-0000-000000000012', 'preparation', 70),
  ('43100000-0000-0000-0000-000000000012', 'clarity', 70),
  ('43100000-0000-0000-0000-000000000012', 'confidence', 70),
  ('43100000-0000-0000-0000-000000000012', 'focus', 70),
  ('43100000-0000-0000-0000-000000000012', 'critical_analysis', 70),
  ('43100000-0000-0000-0000-000000000012', 'sound', 70),
  ('43100000-0000-0000-0000-000000000012', 'audience_addressing', 70),
  ('43100000-0000-0000-0000-000000000012', 'counter_arguments', 70),
  ('43100000-0000-0000-0000-000000000012', 'wit', 70),
  ('43100000-0000-0000-0000-000000000012', 'overall_performance', 70),
  -- Released locked: 10x80 = 800 total, avg 80.
  ('43100000-0000-0000-0000-000000000013', 'preparation', 80),
  ('43100000-0000-0000-0000-000000000013', 'clarity', 80),
  ('43100000-0000-0000-0000-000000000013', 'confidence', 80),
  ('43100000-0000-0000-0000-000000000013', 'focus', 80),
  ('43100000-0000-0000-0000-000000000013', 'critical_analysis', 80),
  ('43100000-0000-0000-0000-000000000013', 'sound', 80),
  ('43100000-0000-0000-0000-000000000013', 'audience_addressing', 80),
  ('43100000-0000-0000-0000-000000000013', 'counter_arguments', 80),
  ('43100000-0000-0000-0000-000000000013', 'wit', 80),
  ('43100000-0000-0000-0000-000000000013', 'overall_performance', 80)
) AS s(id, key, score)
JOIN app.evaluation_revisions r ON r.id = s.id
ON CONFLICT (revision_id, criterion_key) DO NOTHING;

-- Point the LOCKED sheet at its released revision (deferrable FK allows this ordering).
-- Idempotent: only fills NULL, never rewrites an existing release pointer.
UPDATE app.evaluations
   SET released_revision_id = '43100000-0000-0000-0000-000000000013',
       released_at = COALESCE(released_at, now() - interval '1 day')
 WHERE id = '43000000-0000-0000-0000-000000000013'
   AND released_revision_id IS NULL;

-- Idempotent release row for the session (actor+key UNIQUE).
INSERT INTO app.report_releases (id, scope, program_id, session_id, actor_id, idempotency_key)
VALUES ('44000000-0000-0000-0000-000000000001', 'SESSION',
  '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003', 'phase3-release-s1-001')
ON CONFLICT (id) DO NOTHING;

-- Expired guest invitation (yesterday) to the Phase3 session.
-- token_hash is a fake placeholder, never a raw token.
INSERT INTO app.guest_invitations (id, scope, program_id, session_id, token_hash,
  scope_details, expires_at, created_by)
VALUES ('45000000-0000-0000-0000-000000000001', 'SESSION',
  '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
  'PHASE3-EXPIRED-HASH-001-not-a-real-token',
  '{"students": ["40000000-0000-0000-0000-000000000013"], "permissions": ["view"]}',
  now() - interval '1 day',
  '40000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.guest_invitation_students (invitation_id, student_id)
VALUES ('45000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000013')
ON CONFLICT DO NOTHING;

-- Comment bank: 1 shared + 1 private (TEACHER_PRIVATE requires owner).
INSERT INTO app.comment_bank_entries (id, scope, owner_id, criterion_key, text)
VALUES
  ('46000000-0000-0000-0000-000000000001', 'ADMIN_SHARED',
   '40000000-0000-0000-0000-000000000003', 'preparation',
   'Phase3 snippet (shared): open with a one-line roadmap, then pause.'),
  ('46000000-0000-0000-0000-000000000002', 'TEACHER_PRIVATE',
   '40000000-0000-0000-0000-000000000003', 'sound',
   'Phase3 snippet (private): project to the back row; vary pace for emphasis.')
ON CONFLICT (id) DO NOTHING;
