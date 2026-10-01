-- ============================================================================
-- ElevateMe seed_dev.sql — DEVELOPMENT ONLY. NEVER run in production.
-- Synthetic data only. All emails use @test.example.com (RFC 2606-style
-- reserved demo domain). Tokens/hashes/slip numbers are fake placeholders.
--
-- Covers:
--   * zero-history student      (registered, no sheets)
--   * one-history student       (single sheet)
--   * trend student 60/83/76    (3 sessions, chronological)
--   * below-30 case (28 -> alert) + exactly-30 case (no alert)
--   * continuous program with 3 sessions
--   * paid assigned event (VERIFIED payment)
--   * expired guest invitation
--   * unanswered query thread
-- Run once per fresh DB after `flyway migrate`:
--   psql $DATABASE_URL -f database/seed_dev.sql
-- Re-runnable where UNIQUE constraints allow (ON CONFLICT DO NOTHING);
-- institute_memberships use WHERE NOT EXISTS (partial unique index).
-- Postgres 14 compatible.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- Institute + people. Fixed UUIDs keep the file readable/diffable.
-- elevate_me_id is intentionally LEFT NULL for students: the V1 trigger
-- assigns EM-##### transactionally (sequence continues at 131+).
-- --------------------------------------------------------------------------
INSERT INTO app.institutes (id, slug, name, verified)
VALUES ('00000000-0000-0000-0000-000000000001', 'di-dev', 'Diplomatic Impact (dev)', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.profiles (id, email, full_name, role, status, supabase_subject) VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin@test.example.com',       'Dev Admin',       'admin',       'Approved', NULL),
  ('10000000-0000-0000-0000-000000000002', 'coordinator@test.example.com', 'Dev Coordinator', 'coordinator', 'Approved', NULL),
  ('10000000-0000-0000-0000-000000000003', 'evaluator@test.example.com',   'Dev Evaluator',   'evaluator',   'Approved', NULL),
  ('10000000-0000-0000-0000-000000000004', 'parent@test.example.com',      'Dev Parent',      'parent',      'Approved', NULL),
  ('10000000-0000-0000-0000-000000000011', 'zero@test.example.com',        'Zero History',    'student',     'Approved', NULL),
  ('10000000-0000-0000-0000-000000000012', 'one@test.example.com',         'One History',     'student',     'Approved', NULL),
  ('10000000-0000-0000-0000-000000000013', 'trend@test.example.com',       'Trend Student',   'student',     'Approved', NULL),
  ('10000000-0000-0000-0000-000000000014', 'low28@test.example.com',       'Low TwentyEight', 'student',     'Approved', NULL),
  ('10000000-0000-0000-0000-000000000015', 'edge30@test.example.com',      'Edge Thirty',     'student',     'Approved', NULL)
ON CONFLICT (id) DO NOTHING;

-- Parent-view preference demo: parent pins Zero History as default child view.
UPDATE app.profiles
SET parent_view_mode = 'SINGLE',
    parent_default_student_id = '10000000-0000-0000-0000-000000000011'
WHERE id = '10000000-0000-0000-0000-000000000004';

-- Memberships (audited join; created_by = dev admin, NULL for the admin's own
-- row so the V1 CHECK (created_by <> profile_id OR member) passes — same
-- CASE pattern as seed_phase2.sql).
INSERT INTO app.institute_memberships (institute_id, profile_id, role_in_institute, created_by)
SELECT '00000000-0000-0000-0000-000000000001', p.id,
       CASE WHEN p.role IN ('admin', 'coordinator') THEN 'manager' ELSE 'member' END,
       CASE WHEN p.id = '10000000-0000-0000-0000-000000000001' THEN NULL::uuid
            ELSE '10000000-0000-0000-0000-000000000001'::uuid END
FROM app.profiles p
WHERE p.email LIKE '%@test.example.com'
  AND NOT EXISTS (
    SELECT 1 FROM app.institute_memberships m
    WHERE m.institute_id = '00000000-0000-0000-0000-000000000001'
      AND m.profile_id = p.id AND m.archived_at IS NULL
  );

-- --------------------------------------------------------------------------
-- Continuous programme with 3 chronological sessions.
-- --------------------------------------------------------------------------
INSERT INTO app.programs (id, slug, title, program_type, subtype, themes,
  institute_id, owner_id, venue, capacity, visibility, lifecycle, description)
VALUES ('20000000-0000-0000-0000-000000000001', 'dev-continuous-01',
  'Dev Continuous Programme', 'CONTINUOUS', NULL,
  ARRAY['diplomacy', 'debate'],
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Dev Hall', 100, 'INTERNAL', 'PUBLISHED', 'Synthetic continuous programme for trend 60/83/76.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.sessions (id, program_id, slug, title, committee, topic, venue, starts_at, ends_at) VALUES
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'dev-cont-s1', 'Session 1 — Foundations', 'WHO', 'Foundations', 'Dev Hall A',
   now() - interval '21 days', now() - interval '21 days' + interval '2 hours'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   'dev-cont-s2', 'Session 2 — Practice', 'UNSC', 'Practice', 'Dev Hall B',
   now() - interval '14 days', now() - interval '14 days' + interval '2 hours'),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   'dev-cont-s3', 'Session 3 — Showcase', 'UNHRC', 'Showcase', 'Dev Hall C',
   now() - interval '7 days', now() - interval '7 days' + interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Paid assigned event (single event + session) for the payment demo.
-- --------------------------------------------------------------------------
INSERT INTO app.programs (id, slug, title, program_type, subtype, themes,
  institute_id, owner_id, venue, capacity, visibility, lifecycle, description)
VALUES ('20000000-0000-0000-0000-000000000002', 'dev-event-paid-01',
  'Dev Paid Model UN', 'SINGLE_EVENT', 'MODEL_UN', ARRAY['model-un'],
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'Dev Convention Centre', 50, 'PUBLIC', 'PUBLISHED', 'Synthetic paid event.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.sessions (id, program_id, slug, title, committee, topic, venue, starts_at, ends_at)
VALUES ('21000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000002',
  'dev-event-s1', 'Paid Event — Committee Day', 'WHO', 'Paid demo', 'Dev CC Room 1',
  now() + interval '7 days', now() + interval '7 days' + interval '6 hours')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Registrations (program-level Confirmed; trigger keeps registered_count).
-- zero@test: registered only -> zero history. All others Confirmed.
-- trend@test also gets a VERIFIED payment on the paid event.
-- --------------------------------------------------------------------------
INSERT INTO app.registrations (id, student_id, program_id, session_id, status, confirmed_at, confirmed_by) VALUES
  ('22000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
   '20000000-0000-0000-0000-000000000001', NULL, 'Confirmed', now() - interval '22 days',
   '10000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000012',
   '20000000-0000-0000-0000-000000000001', NULL, 'Confirmed', now() - interval '22 days',
   '10000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000013',
   '20000000-0000-0000-0000-000000000001', NULL, 'Confirmed', now() - interval '22 days',
   '10000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000014',
   '20000000-0000-0000-0000-000000000001', NULL, 'Confirmed', now() - interval '22 days',
   '10000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000015',
   '20000000-0000-0000-0000-000000000001', NULL, 'Confirmed', now() - interval '22 days',
   '10000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000013',
   '20000000-0000-0000-0000-000000000002', NULL, 'Confirmed', now() - interval '2 days',
   '10000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Attendance: everyone except zero-history attended their sessions.
INSERT INTO app.session_attendance (session_id, student_id, status, actor_id, reason) VALUES
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000012',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000013',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000013',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000013',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000014',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000015',
   'ATTENDED', '10000000-0000-0000-0000-000000000002', NULL)
ON CONFLICT (student_id, session_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Evaluation assignments (one per student+session that owes a sheet).
-- Fixed UUIDs (11111111 series) so re-runs hit ON CONFLICT instead of
-- minting new random ids each time.
INSERT INTO app.evaluation_assignments (id, student_id, session_id, rubric_version_id, assigned_by)
SELECT v.id, v.student, v.session, (SELECT id FROM app.rubric_versions WHERE version = 'v2'),
       '10000000-0000-0000-0000-000000000002'
FROM (VALUES
  ('11111111-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000012'::uuid, '21000000-0000-0000-0000-000000000003'::uuid),
  ('11111111-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000013'::uuid, '21000000-0000-0000-0000-000000000001'::uuid),
  ('11111111-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000013'::uuid, '21000000-0000-0000-0000-000000000002'::uuid),
  ('11111111-0000-0000-0000-000000000004'::uuid, '10000000-0000-0000-0000-000000000013'::uuid, '21000000-0000-0000-0000-000000000003'::uuid),
  ('11111111-0000-0000-0000-000000000005'::uuid, '10000000-0000-0000-0000-000000000014'::uuid, '21000000-0000-0000-0000-000000000002'::uuid),
  ('11111111-0000-0000-0000-000000000006'::uuid, '10000000-0000-0000-0000-000000000015'::uuid, '21000000-0000-0000-0000-000000000002'::uuid)
) AS v(id, student, session)
ON CONFLICT (student_id, session_id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Evaluations + revisions + scores.
-- trend@test: session averages 60 / 83 / 76 (each 10 criteria, avg as stated).
-- one@test: single sheet avg 70. low28: preparation=28 (alert). edge30:
-- preparation=30 (scores CHECK passes; alert CHECK score<threshold fails, so
-- correctly NO alert row — the point of the case).
-- --------------------------------------------------------------------------
INSERT INTO app.evaluations (id, student_id, session_id, program_id, evaluator_id,
  rubric_version_id, state) VALUES
  ('23000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000012',
   '21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED'),
  ('23000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000013',
   '21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'LOCKED'),
  ('23000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000013',
   '21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED'),
  ('23000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000013',
   '21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED'),
  ('23000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000014',
   '21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED'),
  ('23000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000015',
   '21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003',
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.evaluation_revisions (id, evaluation_id, revision_no, rubric_version_id,
  state, created_by) VALUES
  ('23100000-0000-0000-0000-000000000012', '23000000-0000-0000-0000-000000000012', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003'),
  ('23100000-0000-0000-0000-000000000031', '23000000-0000-0000-0000-000000000031', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003'),
  ('23100000-0000-0000-0000-000000000032', '23000000-0000-0000-0000-000000000032', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003'),
  ('23100000-0000-0000-0000-000000000033', '23000000-0000-0000-0000-000000000033', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003'),
  ('23100000-0000-0000-0000-000000000014', '23000000-0000-0000-0000-000000000014', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003'),
  ('23100000-0000-0000-0000-000000000015', '23000000-0000-0000-0000-000000000015', 1,
   (SELECT id FROM app.rubric_versions WHERE version = 'v2'), 'SUBMITTED',
   '10000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Helper note: 10 keys in rubric order. Averages verified below.
-- one@test avg 70: all 70. trend s1 avg 60: all 60.
-- trend s2 avg 83: 85+80+82+84+83+85+81+84+83+83 = 830.
-- trend s3 avg 76: all 76. low28: preparation 28, rest 65. edge30: preparation 30, rest 65.
INSERT INTO app.evaluation_scores (revision_id, criterion_key, score)
SELECT r.id, s.key, s.score FROM (VALUES
  ('23100000-0000-0000-0000-000000000012'::uuid, 'preparation'::text, 70),
  ('23100000-0000-0000-0000-000000000012', 'clarity', 70),
  ('23100000-0000-0000-0000-000000000012', 'confidence', 70),
  ('23100000-0000-0000-0000-000000000012', 'focus', 70),
  ('23100000-0000-0000-0000-000000000012', 'critical_analysis', 70),
  ('23100000-0000-0000-0000-000000000012', 'sound', 70),
  ('23100000-0000-0000-0000-000000000012', 'audience_addressing', 70),
  ('23100000-0000-0000-0000-000000000012', 'counter_arguments', 70),
  ('23100000-0000-0000-0000-000000000012', 'wit', 70),
  ('23100000-0000-0000-0000-000000000012', 'overall_performance', 70),
  ('23100000-0000-0000-0000-000000000031', 'preparation', 60),
  ('23100000-0000-0000-0000-000000000031', 'clarity', 60),
  ('23100000-0000-0000-0000-000000000031', 'confidence', 60),
  ('23100000-0000-0000-0000-000000000031', 'focus', 60),
  ('23100000-0000-0000-0000-000000000031', 'critical_analysis', 60),
  ('23100000-0000-0000-0000-000000000031', 'sound', 60),
  ('23100000-0000-0000-0000-000000000031', 'audience_addressing', 60),
  ('23100000-0000-0000-0000-000000000031', 'counter_arguments', 60),
  ('23100000-0000-0000-0000-000000000031', 'wit', 60),
  ('23100000-0000-0000-0000-000000000031', 'overall_performance', 60),
  ('23100000-0000-0000-0000-000000000032', 'preparation', 85),
  ('23100000-0000-0000-0000-000000000032', 'clarity', 80),
  ('23100000-0000-0000-0000-000000000032', 'confidence', 82),
  ('23100000-0000-0000-0000-000000000032', 'focus', 84),
  ('23100000-0000-0000-0000-000000000032', 'critical_analysis', 83),
  ('23100000-0000-0000-0000-000000000032', 'sound', 85),
  ('23100000-0000-0000-0000-000000000032', 'audience_addressing', 81),
  ('23100000-0000-0000-0000-000000000032', 'counter_arguments', 84),
  ('23100000-0000-0000-0000-000000000032', 'wit', 83),
  ('23100000-0000-0000-0000-000000000032', 'overall_performance', 83),
  ('23100000-0000-0000-0000-000000000033', 'preparation', 76),
  ('23100000-0000-0000-0000-000000000033', 'clarity', 76),
  ('23100000-0000-0000-0000-000000000033', 'confidence', 76),
  ('23100000-0000-0000-0000-000000000033', 'focus', 76),
  ('23100000-0000-0000-0000-000000000033', 'critical_analysis', 76),
  ('23100000-0000-0000-0000-000000000033', 'sound', 76),
  ('23100000-0000-0000-0000-000000000033', 'audience_addressing', 76),
  ('23100000-0000-0000-0000-000000000033', 'counter_arguments', 76),
  ('23100000-0000-0000-0000-000000000033', 'wit', 76),
  ('23100000-0000-0000-0000-000000000033', 'overall_performance', 76),
  ('23100000-0000-0000-0000-000000000014', 'preparation', 28),
  ('23100000-0000-0000-0000-000000000014', 'clarity', 65),
  ('23100000-0000-0000-0000-000000000014', 'confidence', 65),
  ('23100000-0000-0000-0000-000000000014', 'focus', 65),
  ('23100000-0000-0000-0000-000000000014', 'critical_analysis', 65),
  ('23100000-0000-0000-0000-000000000014', 'sound', 65),
  ('23100000-0000-0000-0000-000000000014', 'audience_addressing', 65),
  ('23100000-0000-0000-0000-000000000014', 'counter_arguments', 65),
  ('23100000-0000-0000-0000-000000000014', 'wit', 65),
  ('23100000-0000-0000-0000-000000000014', 'overall_performance', 65),
  ('23100000-0000-0000-0000-000000000015', 'preparation', 30),
  ('23100000-0000-0000-0000-000000000015', 'clarity', 65),
  ('23100000-0000-0000-0000-000000000015', 'confidence', 65),
  ('23100000-0000-0000-0000-000000000015', 'focus', 65),
  ('23100000-0000-0000-0000-000000000015', 'critical_analysis', 65),
  ('23100000-0000-0000-0000-000000000015', 'sound', 65),
  ('23100000-0000-0000-0000-000000000015', 'audience_addressing', 65),
  ('23100000-0000-0000-0000-000000000015', 'counter_arguments', 65),
  ('23100000-0000-0000-0000-000000000015', 'wit', 65),
  ('23100000-0000-0000-0000-000000000015', 'overall_performance', 65)
) AS s(id, key, score)
JOIN app.evaluation_revisions r ON r.id = s.id
ON CONFLICT (revision_id, criterion_key) DO NOTHING;

-- Release session 1 (trend s1 revision becomes the visible one).
UPDATE app.evaluations
SET released_revision_id = '23100000-0000-0000-0000-000000000031',
    released_at = now() - interval '20 days'
WHERE id = '23000000-0000-0000-0000-000000000031';

INSERT INTO app.report_releases (id, scope, program_id, session_id, actor_id, idempotency_key)
VALUES ('24000000-0000-0000-0000-000000000001', 'SESSION',
  '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'dev-release-s1-001')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- Growth & support demos.
-- --------------------------------------------------------------------------
-- Development assignment for the below-30 student.
INSERT INTO app.development_assignments (id, student_id, program_id, reason, state, assigned_by)
VALUES ('25000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001', 'Follow-up: preparation scored 28 (< 30).',
  'ASSIGNED', '10000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Paid + VERIFIED payment for the trend student's event registration.
-- No card fields anywhere — only an external slip reference.
INSERT INTO app.payment_verifications (id, registration_id, external_reference, state,
  verified_by, verified_at)
VALUES ('26000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000020',
  'DEMO-SLIP-001', 'VERIFIED',
  '10000000-0000-0000-0000-000000000001', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- Recommendation + recipient (low28 viewed, not yet completed; pinned 1/3 demo).
INSERT INTO app.recommendations (id, title, body, skill_tag, priority, target_snapshot, created_by)
VALUES ('27000000-0000-0000-0000-000000000001', 'Dev: rehearse openings aloud',
  'Synthetic recommendation for the 28-score follow-up.', 'preparation',
  'High priority', '{"cohort": "dev", "criterion": "preparation"}',
  '10000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.recommendation_recipients (recommendation_id, student_id, viewed_at, pinned_order)
VALUES ('27000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000014',
  now() - interval '1 day', 1)
ON CONFLICT (student_id, recommendation_id) DO NOTHING;

-- Unanswered query from the zero-history student (staff queue demo).
INSERT INTO app.query_threads (id, student_id, subject, initiator, initiator_profile_id,
  selected_view, status, awaiting_admin_reply)
VALUES ('28000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011',
  'Dev: when is my first evaluation?', 'STUDENT', '10000000-0000-0000-0000-000000000011',
  '{}', 'IN_REVIEW', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.query_messages (id, thread_id, author_id, author_type, body)
VALUES ('11111111-0000-0000-0000-000000000011', '28000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011',
  'STUDENT', 'Synthetic question with no staff reply yet.')
ON CONFLICT (id) DO NOTHING;

-- Expired guest invitation (yesterday) to session 1 for the trend student.
-- token_hash is a fake placeholder, never a real token.
INSERT INTO app.guest_invitations (id, scope, program_id, session_id, token_hash,
  expires_at, created_by)
VALUES ('29000000-0000-0000-0000-000000000001', 'SESSION',
  '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001',
  'DEV-EXPIRED-HASH-001-not-a-real-token', now() - interval '1 day',
  '10000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.guest_invitation_students (invitation_id, student_id)
VALUES ('29000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000013')
ON CONFLICT DO NOTHING;

-- Criterion alert ONLY for the 28 case. The exactly-30 case intentionally has
-- no row: CHECK (score < threshold) with threshold 30 excludes it.
INSERT INTO app.criterion_alerts (student_id, criterion_key, session_id,
  evidence_revision_id, score, threshold, resolved_note)
SELECT '10000000-0000-0000-0000-000000000014', 'preparation',
  '21000000-0000-0000-0000-000000000002',
  '23100000-0000-0000-0000-000000000014', 28, 30, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM app.criterion_alerts
  WHERE student_id = '10000000-0000-0000-0000-000000000014'
    AND criterion_key = 'preparation' AND resolved_at IS NULL
);

-- Notification + outbox + comment bank + audit marker.
INSERT INTO app.notifications (recipient_id, type, entity_type, entity_id, entity_version, payload)
VALUES ('10000000-0000-0000-0000-000000000014', 'CRITERION_ALERT', 'criterion_alert',
  'preparation', 1, '{"score": 28, "threshold": 30}')
ON CONFLICT (recipient_id, type, entity_type, entity_id, entity_version) DO NOTHING;

INSERT INTO app.outbox_events (aggregate_type, aggregate_id, event_type, payload, dedupe_key)
VALUES ('evaluation', '23000000-0000-0000-0000-000000000014', 'evaluation.submitted',
  '{"student": "low28@test.example.com"}', 'dev-outbox-001')
ON CONFLICT (dedupe_key) DO NOTHING;

INSERT INTO app.comment_bank_entries (id, scope, owner_id, criterion_key, text)
VALUES ('11111111-0000-0000-0000-000000000012', 'ADMIN_SHARED', '10000000-0000-0000-0000-000000000003', 'preparation',
  'Dev snippet: open with a one-line roadmap, then pause.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.audit_events (actor_type, actor_id, action, entity_type, entity_id,
  after_data, request_id)
VALUES ('SYSTEM', NULL, 'seed.dev_loaded', 'database', 'seed_dev.sql',
  '{"note": "synthetic @test.example.com data"}', 'dev-seed-001');

COMMIT;
