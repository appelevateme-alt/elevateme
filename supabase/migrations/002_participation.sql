-- ============================================================================
-- ElevateMe migration 002_participation
-- Run SECOND in the Supabase SQL editor (after 001_core.sql).
-- Postgres 14 compatible.
--
-- Vocabularies mirror src/lib/mock-data.js exactly:
--   registrations.status: Pending | Confirmed | Waitlisted | Rejected | Cancelled
--   registrations.evaluation_state: NotStarted | Pending | Submitted (default NotStarted)
--   evaluations.state: Draft | Submitted | Locked
--   evaluation_scores.score: numeric 0-100 per criterion (1000-point model:
--   10 criteria x 0-100 = total/1000, final = total/10 out of 100)
--   recommendations.priority: 'High priority' | 'In progress' | 'Complete' (exact mock strings)
--   recommendations.status: New | Viewed | Completed
--   announcements.status: Draft | Scheduled | Published
--   message_threads.state: Open | Replied | Closed
--   program_evaluators.access: Scheduled | Active | Approved
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Registrations (mockRegistrations + mockRoster sheet columns).
-- NOTE on UNIQUE(student_id, program_id, session_id): in Postgres NULLs are
-- never equal, so two program-level rows with session_id IS NULL do not
-- conflict. The app must still prevent duplicate program-level sign-ups
-- (confirm_registration RPC + UI check); the constraint guards the
-- session-scoped case.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  program_id       uuid NOT NULL REFERENCES public.programs (id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id       uuid REFERENCES public.sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  allocation       text, -- e.g. 'WHO Committee · Japan · BMICH, Colombo'
  status           text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Confirmed', 'Waitlisted', 'Rejected', 'Cancelled')),
  evaluation_state text NOT NULL DEFAULT 'NotStarted'
    CHECK (evaluation_state IN ('NotStarted', 'Pending', 'Submitted')),
  when_label       text, -- e.g. '24 OCT · 09:00'
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, program_id, session_id)
);
CREATE INDEX IF NOT EXISTS registrations_student_id_idx ON public.registrations (student_id);
CREATE INDEX IF NOT EXISTS registrations_program_id_idx ON public.registrations (program_id);
CREATE INDEX IF NOT EXISTS registrations_session_id_idx ON public.registrations (session_id);

-- ----------------------------------------------------------------------------
-- Evaluations / Student Performance Sheets (mockEvaluations).
-- Visibility rule (enforced in 003_rls.sql): students/parents see a sheet only
-- when released = true.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text UNIQUE NOT NULL, -- app-stable key ('e-1', 'e-2', ...)
  student_id            uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  program_id            uuid NOT NULL REFERENCES public.programs (id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id            uuid REFERENCES public.sessions (id) ON DELETE SET NULL ON UPDATE CASCADE,
  evaluator_id          uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  state                 text NOT NULL DEFAULT 'Draft'
    CHECK (state IN ('Draft', 'Submitted', 'Locked')),
  released              boolean NOT NULL DEFAULT false,
  released_at           timestamptz,
  remarks               text NOT NULL DEFAULT '',
  special_recognition   text,
  recommendation_for_di text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id, evaluator_id),
  CHECK (released = false OR released_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS evaluations_student_id_idx   ON public.evaluations (student_id);
CREATE INDEX IF NOT EXISTS evaluations_program_id_idx   ON public.evaluations (program_id);
CREATE INDEX IF NOT EXISTS evaluations_session_id_idx   ON public.evaluations (session_id);
CREATE INDEX IF NOT EXISTS evaluations_evaluator_id_idx ON public.evaluations (evaluator_id);

-- ----------------------------------------------------------------------------
-- One row per criterion per evaluation. criterion_key uses TEN_CRITERIA keys
-- from src/lib/scores.js (preparation, clarity, confidence, focus, ...).
-- score is 0-100 per criterion; sheet total = sum (0-1000);
-- final score = total / 10 (0-100).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluation_scores (
  evaluation_id uuid NOT NULL REFERENCES public.evaluations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  criterion_key text NOT NULL,
  score         numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  PRIMARY KEY (evaluation_id, criterion_key)
);

-- ----------------------------------------------------------------------------
-- Versioned rubric. Historical sheets keep their meaning via the template
-- version recorded at release time (see meta in seed / RPC audit rows).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluation_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version    text UNIQUE NOT NULL, -- e.g. 'v1'
  criteria   jsonb NOT NULL DEFAULT '[]',
  scale_map  jsonb NOT NULL DEFAULT '{}',
  is_active  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- At most one active template.
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_templates_single_active
  ON public.evaluation_templates (is_active) WHERE is_active;

-- ----------------------------------------------------------------------------
-- Recommendations (mockRecommendations). student_id nullable so DI can also
-- address a group via `audience` (e.g. 'Cohort 03').
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  audience   text,
  title      text NOT NULL,
  body       text NOT NULL,
  skill      text,
  related    text,
  priority   text
    CHECK (priority IS NULL OR priority IN ('High priority', 'In progress', 'Complete')),
  status     text NOT NULL DEFAULT 'New'
    CHECK (status IN ('New', 'Viewed', 'Completed')),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recommendations_student_id_idx ON public.recommendations (student_id);

-- ----------------------------------------------------------------------------
-- Announcements: one-way DI -> users. body is plain text (no rich content).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body         text NOT NULL,
  sender       text NOT NULL DEFAULT 'Diplomatic Impact',
  audience     text,
  program_id   uuid REFERENCES public.programs (id) ON DELETE SET NULL ON UPDATE CASCADE,
  status       text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Scheduled', 'Published')),
  publish_date timestamptz,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_status_idx    ON public.announcements (status);
CREATE INDEX IF NOT EXISTS announcements_program_id_idx ON public.announcements (program_id);

-- ----------------------------------------------------------------------------
-- Parent <-> DI messages: request/reply model, not chat (mockThreads +
-- mockThreadDetails). The opening message body is NOT stored separately --
-- `preview` carries the gist; follow-up replies live in message_replies.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_threads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject    text NOT NULL,
  student_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  state      text NOT NULL DEFAULT 'Open'
    CHECK (state IN ('Open', 'Replied', 'Closed')),
  preview    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_threads_student_id_idx ON public.message_threads (student_id);

CREATE TABLE IF NOT EXISTS public.message_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.message_threads (id) ON DELETE CASCADE ON UPDATE CASCADE,
  author_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  author_name text,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_replies_thread_id_idx ON public.message_replies (thread_id);

-- ----------------------------------------------------------------------------
-- Evaluator assignments (coordinator "Evaluators" table: Access Scheduled /
-- Active). PK(session_id, evaluator_id): one access row per evaluator per
-- session; program_id is denormalised for fast scoping.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.program_evaluators (
  program_id   uuid NOT NULL REFERENCES public.programs (id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id   uuid NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  access       text NOT NULL DEFAULT 'Scheduled'
    CHECK (access IN ('Scheduled', 'Active', 'Approved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, evaluator_id)
);
CREATE INDEX IF NOT EXISTS program_evaluators_program_id_idx   ON public.program_evaluators (program_id);
CREATE INDEX IF NOT EXISTS program_evaluators_evaluator_id_idx ON public.program_evaluators (evaluator_id);

-- ----------------------------------------------------------------------------
-- Audit log: append-only. No UPDATE/DELETE policies are created in 003 and a
-- guard trigger in 004 rejects writes outside SECURITY DEFINER code paths.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  meta       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx   ON public.audit_log (entity, created_at);

-- ----------------------------------------------------------------------------
-- updated_at triggers for the new tables that carry the column
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_touch_registrations ON public.registrations;
CREATE TRIGGER trg_touch_registrations
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_evaluations ON public.evaluations;
CREATE TRIGGER trg_touch_evaluations
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_recommendations ON public.recommendations;
CREATE TRIGGER trg_touch_recommendations
  BEFORE UPDATE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_announcements ON public.announcements;
CREATE TRIGGER trg_touch_announcements
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_message_threads ON public.message_threads;
CREATE TRIGGER trg_touch_message_threads
  BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
