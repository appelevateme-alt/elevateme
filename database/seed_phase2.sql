-- ============================================================================
-- ElevateMe seed_phase2.sql — DEVELOPMENT ONLY. NEVER run in production.
-- Synthetic data only. All emails use @test.example.com (reserved demo domain).
-- Requires Flyway V6 (Phase2 enums: SingleEvent|Continuous, MUN|Debate,
-- PublicSpeaking|Communication|Negotiation, CONFIRMED, etc).
-- Run after `flyway migrate` (and optionally after seed_dev.sql):
--   psql $DATABASE_URL -f database/seed_phase2.sql
-- Idempotent via ON CONFLICT DO NOTHING / WHERE NOT EXISTS.
-- Covers:
--   * 1 MUN SingleEvent program (PUBLISHED, 2 committees x 2 sessions = 4)
--   * 1 continuous speaking program (PUBLISHED, 3 sessions chronological)
--   * capacities + registration_deadline in the future
--   * 3 synthetic students + program/session registrations
--   * session_attendance 2x ATTENDED + 1x ABSENT on first MUN session (roster)
-- Postgres 14 compatible.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- Institute + owner (reuse di-dev + dev coordinator ids so the file composes
-- with seed_dev.sql; ON CONFLICT DO NOTHING keeps standalone runs safe).
-- --------------------------------------------------------------------------
INSERT INTO app.institutes (id, slug, name, verified)
VALUES ('00000000-0000-0000-0000-000000000001', 'di-dev', 'Diplomatic Impact (dev)', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.profiles (id, email, full_name, role, status, supabase_subject) VALUES
  ('10000000-0000-0000-0000-000000000002', 'coordinator@test.example.com', 'Dev Coordinator', 'coordinator', 'Approved', NULL)
ON CONFLICT (id) DO NOTHING;

-- 3 synthetic roster students (Approved -> EM-##### auto-assigned by V1 trigger).
INSERT INTO app.profiles (id, email, full_name, role, status, supabase_subject) VALUES
  ('10000000-0000-0000-0000-000000000021', 'roster-a@test.example.com', 'Roster Alpha',   'student', 'Approved', NULL),
  ('10000000-0000-0000-0000-000000000022', 'roster-b@test.example.com', 'Roster Bravo',   'student', 'Approved', NULL),
  ('10000000-0000-0000-0000-000000000023', 'roster-c@test.example.com', 'Roster Charlie', 'student', 'Approved', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.institute_memberships (institute_id, profile_id, role_in_institute, created_by)
SELECT '00000000-0000-0000-0000-000000000001', p.id,
       CASE WHEN p.role IN ('admin', 'coordinator') THEN 'manager' ELSE 'member' END,
       CASE WHEN p.id = '10000000-0000-0000-0000-000000000002' THEN NULL::uuid
            ELSE '10000000-0000-0000-0000-000000000002'::uuid END
FROM app.profiles p
WHERE p.email LIKE '%@test.example.com'
  AND p.id IN ('10000000-0000-0000-0000-000000000002',
               '10000000-0000-0000-0000-000000000021',
               '10000000-0000-0000-0000-000000000022',
               '10000000-0000-0000-0000-000000000023')
  AND NOT EXISTS (
    SELECT 1 FROM app.institute_memberships m
    WHERE m.institute_id = '00000000-0000-0000-0000-000000000001'
      AND m.profile_id = p.id AND m.archived_at IS NULL
  );

-- --------------------------------------------------------------------------
-- 1 MUN SingleEvent program (PUBLISHED) + 2 committees x 2 sessions.
-- --------------------------------------------------------------------------
INSERT INTO app.programs (id, slug, title, program_type, subtype, themes,
  institute_id, owner_id, venue, capacity, visibility, lifecycle,
  registration_deadline, version, starts_at,
  submitted_at, decided_at, decided_by, decision_note,
  approval_decided_by, approval_decided_at, approval_note, description)
VALUES ('30000000-0000-0000-0000-000000000001', 'phase2-mun-01',
  'Phase2 MUN Summit', 'SingleEvent', 'MUN',
  ARRAY['PublicSpeaking', 'Negotiation'],
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Phase2 MUN Hall', 60, 'PUBLIC', 'PUBLISHED',
  now() + interval '30 days', 1, now() + interval '7 days',
  now() - interval '10 days', now() - interval '9 days',
  '10000000-0000-0000-0000-000000000002', 'Phase2: approved MUN pilot.',
  '10000000-0000-0000-0000-000000000002', now() - interval '9 days', 'Phase2: approved MUN pilot.',
  'Synthetic Phase2 MUN program for roster tests.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.sessions (id, program_id, slug, title, committee, topic, venue, starts_at, ends_at) VALUES
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'phase2-mun-unsc-s1', 'MUN UNSC — Session 1', 'UNSC', 'Peacekeeping', 'Phase2 MUN Hall A',
   now() + interval '7 days', now() + interval '7 days' + interval '2 hours'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
   'phase2-mun-unsc-s2', 'MUN UNSC — Session 2', 'UNSC', 'Climate Security', 'Phase2 MUN Hall A',
   now() + interval '8 days', now() + interval '8 days' + interval '2 hours'),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
   'phase2-mun-who-s1', 'MUN WHO — Session 1', 'WHO', 'Pandemic Preparedness', 'Phase2 MUN Hall B',
   now() + interval '9 days', now() + interval '9 days' + interval '2 hours'),
  ('31000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
   'phase2-mun-who-s2', 'MUN WHO — Session 2', 'WHO', 'Vaccine Equity', 'Phase2 MUN Hall B',
   now() + interval '10 days', now() + interval '10 days' + interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 1 continuous speaking program (PUBLISHED, 3 sessions chronological).
-- --------------------------------------------------------------------------
INSERT INTO app.programs (id, slug, title, program_type, subtype, themes,
  institute_id, owner_id, venue, capacity, visibility, lifecycle,
  registration_deadline, version, starts_at,
  submitted_at, decided_at, decided_by, decision_note,
  approval_decided_by, approval_decided_at, approval_note, description)
VALUES ('30000000-0000-0000-0000-000000000002', 'phase2-speaking-01',
  'Phase2 Continuous Speaking', 'Continuous', 'Debate',
  ARRAY['PublicSpeaking', 'Communication'],
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Phase2 Speaking Room', 40, 'PUBLIC', 'PUBLISHED',
  now() + interval '60 days', 1, now() + interval '7 days',
  now() - interval '12 days', now() - interval '11 days',
  '10000000-0000-0000-0000-000000000002', 'Phase2: approved speaking track.',
  '10000000-0000-0000-0000-000000000002', now() - interval '11 days', 'Phase2: approved speaking track.',
  'Synthetic Phase2 continuous speaking program (3 chronological sessions).')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.sessions (id, program_id, slug, title, committee, topic, venue, starts_at, ends_at) VALUES
  ('31000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000002',
   'phase2-speak-s1', 'Speaking — Foundations', 'General', 'Foundations', 'Phase2 Speaking Room',
   now() + interval '7 days', now() + interval '7 days' + interval '2 hours'),
  ('31000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000002',
   'phase2-speak-s2', 'Speaking — Practice', 'General', 'Practice', 'Phase2 Speaking Room',
   now() + interval '14 days', now() + interval '14 days' + interval '2 hours'),
  ('31000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000002',
   'phase2-speak-s3', 'Speaking — Showcase', 'General', 'Showcase', 'Phase2 Speaking Room',
   now() + interval '21 days', now() + interval '21 days' + interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Registrations: program-level (session_id NULL) + session-level for roster.
-- Uppercase CONFIRMED exercises the Phase2 superset status CHECK; the two
-- partial unique indexes reject duplicates in each level independently.
-- --------------------------------------------------------------------------
INSERT INTO app.registrations (id, student_id, program_id, session_id, status, confirmed_at, confirmed_by) VALUES
  ('32000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
   '30000000-0000-0000-0000-000000000001', NULL, 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000022',
   '30000000-0000-0000-0000-000000000001', NULL, 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000023',
   '30000000-0000-0000-0000-000000000001', NULL, 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000021',
   '30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000022',
   '30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000023',
   '30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'CONFIRMED', now(), '10000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Attendance on first MUN session: 2 ATTENDED + 1 ABSENT (roster test).
INSERT INTO app.session_attendance (session_id, student_id, status, actor_id, reason) VALUES
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000021',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000022',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000023',
   'ABSENT', '10000000-0000-0000-0000-000000000002', 'Synthetic absence for roster test.')
ON CONFLICT (student_id, session_id) DO NOTHING;

COMMIT;
