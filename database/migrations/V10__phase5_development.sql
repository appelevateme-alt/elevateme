-- ============================================================================
-- ElevateMe Flyway V10 — Phase 5 growth support hardening
-- Postgres 14 compatible. Idempotent. Depends on V1–V9 (safe on skeleton DBs
-- that only have V1: every statement is IF NOT EXISTS / guarded).
--
-- Goals (spec §9 admin + §10 + §11, Phase 5 backend):
--   * recommendations: widen priority vocab to HIGH|MED|LOW (keeps the V4
--     display values for backward compat) + action/reason/skill_area/due_date/
--     linked_report columns. target_snapshot (V4 jsonb) already freezes the
--     audience at publish time; recipients freeze per-student rows.
--   * recommendation_recipients: per-recipient note for PATCH.
--   * query_threads/messages: linked program/report, idempotency key, official
--     reply versioning (version + supersedes link; history rows are never
--     updated in place — Java inserts a new row).
--   * development_events: admin-created growth opportunities backing onto
--     app.programs (program_id FK). Assignments/re-registrations reuse V4
--     app.development_assignments; paid holds reuse V4 app.payment_verifications
--     (48h default expiry, no card columns ever).
-- NEVER store card data: no PAN/CVV/expiry/cardholder columns anywhere.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

-- Roles (V1/V5/V6 pattern; must exist for REVOKE/POLICY to parse on vanilla PG).
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

GRANT USAGE ON SCHEMA app TO elevateme_app, app_runtime;

-- ----------------------------------------------------------------------------
-- 1. Recommendations — priority vocab + Phase 5 columns.
-- V4 priority CHECK (priority IN ('High priority', 'In progress', 'Complete'))
-- has a generated constraint name; drop any priority CHECK then add the
-- superset (both vocabs) under an explicit Phase 5 name.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS app.recommendations ADD COLUMN IF NOT EXISTS action text NULL;
ALTER TABLE IF EXISTS app.recommendations ADD COLUMN IF NOT EXISTS reason text NULL;
ALTER TABLE IF EXISTS app.recommendations ADD COLUMN IF NOT EXISTS skill_area text NULL;
ALTER TABLE IF EXISTS app.recommendations ADD COLUMN IF NOT EXISTS due_date timestamptz NULL;
ALTER TABLE IF EXISTS app.recommendations ADD COLUMN IF NOT EXISTS linked_report_id uuid NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('app.recommendations') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'app.recommendations'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%priority%IN%'
             AND conname <> 'recommendations_priority_phase5_check' LOOP
    EXECUTE format('ALTER TABLE app.recommendations DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'recommendations_priority_phase5_check'
                   AND conrelid = 'app.recommendations'::regclass) THEN
    ALTER TABLE app.recommendations ADD CONSTRAINT recommendations_priority_phase5_check
      CHECK (priority IS NULL OR priority IN (
        'High priority', 'In progress', 'Complete',
        'HIGH', 'MED', 'LOW'));
  END IF;
END
$$;

ALTER TABLE IF EXISTS app.recommendation_recipients ADD COLUMN IF NOT EXISTS note text NULL;

-- ----------------------------------------------------------------------------
-- 2. Query threads/messages — links + idempotency + reply versioning.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS app.query_threads ADD COLUMN IF NOT EXISTS linked_program_id uuid NULL;
ALTER TABLE IF EXISTS app.query_threads ADD COLUMN IF NOT EXISTS linked_report_id uuid NULL;
ALTER TABLE IF EXISTS app.query_threads ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

ALTER TABLE IF EXISTS app.query_messages ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE IF EXISTS app.query_messages ADD COLUMN IF NOT EXISTS supersedes_id uuid NULL;
ALTER TABLE IF EXISTS app.query_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL;

-- One idempotency key per student: same key + same payload replays, same key +
-- differing payload is a 409 (Java enforces via IdempotencyService; this index
-- is the durable backstop).
CREATE UNIQUE INDEX IF NOT EXISTS query_threads_student_idem_unique
  ON app.query_threads (student_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND archived_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Development events — admin-created opportunities backing onto programs.
-- billing_type FREE|PAID. Paid rows carry price/currency + external HTTPS
-- payment URL (Java enforces https://). Partner + deadline optional.
-- Capacity mirrors app.programs.capacity (Java keeps them in sync).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.development_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id    uuid        UNIQUE NOT NULL REFERENCES app.programs (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  details       text        NOT NULL,
  event_date    timestamptz NULL,
  capacity      integer     NOT NULL CHECK (capacity >= 1),
  billing_type  text        NOT NULL DEFAULT 'FREE'
    CHECK (billing_type IN ('FREE', 'PAID')),
  price         numeric     NULL CHECK (price IS NULL OR price > 0),
  currency      text        NULL,
  payment_url   text        NULL,
  partner       text        NULL,
  deadline      timestamptz NULL,
  created_by    uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version   integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz NULL,
  CHECK (billing_type = 'FREE' OR (price IS NOT NULL AND currency IS NOT NULL
    AND payment_url IS NOT NULL))
);

ALTER TABLE app.development_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.development_events FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_touch_development_events ON app.development_events;
CREATE TRIGGER trg_touch_development_events
  BEFORE UPDATE ON app.development_events
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX IF NOT EXISTS development_events_program_idx
  ON app.development_events (program_id) WHERE archived_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Grants + RLS deny-all on touched tables (Java JDBC scoping authoritative).
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE app.development_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.development_events
  TO elevateme_app, app_runtime;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['recommendations', 'recommendation_recipients',
    'query_threads', 'query_messages', 'development_events',
    'development_assignments', 'payment_verifications'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('app.%s', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
      IF NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'app' AND tablename = t AND policyname = 'deny_all') THEN
        EXECUTE format('CREATE POLICY deny_all ON app.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
      END IF;
    END IF;
  END LOOP;
END
$$;

COMMENT ON TABLE app.development_events IS 'Phase 5: admin-created development opportunities backing onto app.programs. Paid rows use an EXTERNAL payment URL only; card data is never stored.';
