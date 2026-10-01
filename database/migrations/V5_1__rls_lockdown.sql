-- ============================================================================
-- ElevateMe Flyway V5.1 — RLS lockdown (Phase 1c exit criteria)
-- Deny-by-default: Java JDBC scoping is authoritative; direct Data API denied.
-- Least-privilege: app_runtime has USAGE on schema + DML only (no DDL).
-- No service-role credentials in repo (deployed via env/secret manager only).
-- Postgres 14 compatible. Depends on V1–V4.
-- ============================================================================

-- Roles ensured IF NOT EXISTS (V6/V8/V10 pattern; anon/authenticated are
-- Supabase Data API roles that must exist for REVOKE/POLICY to parse on
-- vanilla PG14). Least-privilege runtime roles are NOLOGIN placeholders;
-- password/GRANT admin via ops.
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

-- Schema usage for runtimes (no CREATE / DDL).
GRANT USAGE ON SCHEMA app TO app_runtime;
GRANT USAGE ON SCHEMA app TO elevateme_app;

-- ----------------------------------------------------------------------------
-- Deny-by-default for Supabase Data API roles.
-- anon + authenticated must have NO privileges on app.* — all reads/writes go
-- through the Java backend (verified Supabase JWT -> JDBC scoped by subject).
-- Java JDBC scoping is authoritative; direct Data API denied.
-- ----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA app FROM anon, authenticated;
GRANT USAGE ON SCHEMA app TO app_runtime;

-- Revoke table-level privileges from anon/authenticated (explicit, idempotent).
REVOKE ALL ON TABLE
  app.institutes, app.profiles, app.institute_memberships,
  app.programs, app.sessions, app.registrations, app.session_attendance,
  app.rubric_versions, app.rubric_criteria,
  app.evaluation_assignments, app.evaluations, app.evaluation_revisions,
  app.evaluation_scores, app.report_releases,
  app.guest_invitations, app.guest_invitation_students, app.guest_sessions,
  app.recommendations, app.recommendation_recipients,
  app.development_assignments, app.payment_verifications,
  app.query_threads, app.query_messages,
  app.notifications, app.outbox_events,
  app.criterion_alerts, app.comment_bank_entries,
  app.audit_events
FROM anon, authenticated;

-- Revoke sequence usage from anon/authenticated; runtime keeps least-privilege.
REVOKE ALL ON SEQUENCE app.elevate_me_seq FROM anon, authenticated, PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE app.elevate_me_seq TO app_runtime;

-- Runtime DML only (no DDL: no CREATE/ALTER/DROP/TRUNCATE, no ownership change).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app.institutes, app.profiles, app.institute_memberships,
  app.programs, app.sessions, app.registrations, app.session_attendance,
  app.rubric_versions, app.rubric_criteria,
  app.evaluation_assignments, app.evaluations, app.evaluation_revisions,
  app.evaluation_scores, app.report_releases,
  app.guest_invitations, app.guest_invitation_students, app.guest_sessions,
  app.recommendations, app.recommendation_recipients,
  app.development_assignments, app.payment_verifications,
  app.query_threads, app.query_messages,
  app.notifications, app.outbox_events,
  app.criterion_alerts, app.comment_bank_entries
  TO app_runtime;
-- Audit: insert + select only (append-only; guard trigger rejects UPDATE/DELETE).
GRANT SELECT, INSERT ON TABLE app.audit_events TO app_runtime;

-- ----------------------------------------------------------------------------
-- RLS: enabled on all app tables + DENY ALL policies (USING false).
-- Comment: Java JDBC scoping is authoritative; direct Data API denied.
-- NOTE: RLS policies apply to anon/authenticated (and PUBLIC). The Java backend
-- connects as elevateme_app / app_runtime (table owners bypass RLS as owners
-- only if owner; otherwise JDBC scoping enforces ownership in SQL WHERE clauses).
-- DENY ALL ensures even if a Data API key is leaked, no rows are visible.
-- ----------------------------------------------------------------------------
ALTER TABLE app.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.institute_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_attendance ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE app.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recommendation_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.development_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.query_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.query_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.criterion_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comment_bank_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;

-- Helper to (re)create deny-all policies idempotently.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'institutes', 'profiles', 'institute_memberships',
    'programs', 'sessions', 'registrations', 'session_attendance',
    'rubric_versions', 'rubric_criteria',
    'evaluation_assignments', 'evaluations', 'evaluation_revisions',
    'evaluation_scores', 'report_releases',
    'guest_invitations', 'guest_invitation_students', 'guest_sessions',
    'recommendations', 'recommendation_recipients',
    'development_assignments', 'payment_verifications',
    'query_threads', 'query_messages',
    'notifications', 'outbox_events',
    'criterion_alerts', 'comment_bank_entries',
    'audit_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON app.%I', t);
    -- Java JDBC scoping is authoritative; direct Data API denied.
    EXECUTE format(
      'CREATE POLICY deny_all ON app.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t);
    EXECUTE format(
      'COMMENT ON POLICY deny_all ON app.%I IS %L',
      t, 'Java JDBC scoping is authoritative; direct Data API denied');
  END LOOP;
END
$$;

-- Document least-privilege intent on schema.
COMMENT ON SCHEMA app IS 'Private canonical schema. RLS deny-by-default; Java JDBC scoping is authoritative; direct Data API denied. Runtime role app_runtime has DML only, no DDL. No service-role in repo.';
