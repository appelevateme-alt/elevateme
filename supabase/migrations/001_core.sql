-- ============================================================================
-- ElevateMe migration 001_core
-- Run FIRST in the Supabase SQL editor (fresh Postgres DB, no tables yet).
-- Postgres 14 compatible. Plain SQL, no external dependencies.
--
-- Entities / status vocabularies mirror src/lib/mock-data.js exactly:
--   profiles.status: Approved | PendingReview | Rejected | Suspended | ChangesRequested
--   roles / active_role: student | parent | coordinator | evaluator | admin
--   programs.category: SingleEvent | ContinuousProgramme | SpecialProgramme
--   programs.single_event_type (nullable): ModelUN | FriendlyDebate | Competition | Special
--     (the 4 options in the coordinator program builder, src/views/coordinator.jsx)
--   programs.status: Draft | Submitted | UnderReview | ChangesRequested | Approved
--     | Rejected | Published | InProgress | RegistrationClosed | Completed
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Institutes (mockInstitutes: name + verified flag)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institutes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        UNIQUE NOT NULL,
  name       text        UNIQUE NOT NULL,
  verified   boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Profiles: one row per auth user. id is BOTH the PK and the FK to auth.users.
-- Seeded placeholder rows (supabase/seed.sql) carry deterministic UUIDs; when
-- the real person signs up, handle_new_user() in 004_logic.sql re-keys the
-- placeholder row to the real auth.users id (all FKs below are ON UPDATE
-- CASCADE so dependent rows follow the id change).
-- Users may UPDATE their own contact fields only; status / roles /
-- elevate_me_id are admin-only (RLS policy in 003 + guard trigger in 004).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid  PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  email         text  UNIQUE NOT NULL,
  full_name     text  NOT NULL DEFAULT '',
  elevate_me_id text  UNIQUE, -- e.g. 'EM-00124' (EM- + 5 zero-padded digits); students only
  institute_id  uuid  REFERENCES public.institutes (id) ON DELETE SET NULL ON UPDATE CASCADE,
  status        text  NOT NULL DEFAULT 'PendingReview'
    CHECK (status IN ('Approved', 'PendingReview', 'Rejected', 'Suspended', 'ChangesRequested')),
  active_role   text
    CHECK (active_role IS NULL
      OR active_role IN ('student', 'parent', 'coordinator', 'evaluator', 'admin')),
  roles         text[] NOT NULL DEFAULT '{}',
  institute     text, -- denormalised display name, mirrors the mock's plain string
  dob           date,
  phone         text,
  referee       text,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_institute_id_idx ON public.profiles (institute_id);
CREATE INDEX IF NOT EXISTS profiles_status_idx      ON public.profiles (status);

-- ----------------------------------------------------------------------------
-- Parent links: invitation-based, never open ID lookup.
-- status is intentionally broader than the profile vocabulary because it
-- models an invitation lifecycle, not an account state.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_links (
  parent_id              uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  student_id             uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  status                 text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Verified', 'Rejected', 'Revoked', 'Expired')),
  invitation_expires_at  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, student_id),
  CHECK (parent_id <> student_id)
);
CREATE INDEX IF NOT EXISTS parent_links_student_id_idx ON public.parent_links (student_id);

-- ----------------------------------------------------------------------------
-- Programs (mockPrograms). `registered` is a counter cache maintained by the
-- trigger in 004_logic.sql (counts Confirmed registrations).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.programs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL, -- app-stable key used by seed.sql to resolve FKs
  title             text NOT NULL,
  category          text NOT NULL
    CHECK (category IN ('SingleEvent', 'ContinuousProgramme', 'SpecialProgramme')),
  single_event_type text
    CHECK (single_event_type IS NULL
      OR single_event_type IN ('ModelUN', 'FriendlyDebate', 'Competition', 'Special')),
  type_label        text, -- display label, e.g. 'Model United Nations'
  institute_id      uuid REFERENCES public.institutes (id) ON DELETE SET NULL ON UPDATE CASCADE,
  institute_name    text NOT NULL DEFAULT 'Diplomatic Impact', -- denormalised, as in mocks
  venue             text,
  start_date        date,
  end_date          date,
  capacity          int  NOT NULL CHECK (capacity > 0),
  registered        int  NOT NULL DEFAULT 0 CHECK (registered >= 0),
  description       text NOT NULL DEFAULT '',
  meta              text NOT NULL DEFAULT '',
  date_label        text, -- e.g. '24 OCT'
  status            text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Submitted', 'UnderReview', 'ChangesRequested',
                      'Approved', 'Rejected', 'Published', 'InProgress',
                      'RegistrationClosed', 'Completed')),
  created_by        uuid REFERENCES public.profiles (id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CHECK (single_event_type IS NULL OR category = 'SingleEvent')
);
CREATE INDEX IF NOT EXISTS programs_status_idx      ON public.programs (status);
CREATE INDEX IF NOT EXISTS programs_institute_id_idx ON public.programs (institute_id);
CREATE INDEX IF NOT EXISTS programs_created_by_idx  ON public.programs (created_by);

-- ----------------------------------------------------------------------------
-- Sessions / committees (mockSessions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  program_id uuid NOT NULL REFERENCES public.programs (id) ON DELETE CASCADE ON UPDATE CASCADE,
  title      text NOT NULL,
  topic      text,
  date       date,
  venue      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_program_id_idx ON public.sessions (program_id);

-- ----------------------------------------------------------------------------
-- Generic updated_at maintenance (business triggers live in 004_logic.sql)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_institutes ON public.institutes;
CREATE TRIGGER trg_touch_institutes
  BEFORE UPDATE ON public.institutes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_profiles ON public.profiles;
CREATE TRIGGER trg_touch_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_parent_links ON public.parent_links;
CREATE TRIGGER trg_touch_parent_links
  BEFORE UPDATE ON public.parent_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_programs ON public.programs;
CREATE TRIGGER trg_touch_programs
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sessions ON public.sessions;
CREATE TRIGGER trg_touch_sessions
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
