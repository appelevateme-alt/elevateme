-- ============================================================================
-- ElevateMe seed.sql -- run AFTER 001..004 in the Supabase SQL editor.
-- Idempotent: every statement is safe to re-run (ON CONFLICT DO NOTHING /
-- WHERE NOT EXISTS guards). Deterministic UUIDs. FKs are resolved by slug
-- (programs, sessions) or email (profiles), never by hardcoded FK UUIDs.
--
-- Mirrors src/lib/mock-data.js:
--   3 institutes, 5 user profiles + 1 parent link + 6 roster students,
--   4 programs, 3 sessions, 2 evaluator assignments, 2 registrations,
--   e-1 (Locked + released, 6 scores translated 5->E, 4->VG, 3->G) and
--   e-2 (Submitted, unreleased, no scores), 3 recommendations,
--   3 Published announcements, 3 threads + 1 reply, 3 audit rows,
--   plus the active v1 evaluation template (TEN_CRITERIA + SCORE_MAP).
--
-- ASSUMPTIONS / deliberate deviations (mock has no exact value to copy):
--  1. profiles.id is an FK to auth.users.id, so these rows are PLACEHOLDERS.
--     When each person signs up, handle_new_user() (004) adopts the matching
--     email row and re-keys it to the real auth id (FKs follow via
--     ON UPDATE CASCADE). Sign the admin up through the app BEFORE running
--     the elevate-admin SQL in ADMIN_BOOTSTRAP.md.
--  2. Roster students need emails (profiles.email is NOT NULL); the mock has
--     none, so firstname.lastname@example.com addresses are derived.
--  3. Nimuthu already owns EM-00124 (mockRegistrations/mockEvaluations), so
--     the 6 roster students take EM-00125..EM-00130 (mock formula EM-(124+i)
--     shifted by one to keep elevate_me_id unique). Sequence is set to 131.
--  4. e-1's mock session is 'Academic Speaking · Session 05', which is not in
--     mockSessions; it is linked to the closest seeded session, Session 06.
--  5. r-2's mock allocation is 'Session 01 · Online' (no such session seeded),
--     so session_id is NULL and the allocation text is kept verbatim.
--  6. The coordinator sheet shows Dr. Jayasinghe (Active) on Session 06 and
--     Ms. Wickramasinghe (Scheduled) on MUN WHO; Wickramasinghe is not one of
--     the 5 mock users, so Ms. Perera (who holds the evaluator role) takes
--     that slot.
--  7. Thread opening bodies have no column (threads store preview only), so
--     only the one admin reply on m-1 is seeded as a message_replies row.
--  8. programs.registered keeps the mock display numbers (64/0/18/41) via a
--     final UPDATE: the counter trigger in 004 counts real Confirmed rows, so
--     the display numbers are restored after the registration inserts and
--     will be recomputed on the next registration write.
-- ============================================================================

-- ---------------------------------------------------------------- 3 institutes
INSERT INTO public.institutes (id, slug, name, verified) VALUES
  ('10000000-0000-0000-0000-000000000001', 'royal-college-colombo', 'Royal College, Colombo', true),
  ('10000000-0000-0000-0000-000000000002', 'ananda-college',         'Ananda College',         true),
  ('10000000-0000-0000-0000-000000000003', 'gateway-college',        'Gateway College',        false)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------- 5 users ----
INSERT INTO public.profiles
  (id, email, full_name, elevate_me_id, institute_id, institute, status, active_role, roles) VALUES
  ('20000000-0000-0000-0000-000000000001', 'nimuthu@example.com', 'Nimuthu Fernando', 'EM-00124', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000002', 's.fernando@example.com', 'S. Fernando', NULL, NULL, NULL, 'Approved', 'parent', '{parent}'),
  ('20000000-0000-0000-0000-000000000003', 'perera@college.edu', 'Ms. Perera', NULL, (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'coordinator', '{coordinator,evaluator}'),
  ('20000000-0000-0000-0000-000000000004', 'drj@example.com', 'Dr. Jayasinghe', NULL, NULL, NULL, 'Approved', 'evaluator', '{evaluator}'),
  ('20000000-0000-0000-0000-000000000005', 'admin@diplomaticimpact.org', 'Diplomatic Impact', NULL, NULL, NULL, 'Approved', 'admin', '{admin}')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------- 6 roster students --
INSERT INTO public.profiles
  (id, email, full_name, elevate_me_id, institute_id, institute, status, active_role, roles) VALUES
  ('20000000-0000-0000-0000-000000000011', 'amaya.silva@example.com',      'Amaya Silva',      'EM-00125', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000012', 'dilan.perera@example.com',     'Dilan Perera',     'EM-00126', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000013', 'hiruni.senanayake@example.com','Hiruni Senanayake','EM-00127', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000014', 'kavindu.fernando@example.com', 'Kavindu Fernando', 'EM-00128', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000015', 'maya.rodrigo@example.com',     'Maya Rodrigo',     'EM-00129', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}'),
  ('20000000-0000-0000-0000-000000000016', 'nethmi.abeysekara@example.com','Nethmi Abeysekara','EM-00130', (SELECT id FROM public.institutes WHERE slug = 'royal-college-colombo'), 'Royal College, Colombo', 'Approved', 'student', '{student}')
ON CONFLICT (id) DO NOTHING;

-- Keep the EM- sequence ahead of every ID used above.
SELECT setval('public.elevate_me_seq', 131, false);

-- ------------------------------------------------------------- 1 parent link
INSERT INTO public.parent_links (parent_id, student_id, status, invitation_expires_at) VALUES
  ((SELECT id FROM public.profiles WHERE email = 's.fernando@example.com'),
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   'Approved', NULL)
ON CONFLICT (parent_id, student_id) DO NOTHING;

-- ---------------------------------------------------------------- 4 programs
INSERT INTO public.programs
  (id, slug, title, category, single_event_type, type_label, institute_id, institute_name,
   venue, start_date, end_date, capacity, registered, description, meta, date_label, status, created_by) VALUES
  ('30000000-0000-0000-0000-000000000001', 'colombo-youth-mun-2026', 'Colombo Youth MUN 2026', 'SingleEvent', 'ModelUN',
   'Model United Nations', NULL, 'Diplomatic Impact', 'BMICH, Colombo',
   '2026-10-24', '2026-10-25', 72, 64,
   'Committees, country representation and performance feedback in one connected experience.',
   '4 committees · Registration open', '24 OCT', 'Published',
   (SELECT id FROM public.profiles WHERE email = 'perera@college.edu')),
  ('30000000-0000-0000-0000-000000000002', 'right-vs-might', 'Right vs Might', 'SingleEvent', 'FriendlyDebate',
   'Friendly Debate', NULL, 'Diplomatic Impact', 'Auditorium, Colombo',
   '2026-11-02', '2026-11-02', 32, 0,
   'Practice structured argument, counter-arguments, clarity and confident delivery.',
   '2 sessions · 32 participants', '02 NOV', 'UnderReview',
   (SELECT id FROM public.profiles WHERE email = 'perera@college.edu')),
  ('30000000-0000-0000-0000-000000000003', 'academic-speaking-cohort-03', 'Academic Speaking — Cohort 03', 'ContinuousProgramme', NULL,
   'Continuous Programme', NULL, 'Diplomatic Impact', 'Weekly sessions · Colombo + online',
   '2026-11-08', '2026-12-20', 24, 18,
   'Follow improvement across multiple sessions with longitudinal performance insights.',
   '6 weekly sessions · Limited places', '08 NOV', 'InProgress',
   (SELECT id FROM public.profiles WHERE email = 'perera@college.edu')),
  ('30000000-0000-0000-0000-000000000004', 'national-oratory-challenge', 'National Oratory Challenge', 'SingleEvent', 'Competition',
   'Competition', NULL, 'Diplomatic Impact', 'National Theatre, Colombo',
   '2026-11-18', '2026-11-18', 60, 41,
   'Individual oratory category for ages 15–19 with structured evaluator feedback.',
   'Individual category · Ages 15–19', '18 NOV', 'Published',
   (SELECT id FROM public.profiles WHERE email = 'perera@college.edu'))
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- 3 sessions
INSERT INTO public.sessions (id, slug, program_id, title, topic, date, venue) VALUES
  ('40000000-0000-0000-0000-000000000001', 'who-committee',
   (SELECT id FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
   'WHO Committee', 'Global health preparedness', '2026-10-24', 'BMICH, Colombo'),
  ('40000000-0000-0000-0000-000000000002', 'session-06-final-presentations',
   (SELECT id FROM public.programs WHERE slug = 'academic-speaking-cohort-03'),
   'Session 06 · Final presentations', 'Persuasive structure', '2026-12-13', 'Colombo + online'),
  ('40000000-0000-0000-0000-000000000003', 'session-02-motions-night',
   (SELECT id FROM public.programs WHERE slug = 'right-vs-might'),
   'Session 02 · Motions night', 'Right vs Might', '2026-11-02', 'Auditorium')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------- evaluator assignments
INSERT INTO public.program_evaluators (program_id, session_id, evaluator_id, access) VALUES
  ((SELECT id FROM public.programs WHERE slug = 'academic-speaking-cohort-03'),
   (SELECT id FROM public.sessions WHERE slug = 'session-06-final-presentations'),
   (SELECT id FROM public.profiles WHERE email = 'drj@example.com'), 'Active'),
  ((SELECT id FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
   (SELECT id FROM public.sessions WHERE slug = 'who-committee'),
   (SELECT id FROM public.profiles WHERE email = 'perera@college.edu'), 'Scheduled')
ON CONFLICT (session_id, evaluator_id) DO NOTHING;

-- ------------------------------------------------------------ 2 registrations
-- (mockRegistrations r-1 + r-2, both for Nimuthu Fernando / EM-00124)
INSERT INTO public.registrations
  (id, student_id, program_id, session_id, allocation, status, evaluation_state, when_label) VALUES
  ('50000000-0000-0000-0000-000000000001',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
   (SELECT id FROM public.sessions WHERE slug = 'who-committee'),
   'WHO Committee · Japan · BMICH, Colombo', 'Confirmed', 'Submitted', '24 OCT · 09:00'),
  ('50000000-0000-0000-0000-000000000002',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.programs WHERE slug = 'academic-speaking-cohort-03'),
   NULL, 'Session 01 · Online', 'Pending', 'NotStarted', '08 NOV · 16:00')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------- evaluations e-1 + e-2
INSERT INTO public.evaluations
  (id, slug, student_id, program_id, session_id, evaluator_id, state, released, released_at, remarks) VALUES
  ('60000000-0000-0000-0000-000000000001', 'e-1',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.programs WHERE slug = 'academic-speaking-cohort-03'),
   (SELECT id FROM public.sessions WHERE slug = 'session-06-final-presentations'),
   (SELECT id FROM public.profiles WHERE email = 'drj@example.com'),
   'Locked', true, '2026-09-17T10:00:00+00',
   'Strong structure and clear opening. The main development area is responding to counter-arguments without losing focus.'),
  ('60000000-0000-0000-0000-000000000002', 'e-2',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
   (SELECT id FROM public.sessions WHERE slug = 'who-committee'),
   (SELECT id FROM public.profiles WHERE email = 'drj@example.com'),
   'Submitted', false, NULL, '')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------- e-1 scores: numeric 5->E, 4->VG, 3->G ---
INSERT INTO public.evaluation_scores (evaluation_id, criterion_key, level, points) VALUES
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'preparation',    'E',  3),
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'clarity',        'VG', 2),
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'confidence',     'VG', 2),
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'vocal-delivery', 'G',  1),
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'counter',        'G',  1),
  ((SELECT id FROM public.evaluations WHERE slug = 'e-1'), 'overall',        'VG', 2)
ON CONFLICT (evaluation_id, criterion_key) DO NOTHING;

-- ------------------------------------------------------- active rubric (v1) -
INSERT INTO public.evaluation_templates (version, criteria, scale_map, is_active) VALUES
  ('v1',
   '[{"key":"preparation","label":"Preparation","help":"Evidence of research and readiness."},'
   || '{"key":"clarity","label":"Clarity","help":"Ideas expressed in a clear, ordered way."},'
   || '{"key":"confidence","label":"Confidence","help":"Composure and self-assurance when speaking."},'
   || '{"key":"focus","label":"Focus","help":"Stays on motion, topic, and time."},'
   || '{"key":"critical-analysis","label":"Critical Analysis","help":"Depth of reasoning and use of evidence."},'
   || '{"key":"vocal-delivery","label":"Vocal Delivery","help":"Volume, pace and projection across the room."},'
   || '{"key":"audience","label":"Audience Addressing","help":"Engages and addresses the audience or committee."},'
   || '{"key":"counter","label":"Counter Arguments","help":"Responds to opposing points directly."},'
   || '{"key":"wit","label":"Wit","help":"Timely, appropriate sharpness."},'
   || '{"key":"overall","label":"Overall Performance","help":"Holistic impression for this session."}]',
   '{"L":0,"G":1,"VG":2,"E":3,"baseline":50}',
   true)
ON CONFLICT (version) DO NOTHING;

-- -------------------------------------------------------- 3 recommendations
INSERT INTO public.recommendations
  (id, student_id, audience, title, body, skill, related, priority, status, created_by, created_at) VALUES
  ('70000000-0000-0000-0000-000000000001',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   'Student', 'Practice structured rebuttals',
   'Use the Claim → Evidence → Impact structure for three sample motions. This will directly strengthen the area identified in your last two debate evaluations.',
   'Counter Arguments', 'Related to Friendly Debate', 'High priority', 'New',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'), '2026-09-18T09:00:00+00'),
  ('70000000-0000-0000-0000-000000000002',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   'Student', 'Slow the opening 30 seconds',
   'Your strongest ideas land more clearly when the introduction is deliberate. Rehearse with a timer before the next Academic Speaking session.',
   'Clarity', 'Related to Session 05', 'In progress', 'Viewed',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'), '2026-09-06T09:00:00+00'),
  ('70000000-0000-0000-0000-000000000003',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   'Student', 'Use a one-page preparation map',
   'Create a concise outline before each event: objective, three core arguments, evidence and likely counterpoints.',
   'Preparation', '', 'Complete', 'Completed',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'), '2026-08-22T09:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------- 3 announcements
INSERT INTO public.announcements
  (id, title, body, sender, audience, program_id, status, publish_date, created_by) VALUES
  ('80000000-0000-0000-0000-000000000001', 'Country allocations are now confirmed',
   'Students registered for Colombo Youth MUN can now view their committee and country allocation.',
   'Diplomatic Impact', 'MUN participants',
   (SELECT id FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
   'Published', '2026-09-18T09:00:00+00',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org')),
  ('80000000-0000-0000-0000-000000000002', 'Academic Speaking session moved online',
   'Session 06 will take place online at the same scheduled time. The joining link is inside your registration.',
   'Programme team', 'Cohort 03',
   (SELECT id FROM public.programs WHERE slug = 'academic-speaking-cohort-03'),
   'Published', '2026-09-16T09:00:00+00',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org')),
  ('80000000-0000-0000-0000-000000000003', 'Performance reports for August are available',
   'Released evaluations and updated insights are now visible on your Performance page.',
   'Diplomatic Impact', 'All students', NULL,
   'Published', '2026-09-10T09:00:00+00',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'))
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------ 3 threads ----
INSERT INTO public.message_threads
  (id, subject, student_id, created_by, state, preview, created_at, updated_at) VALUES
  ('90000000-0000-0000-0000-000000000001', 'Follow-up on October programme',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.profiles WHERE email = 's.fernando@example.com'),
   'Replied', 'We have replied to your question about the upcoming Model UN programme.',
   '2026-09-18T09:42:00+00', '2026-09-18T14:10:00+00'),
  ('90000000-0000-0000-0000-000000000002', 'Request to update institute details',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.profiles WHERE email = 's.fernando@example.com'),
   'Open', 'Please update Nimuthu’s institute information before the next event.',
   '2026-09-12T11:05:00+00', '2026-09-12T11:05:00+00'),
  ('90000000-0000-0000-0000-000000000003', 'Parent profile verification',
   (SELECT id FROM public.profiles WHERE email = 'nimuthu@example.com'),
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'),
   'Closed', 'Your parent profile and student link have been verified.',
   '2026-08-22T10:00:00+00', '2026-08-22T10:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------- + 1 reply
INSERT INTO public.message_replies (id, thread_id, author_id, author_name, body, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000001',
   (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'),
   'Diplomatic Impact',
   'Yes. One parent or guardian may attend the opening ceremony. We will send the venue access information three days before the event.',
   '2026-09-18T14:10:00+00')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------- 3 audit ---
-- audit_log has no unique key by design; guard with WHERE NOT EXISTS instead.
INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta, created_at)
SELECT (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'),
       'program.published', 'program',
       (SELECT id::text FROM public.programs WHERE slug = 'colombo-youth-mun-2026'),
       '{"from":"Approved","to":"Published","note":"seed: pilot catalogue"}',
       '2026-09-15T09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'program.published' AND entity = 'program'
                    AND entity_id = (SELECT id::text FROM public.programs WHERE slug = 'colombo-youth-mun-2026'));

INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta, created_at)
SELECT (SELECT id FROM public.profiles WHERE email = 'admin@diplomaticimpact.org'),
       'evaluation.released', 'evaluation',
       (SELECT id::text FROM public.evaluations WHERE slug = 'e-1'),
       '{"session":"Session 06 · Final presentations","count":1}',
       '2026-09-17T10:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'evaluation.released' AND entity = 'evaluation'
                    AND entity_id = (SELECT id::text FROM public.evaluations WHERE slug = 'e-1'));

INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta, created_at)
SELECT (SELECT id FROM public.profiles WHERE email = 'perera@college.edu'),
       'registration.confirmed', 'registration', '50000000-0000-0000-0000-000000000001',
       '{"program":"colombo-youth-mun-2026","allocation":"WHO Committee · Japan"}',
       '2026-09-14T09:00:00+00'
WHERE NOT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'registration.confirmed' AND entity = 'registration'
                    AND entity_id = '50000000-0000-0000-0000-000000000001');

-- --------------------------------- restore mock display counters (see note 8)
UPDATE public.programs SET registered = 64, updated_at = now() WHERE slug = 'colombo-youth-mun-2026';
UPDATE public.programs SET registered = 0,  updated_at = now() WHERE slug = 'right-vs-might';
UPDATE public.programs SET registered = 18, updated_at = now() WHERE slug = 'academic-speaking-cohort-03';
UPDATE public.programs SET registered = 41, updated_at = now() WHERE slug = 'national-oratory-challenge';
