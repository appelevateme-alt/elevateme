-- ============================================================================
-- ElevateMe Flyway V4 — growth & support
-- Postgres 14 compatible. Depends on V1–V3.
--
-- Legacy reference (read-only): supabase/migrations/002_participation.sql
-- (recommendations, message_threads/replies, audit_log append-only).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Recommendations: admin-authored content + frozen target snapshot JSON.
-- target_snapshot captures audience/rules at publish time so later edits to
-- cohorts do not rewrite history. Delivery/completion tracked per recipient.
-- Pin: at most 3 pinned per student (pinned_order 1..3), enforced in Java
-- (count pinned in the same txn; DB CHECK only bounds the column).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.recommendations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  body            text        NOT NULL,
  skill_tag       text        NULL,
  priority        text        NULL CHECK (priority IN ('High priority', 'In progress', 'Complete')),
  target_snapshot jsonb       NOT NULL DEFAULT '{}',
  created_by      uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  row_version     integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz NULL
);
ALTER TABLE app.recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.recommendations FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_touch_recommendations ON app.recommendations;
CREATE TRIGGER trg_touch_recommendations
  BEFORE UPDATE ON app.recommendations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.recommendation_recipients (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid        NOT NULL REFERENCES app.recommendations (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  student_id        uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  viewed_at         timestamptz NULL,
  completed_at      timestamptz NULL,
  completed_by      uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  pinned_order      integer     NULL CHECK (pinned_order BETWEEN 1 AND 3),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, recommendation_id),
  CHECK (completed_at IS NULL OR completed_by IS NOT NULL)
);
ALTER TABLE app.recommendation_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.recommendation_recipients FROM PUBLIC;

-- Spec section 10 — recipient dashboards: by student + completion.
CREATE INDEX IF NOT EXISTS recommendation_recipients_student_completion_idx
  ON app.recommendation_recipients (student_id, completed_at);
CREATE INDEX IF NOT EXISTS recommendation_recipients_recommendation_idx
  ON app.recommendation_recipients (recommendation_id);

DROP TRIGGER IF EXISTS trg_touch_recommendation_recipients ON app.recommendation_recipients;
CREATE TRIGGER trg_touch_recommendation_recipients
  BEFORE UPDATE ON app.recommendation_recipients
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Development assignments: student -> program growth track + reason/state.
-- One active row per (student, program); archived rows allow re-assignment.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.development_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  program_id  uuid        NOT NULL REFERENCES app.programs (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  reason      text        NOT NULL DEFAULT '',
  state       text        NOT NULL DEFAULT 'ASSIGNED'
    CHECK (state IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REMOVED')),
  assigned_by uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  row_version integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CHECK (completed_at IS NULL OR state = 'COMPLETED')
);
ALTER TABLE app.development_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.development_assignments FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS development_assignments_student_program_unique
  ON app.development_assignments (student_id, program_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS development_assignments_student_idx
  ON app.development_assignments (student_id);

DROP TRIGGER IF EXISTS trg_touch_development_assignments ON app.development_assignments;
CREATE TRIGGER trg_touch_development_assignments
  BEFORE UPDATE ON app.development_assignments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Payment verifications: offline/bank-transfer proof attached to a registration.
-- NEVER store card fields (no PAN, CVV, expiry, cardholder). Only an external
-- reference (slip no. / txn id), state machine, 48h expiry, verifier.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.payment_verifications (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id    uuid        NOT NULL REFERENCES app.registrations (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  external_reference text        NOT NULL,
  state              text        NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  verified_by        uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  verified_at        timestamptz NULL,
  reject_reason      text        NULL,
  row_version        integer     NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_at IS NULL OR state IN ('VERIFIED', 'REJECTED')),
  CHECK (state <> 'REJECTED' OR reject_reason IS NOT NULL)
);
ALTER TABLE app.payment_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.payment_verifications FROM PUBLIC;

CREATE INDEX IF NOT EXISTS payment_verifications_registration_idx
  ON app.payment_verifications (registration_id);
CREATE INDEX IF NOT EXISTS payment_verifications_state_expiry_idx
  ON app.payment_verifications (state, expires_at);

DROP TRIGGER IF EXISTS trg_touch_payment_verifications ON app.payment_verifications;
CREATE TRIGGER trg_touch_payment_verifications
  BEFORE UPDATE ON app.payment_verifications
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Query threads + messages: student/parent <-> DI support.
-- initiator: who opened it (STUDENT | PARENT | DI). DI-initiated threads start
-- in AWAITING_STUDENT_RESPONSE. selected_view stores parent "view as child"
-- metadata JSON (e.g. {"student_id": "…"}), never trusted for authz — Java
-- re-checks parent_links-equivalent (institute_memberships / profile link).
-- awaiting_admin_reply drives the staff queue; closed_at/reopened_at +
-- close_count model close/reopen. Legacy Open|Replied|Closed maps to
-- IN_REVIEW (open/working) | ANSWERED | CLOSED.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.query_threads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  subject              text        NOT NULL,
  initiator            text        NOT NULL
    CHECK (initiator IN ('STUDENT', 'PARENT', 'DI')),
  initiator_profile_id uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  selected_view        jsonb       NOT NULL DEFAULT '{}',
  status               text        NOT NULL DEFAULT 'IN_REVIEW'
    CHECK (status IN ('IN_REVIEW', 'ANSWERED', 'CLOSED', 'AWAITING_STUDENT_RESPONSE')),
  awaiting_admin_reply boolean     NOT NULL DEFAULT true,
  closed_at            timestamptz NULL,
  reopened_at          timestamptz NULL,
  close_count          integer     NOT NULL DEFAULT 0 CHECK (close_count >= 0),
  row_version          integer     NOT NULL DEFAULT 1,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz NULL,
  CHECK (status <> 'CLOSED' OR closed_at IS NOT NULL)
);
ALTER TABLE app.query_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.query_threads FROM PUBLIC;

-- Spec section 10 — staff + student queues.
CREATE INDEX IF NOT EXISTS query_threads_student_status_updated_idx
  ON app.query_threads (student_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS query_threads_awaiting_admin_idx
  ON app.query_threads (awaiting_admin_reply, updated_at DESC)
  WHERE awaiting_admin_reply AND archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_query_threads ON app.query_threads;
CREATE TRIGGER trg_touch_query_threads
  BEFORE UPDATE ON app.query_threads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.query_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES app.query_threads (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  author_id   uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  author_type text        NOT NULL CHECK (author_type IN ('STUDENT', 'PARENT', 'COORDINATOR', 'EVALUATOR', 'ADMIN', 'SYSTEM')),
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.query_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.query_messages FROM PUBLIC;

CREATE INDEX IF NOT EXISTS query_messages_thread_chrono_idx
  ON app.query_messages (thread_id, created_at);

-- ----------------------------------------------------------------------------
-- Notifications (in-app) + outbox (email/relay with retry).
-- Notification dedupe: UNIQUE(recipient, type, entity, entity_version) so a
-- re-emitted domain event does not double-notify. read_at = engagement.
-- Outbox dedupe: dedupe_key UNIQUE; email_state PENDING -> SENT/FAILED with
-- retry_count + next_retry_at for the relay worker (SKIP LOCKED polling).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.notifications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id   uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE CASCADE ON UPDATE CASCADE,
  type           text        NOT NULL,
  entity_type    text        NOT NULL,
  entity_id      text        NOT NULL,
  entity_version integer     NOT NULL DEFAULT 1,
  payload        jsonb       NOT NULL DEFAULT '{}',
  read_at        timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, type, entity_type, entity_id, entity_version)
);
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.notifications FROM PUBLIC;

-- Spec section 10 — inbox queries.
CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx
  ON app.notifications (recipient_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS app.outbox_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text        NOT NULL,
  aggregate_id   text        NOT NULL,
  event_type     text        NOT NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  dedupe_key     text        UNIQUE NOT NULL,
  email_state    text        NOT NULL DEFAULT 'PENDING'
    CHECK (email_state IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  retry_count    integer     NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz NULL,
  claimed_by     text        NULL,
  sent_at        timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (sent_at IS NULL OR email_state = 'SENT')
);
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.outbox_events FROM PUBLIC;

-- Spec section 10 — relay worker poll: oldest due PENDING first.
CREATE INDEX IF NOT EXISTS outbox_pending_retry_idx
  ON app.outbox_events (next_retry_at)
  WHERE email_state = 'PENDING';

-- ----------------------------------------------------------------------------
-- Criterion alerts: low-score watchlist feeding DI follow-up.
-- Exactly one ACTIVE row per (student, criterion): partial UNIQUE
-- WHERE resolved_at IS NULL. evidence_revision_id pins the triggering sheet
-- revision. acknowledged_at (seen) vs resolved_at (actioned) are separate.
-- Threshold default 30 (seed covers 28 -> alert, 30 -> no alert).
-- Alert strictly < 30 (30 does NOT alert, 29 does); resolve >= 30 per spec §6
-- (30+ resolves, 29 stays active) + docs/INSIGHTS.md.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.criterion_alerts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid        NOT NULL REFERENCES app.profiles (id)
                                         ON DELETE RESTRICT ON UPDATE CASCADE,
  criterion_key        text        NOT NULL
    CHECK (criterion_key IN ('preparation', 'clarity', 'confidence', 'focus',
      'critical_analysis', 'sound', 'audience_addressing',
      'counter_arguments', 'wit', 'overall_performance')),
  session_id           uuid        NULL REFERENCES app.sessions (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  evidence_revision_id uuid        NULL REFERENCES app.evaluation_revisions (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  score                integer     NOT NULL CHECK (score >= 0 AND score <= 100),
  threshold            integer     NOT NULL DEFAULT 30 CHECK (threshold BETWEEN 0 AND 100),
  acknowledged_at      timestamptz NULL,
  acknowledged_by      uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  resolved_at          timestamptz NULL,
  resolved_note        text        NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (score < threshold),
  CHECK (resolved_at IS NULL OR resolved_note IS NOT NULL)
);
ALTER TABLE app.criterion_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.criterion_alerts FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS criterion_alerts_active_unique
  ON app.criterion_alerts (student_id, criterion_key)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS criterion_alerts_student_idx
  ON app.criterion_alerts (student_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Comment bank: reusable evaluator snippets.
-- scope ADMIN_SHARED (all staff) vs TEACHER_PRIVATE (owner only; Java enforces
-- owner visibility, RLS stays deny-by-default). criterion_key tags the entry;
-- archived_at retires without deleting history.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.comment_bank_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text        NOT NULL CHECK (scope IN ('ADMIN_SHARED', 'TEACHER_PRIVATE')),
  owner_id      uuid        NULL REFERENCES app.profiles (id)
                                         ON DELETE SET NULL ON UPDATE CASCADE,
  criterion_key text        NULL
    CHECK (criterion_key IS NULL OR criterion_key IN ('preparation', 'clarity',
      'confidence', 'focus', 'critical_analysis', 'sound',
      'audience_addressing', 'counter_arguments', 'wit', 'overall_performance')),
  text          text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  row_version   integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz NULL,
  CHECK (scope <> 'TEACHER_PRIVATE' OR owner_id IS NOT NULL)
);
ALTER TABLE app.comment_bank_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.comment_bank_entries FROM PUBLIC;

CREATE INDEX IF NOT EXISTS comment_bank_scope_criterion_idx
  ON app.comment_bank_entries (scope, criterion_key)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_comment_bank ON app.comment_bank_entries;
CREATE TRIGGER trg_touch_comment_bank
  BEFORE UPDATE ON app.comment_bank_entries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Audit events: append-only. Actor type + ID, action, entity triplet, safe
-- before/after JSON (Java MUST strip secrets/PII beyond IDs), request ID for
-- tracing, timestamptz. UPDATE/DELETE rejected by trigger (mirrors legacy
-- guard_audit_immutable in 004_logic.sql).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.audit_events (
  id          bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_type  text        NOT NULL
    CHECK (actor_type IN ('STUDENT', 'PARENT', 'COORDINATOR', 'EVALUATOR', 'ADMIN', 'SYSTEM', 'GUEST')),
  actor_id    uuid        NULL,
  action      text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   text        NULL,
  before_data jsonb       NOT NULL DEFAULT '{}',
  after_data  jsonb       NOT NULL DEFAULT '{}',
  request_id  text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.audit_events FROM PUBLIC;

CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON app.audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx  ON app.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON app.audit_events (action, created_at DESC);

CREATE OR REPLACE FUNCTION app.guard_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'app.audit_events is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_audit_immutable ON app.audit_events;
CREATE TRIGGER trg_guard_audit_immutable
  BEFORE UPDATE OR DELETE ON app.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.guard_audit_immutable();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.recommendations, app.recommendation_recipients,
  app.development_assignments, app.payment_verifications,
  app.query_threads, app.query_messages,
  app.notifications, app.outbox_events,
  app.criterion_alerts, app.comment_bank_entries
  TO elevateme_app;
-- Audit: insert + select only (no update/delete even for the app role).
GRANT SELECT, INSERT ON TABLE app.audit_events TO elevateme_app;
