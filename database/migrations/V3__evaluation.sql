-- ============================================================================
-- ElevateMe Flyway V3 — evaluation
-- Postgres 14 compatible. Depends on V1 (profiles) + V2 (programs, sessions).
--
-- Legacy reference (read-only):
--   supabase/migrations/002_participation.sql (evaluations, evaluation_scores,
--     evaluation_templates single-active) and 005_scoring_rework.sql
--     (10 x 0-100, total/1000, final/10).
-- Preserves the 10-criterion model; replaces the free-form template with a
-- versioned rubric + ordered criteria, revisioned sheets, idempotent releases,
-- and hashed guest access.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Rubric versions: one active at a time (mirrors legacy single-active index).
-- Definitions are placeholders owned by DI — seed text here is structural only.
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.rubric_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.rubric_versions FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS rubric_versions_single_active
  ON app.rubric_versions (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS trg_touch_rubric_versions ON app.rubric_versions;
CREATE TRIGGER trg_touch_rubric_versions
  BEFORE UPDATE ON app.rubric_versions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Rubric criteria: 10 stable keys in fixed display order, bounds 0-100.
-- Keys (sort_order in parentheses):
--   preparation(1), clarity(2), confidence(3), focus(4), critical_analysis(5),
--   sound(6), audience_addressing(7), counter_arguments(8), wit(9),
--   overall_performance(10).
-- `definition` is a DI-owned placeholder; Java treats '' as "needs copy".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.rubric_criteria (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_version_id uuid        NOT NULL REFERENCES app.rubric_versions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  criterion_key     text        NOT NULL
    CHECK (criterion_key IN ('preparation', 'clarity', 'confidence', 'focus',
      'critical_analysis', 'sound', 'audience_addressing',
      'counter_arguments', 'wit', 'overall_performance')),
  sort_order        integer     NOT NULL CHECK (sort_order BETWEEN 1 AND 10),
  min_score         integer     NOT NULL DEFAULT 0 CHECK (min_score >= 0),
  max_score         integer     NOT NULL DEFAULT 100 CHECK (max_score <= 100),
  definition        text        NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rubric_version_id, criterion_key),
  UNIQUE (rubric_version_id, sort_order),
  CHECK (min_score <= max_score)
);
ALTER TABLE app.rubric_criteria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.rubric_criteria FROM PUBLIC;

-- Reference data: canonical v2 rubric + ordered criteria (idempotent).
INSERT INTO app.rubric_versions (version, is_active, effective_from)
VALUES ('v2', true, now())
ON CONFLICT (version) DO NOTHING;

-- Insert criteria via the resolved v2 id; DO NOTHING keeps re-runs safe.
INSERT INTO app.rubric_criteria (rubric_version_id, criterion_key, sort_order, definition)
SELECT v.id, k.key, k.ord, 'DI definition placeholder for ' || k.key
FROM app.rubric_versions v
CROSS JOIN (VALUES
  ('preparation', 1), ('clarity', 2), ('confidence', 3), ('focus', 4),
  ('critical_analysis', 5), ('sound', 6), ('audience_addressing', 7),
  ('counter_arguments', 8), ('wit', 9), ('overall_performance', 10)
) AS k(key, ord)
WHERE v.version = 'v2'
ON CONFLICT (rubric_version_id, criterion_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Evaluation assignments: which student owes a sheet in which session,
-- under which rubric version. One active assignment per (student, session).
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.evaluation_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.evaluation_assignments FROM PUBLIC;

CREATE INDEX IF NOT EXISTS evaluation_assignments_session_idx
  ON app.evaluation_assignments (session_id);

DROP TRIGGER IF EXISTS trg_touch_evaluation_assignments ON app.evaluation_assignments;
CREATE TRIGGER trg_touch_evaluation_assignments
  BEFORE UPDATE ON app.evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Evaluations: one live row per (student, session). History via revisions.
--   rubric_version_id: version the live sheet was written against.
--   state: DRAFT | SUBMITTED | LOCKED (LOCKED = released, read-only).
--   released_revision_id: the exact revision students/parents/guests may see
--     (set by report_release application in Java; NULL until released).
--   correction_reason: required when a LOCKED sheet is superseded by a new
--     revision (audit rationale, nullable otherwise).
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.evaluations FROM PUBLIC;

-- Spec section 10 — student/session chronology (student dashboards, transcripts).
CREATE INDEX IF NOT EXISTS evaluations_student_chrono_idx
  ON app.evaluations (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluations_session_state_idx
  ON app.evaluations (session_id, state);
CREATE INDEX IF NOT EXISTS evaluations_program_idx
  ON app.evaluations (program_id);

DROP TRIGGER IF EXISTS trg_touch_evaluations ON app.evaluations;
CREATE TRIGGER trg_touch_evaluations
  BEFORE UPDATE ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Evaluation revisions: every SUBMIT is a new immutable revision_no.
-- Corrections create revision_no + 1 with correction_reason; the parent
-- evaluation flips LOCKED -> DRAFT -> SUBMITTED -> LOCKED again in Java.
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.evaluation_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.evaluation_revisions FROM PUBLIC;

CREATE INDEX IF NOT EXISTS evaluation_revisions_evaluation_idx
  ON app.evaluation_revisions (evaluation_id, revision_no DESC);

-- Back-reference: released_revision_id -> revisions (added after both exist;
-- NOT VALID-style safety: nullable FK, validated by Java + DEFERRABLE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_released_revision_fk'
  ) THEN
    ALTER TABLE app.evaluations
      ADD CONSTRAINT evaluations_released_revision_fk
      FOREIGN KEY (released_revision_id)
      REFERENCES app.evaluation_revisions (id)
      ON DELETE SET NULL ON UPDATE CASCADE
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Evaluation scores: one row per (revision, criterion). INT 0-100, never NULL.
-- "No NULL on submitted enforced at app + partial constraint note":
-- Postgres cannot express "a SUBMITTED revision must have exactly the 10
-- active criteria" as a static CHECK (the set is dynamic), so:
--   * DB guarantees: per-row INT bounds + UNIQUE(revision, criterion).
--   * Java guarantees: DRAFT -> SUBMITTED only when count(scores) = 10 and
--     every criterion_key of the revision's rubric version is present.
--   * Optional hardening (commented): a trigger that counts on state change.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.evaluation_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id    uuid        NOT NULL REFERENCES app.evaluation_revisions (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  criterion_key  text        NOT NULL
    CHECK (criterion_key IN ('preparation', 'clarity', 'confidence', 'focus',
      'critical_analysis', 'sound', 'audience_addressing',
      'counter_arguments', 'wit', 'overall_performance')),
  score          integer     NOT NULL CHECK (score >= 0 AND score <= 100),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (revision_id, criterion_key)
);
ALTER TABLE app.evaluation_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.evaluation_scores FROM PUBLIC;

CREATE INDEX IF NOT EXISTS evaluation_scores_revision_idx
  ON app.evaluation_scores (revision_id);

-- Optional hardening sketch (left disabled: needs per-version count lookup):
-- CREATE OR REPLACE FUNCTION app.require_complete_scores() RETURNS trigger ...
-- IF NEW.state = 'SUBMITTED' AND (SELECT count(*) FROM app.evaluation_scores
--   WHERE revision_id = NEW.id) <> 10 THEN RAISE EXCEPTION ...; END IF;

-- ----------------------------------------------------------------------------
-- Report releases: releasing a session (or batch) is idempotent per actor.
-- Java inserts with a client-generated idempotency_key; retries reuse it
-- (ON CONFLICT DO NOTHING -> return prior release).
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.report_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.report_releases FROM PUBLIC;

CREATE INDEX IF NOT EXISTS report_releases_session_idx
  ON app.report_releases (session_id, released_at DESC);

-- ----------------------------------------------------------------------------
-- Guest invitations + guest sessions. Tokens are NEVER stored raw:
-- only token_hash (UNIQUE). Scope EVENT (whole program) or SESSION
-- (one session). Assigned students via join table.
-- Expiry default = session ends_at + 7 days (trigger when NULL); program-
-- scoped invites without a session fall back to +30 days. Revocation via
-- revoked_at (NULL = live). Guest sessions are short-TTL hashed cookies.
-- ----------------------------------------------------------------------------
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
ALTER TABLE app.guest_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.guest_invitations FROM PUBLIC;

-- Spec section 10 — invite lookup by token hash (constant-time in Java via
-- sha256 hex; index makes it O(log n)).
CREATE INDEX IF NOT EXISTS guest_invitations_token_hash_idx
  ON app.guest_invitations (token_hash);
CREATE INDEX IF NOT EXISTS guest_invitations_session_idx
  ON app.guest_invitations (session_id);

DROP TRIGGER IF EXISTS trg_touch_guest_invitations ON app.guest_invitations;
CREATE TRIGGER trg_touch_guest_invitations
  BEFORE UPDATE ON app.guest_invitations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Default expiry: session end + 7 days; event-only invites +30 days.
CREATE OR REPLACE FUNCTION app.default_guest_invitation_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
ALTER TABLE app.guest_invitation_students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.guest_invitation_students FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app.guest_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid        NOT NULL REFERENCES app.guest_invitations (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  session_hash  text        UNIQUE NOT NULL,
  -- Short TTL: 24h from creation, sliding on use (Java refreshes last_seen_at).
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.guest_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.guest_sessions FROM PUBLIC;

CREATE INDEX IF NOT EXISTS guest_sessions_hash_idx
  ON app.guest_sessions (session_hash);
CREATE INDEX IF NOT EXISTS guest_sessions_invitation_idx
  ON app.guest_sessions (invitation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.rubric_versions, app.rubric_criteria,
  app.evaluation_assignments, app.evaluations, app.evaluation_revisions,
  app.evaluation_scores, app.report_releases,
  app.guest_invitations, app.guest_invitation_students, app.guest_sessions
  TO elevateme_app;
